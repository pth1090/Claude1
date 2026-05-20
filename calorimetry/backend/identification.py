"""
System identification: fit 2-state nonlinear model parameters from calibration data.
Uses a two-stage optimizer (L-BFGS-B → Nelder-Mead) as described in the plan.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, Callable
import numpy as np
from scipy.optimize import minimize

from models import ModelParams, SimulationResult, simulate, Cr, UA_rj


# ── Physical parameter bounds ─────────────────────────────────────────────────
PARAM_BOUNDS = [
    (500.0,   50000.0),   # ca0  J/K
    (-100.0,   100.0),    # ca1  J/K²
    (100.0,   20000.0),   # Cj   J/K
    (1.0,     2000.0),    # ka0  W/K
    (-50.0,    50.0),     # ka1  W/K²
    (-50.0,    50.0),     # ka2  W/K²
    (0.1,     100.0),     # ka3  W/K
]

INITIAL_GUESS = np.array([5000.0, 0.0, 1000.0, 200.0, 0.0, 0.0, 5.0])


@dataclass
class FitResult:
    params: ModelParams
    nrmse_Tr: float
    nrmse_Tj: float
    loss: float
    n_evals: int
    success: bool
    message: str
    sim_result: SimulationResult


def _nrmse(sim: np.ndarray, meas: np.ndarray) -> float:
    rng = float(meas.max() - meas.min())
    if rng < 1e-6:
        return 0.0
    return float(np.sqrt(np.mean((sim - meas) ** 2)) / rng)


def _soft_penalty(arr: np.ndarray, t_meas: np.ndarray, T_r_meas: np.ndarray,
                  T_j_meas: np.ndarray) -> float:
    """Penalty if C_r or UA_rj become non-physical within the data range."""
    ca0, ca1, _, ka0, ka1, ka2, _ = arr

    Tr_min, Tr_max = T_r_meas.min(), T_r_meas.max()
    Tj_min, Tj_max = T_j_meas.min(), T_j_meas.max()

    # C_r must be > 100 J/K at all measured T_r values
    min_Cr = min(ca0 + ca1 * Tr_min, ca0 + ca1 * Tr_max)
    penalty_Cr = max(0.0, 100.0 - min_Cr)

    # UA_rj must be > 0 at all corner combinations
    corners = [
        ka0 + ka1 * Tr + ka2 * Tj
        for Tr in (Tr_min, Tr_max)
        for Tj in (Tj_min, Tj_max)
    ]
    penalty_UA = max(0.0, -min(corners))

    return 1e6 * (penalty_Cr + penalty_UA)


def build_objective(
    t_meas: np.ndarray,
    T_r_meas: np.ndarray,
    T_j_meas: np.ndarray,
    inputs: dict,
    Q_stir: float,
    weights: tuple[float, float] = (2.0, 1.0),
) -> Callable[[np.ndarray], float]:
    """Return a scalar loss function over the 7-element parameter array."""
    eval_count = [0]

    def objective(arr: np.ndarray) -> float:
        eval_count[0] += 1
        params = ModelParams.from_array(arr, Q_stir=Q_stir)
        penalty = _soft_penalty(arr, t_meas, T_r_meas, T_j_meas)
        if penalty > 0:
            return penalty

        res = simulate(params, t_meas, T_r_meas, T_j_meas, inputs, tight_tol=True)
        if not res.success:
            return np.inf

        loss = weights[0] * _nrmse(res.T_r_sim, T_r_meas) + \
               weights[1] * _nrmse(res.T_j_sim, T_j_meas)
        return float(loss)

    objective._eval_count = eval_count
    return objective


def fit_parameters(
    t_meas: np.ndarray,
    T_r_meas: np.ndarray,
    T_j_meas: np.ndarray,
    inputs: dict,
    Q_stir: float = 0.0,
    initial_params: Optional[ModelParams] = None,
    weights: tuple[float, float] = (2.0, 1.0),
    n_restarts: int = 1,
) -> FitResult:
    """
    Two-stage parameter fitting:
      Stage 1: L-BFGS-B (gradient-based, respects bounds, fast convergence)
      Stage 2: Nelder-Mead refinement from best Stage-1 result
    """
    x0 = initial_params.to_array() if initial_params is not None else INITIAL_GUESS.copy()
    objective = build_objective(t_meas, T_r_meas, T_j_meas, inputs, Q_stir, weights)

    best_loss = np.inf
    best_x = x0.copy()

    # Build starting points: provided x0 + random restarts
    starts = [x0]
    if n_restarts > 1:
        rng = np.random.default_rng(42)
        for _ in range(n_restarts - 1):
            sample = np.array([
                rng.uniform(lo, hi) for lo, hi in PARAM_BOUNDS
            ])
            starts.append(sample)

    # Stage 1: L-BFGS-B for each starting point
    for x_start in starts:
        res1 = minimize(
            objective,
            x_start,
            method="L-BFGS-B",
            bounds=PARAM_BOUNDS,
            options={
                "maxiter": 500,
                "ftol": 1e-12,
                "gtol": 1e-8,
                "maxfun": 5000,
                "eps": 1e-5,
            },
        )
        if res1.fun < best_loss:
            best_loss = float(res1.fun)
            best_x = res1.x.copy()

    # Stage 2: Nelder-Mead refinement (derivative-free, polishes the minimum)
    res2 = minimize(
        objective,
        best_x,
        method="Nelder-Mead",
        options={
            "xatol": 1e-8,
            "fatol": 1e-10,
            "maxiter": 2000,
            "adaptive": True,
        },
    )

    final_x = res2.x
    # Re-clip to physical bounds to guard against Nelder-Mead boundary drift
    for i, (lo, hi) in enumerate(PARAM_BOUNDS):
        final_x[i] = float(np.clip(final_x[i], lo, hi))

    final_params = ModelParams.from_array(final_x, Q_stir=Q_stir)

    # Final simulation at best parameters
    sim = simulate(final_params, t_meas, T_r_meas, T_j_meas, inputs, tight_tol=True)
    nrmse_Tr = _nrmse(sim.T_r_sim, T_r_meas) if sim.success else np.nan
    nrmse_Tj = _nrmse(sim.T_j_sim, T_j_meas) if sim.success else np.nan
    final_loss = float(res2.fun)

    n_evals = objective._eval_count[0]

    return FitResult(
        params=final_params,
        nrmse_Tr=float(nrmse_Tr),
        nrmse_Tj=float(nrmse_Tj),
        loss=final_loss,
        n_evals=n_evals,
        success=sim.success,
        message=res2.message,
        sim_result=sim,
    )

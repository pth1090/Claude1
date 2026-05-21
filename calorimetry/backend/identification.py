"""
System identification for double-jacket batch reactor calorimetry.

When T_jin, T_jout, and flow rate are all measured (full dataset), the jacket
heat Q_jacket = mdot*cp*(T_jin - T_jout) is a directly measured input.
This reduces the identification problem to 3 well-conditioned parameters:
  ca0, ca1  — reactor heat capacity  C_r(T_r) = ca0 + ca1*T_r
  ka3       — ambient heat loss coefficient

1-State ODE (calibration, Q_rxn = 0):
  C_r(T_r) * dT_r/dt = Q_stir + Q_jacket(t) + ka3*(T_amb - T_r) + Q_calib(t)

All parameters normalized to [0,1] so L-BFGS-B eps works uniformly across scales.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, Callable
import numpy as np
from scipy.optimize import minimize
from scipy.integrate import solve_ivp

from models import ModelParams, SimulationResult, simulate


# ── 3-parameter bounds (ca0, ca1, ka3) ───────────────────────────────────────
PARAM_BOUNDS_1S = np.array([
    [200.0,  50000.0],   # ca0  J/K
    [-100.0,   100.0],   # ca1  J/K²
    [0.01,    100.0],    # ka3  W/K
])
LO_1S  = PARAM_BOUNDS_1S[:, 0]
HI_1S  = PARAM_BOUNDS_1S[:, 1]
RNG_1S = HI_1S - LO_1S

INITIAL_GUESS_1S = np.array([5000.0, 0.0, 5.0])

# Legacy 7-parameter bounds (kept for API compatibility)
PARAM_BOUNDS = [tuple(b) for b in [
    [200.0,   50000.0],
    [-100.0,   100.0],
    [50.0,    20000.0],
    [1.0,     2000.0],
    [-50.0,    50.0],
    [-50.0,    50.0],
    [0.01,    100.0],
]]
INITIAL_GUESS = np.array([5000.0, 0.0, 1000.0, 200.0, 0.0, 0.0, 5.0])

_FIT_POINTS = 60


@dataclass
class FitResult:
    params: ModelParams
    nrmse_Tr: float
    nrmse_Tj: float       # None for 1-state fit
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


def _downsample_idx(n: int, n_target: int) -> np.ndarray:
    step = max(1, n // n_target)
    idx = np.arange(0, n, step)
    if idx[-1] != n - 1:
        idx = np.append(idx, n - 1)
    return idx


# ── 1-State ODE ───────────────────────────────────────────────────────────────

def _ode_1state(t, y, t_data, T_amb_d, Q_jacket_d, Q_calib_d, ca0, ca1, ka3, Q_stir):
    T_r    = y[0]
    T_amb  = float(np.interp(t, t_data, T_amb_d))
    Q_jac  = float(np.interp(t, t_data, Q_jacket_d))
    Q_cal  = float(np.interp(t, t_data, Q_calib_d))
    Cr     = max(ca0 + ca1 * T_r, 1.0)
    dTr    = (Q_stir + Q_jac + ka3 * (T_amb - T_r) + Q_cal) / Cr
    return [dTr]


def _sim_1state(ca0, ca1, ka3, Q_stir,
                t_eval, T_r0,
                t_full, T_amb, Q_jacket, Q_calib,
                max_step: float):
    try:
        sol = solve_ivp(
            _ode_1state,
            (float(t_full[0]), float(t_full[-1])),
            [float(T_r0)],
            method="Radau",
            t_eval=t_eval,
            args=(t_full, T_amb, Q_jacket, Q_calib, ca0, ca1, ka3, Q_stir),
            rtol=1e-4,
            atol=1e-6,
            max_step=max_step,
            dense_output=False,
        )
        if sol.status != 0:
            return None
        return sol.y[0]
    except Exception:
        return None


def fit_parameters(
    t_meas: np.ndarray,
    T_r_meas: np.ndarray,
    T_j_meas: np.ndarray,       # T_jout (used only to build Q_jacket)
    inputs: dict,
    Q_stir: float = 0.0,
    initial_params: Optional[ModelParams] = None,
    weights: tuple[float, float] = (2.0, 1.0),
    n_restarts: int = 1,
) -> FitResult:
    """
    Fit ca0, ca1, ka3 using the 1-state ODE model.
    Q_jacket is computed from measured T_jin, T_jout, and mdot_cpf.
    T_j_meas is passed for API compatibility but not used for fitting T_j.
    """
    # Compute measured jacket heat transfer [W]: positive = heat INTO reactor
    Q_jacket = inputs["mdot_cpf"] * (inputs["T_jin"] - T_j_meas)

    n = len(t_meas)
    idx_ds   = _downsample_idx(n, _FIT_POINTS)
    t_ds     = t_meas[idx_ds]
    T_r_ds   = T_r_meas[idx_ds]

    dt_orig  = float(np.median(np.diff(t_meas)))
    max_step = min(dt_orig * 5, 60.0)

    Tr_min, Tr_max = T_r_meas.min(), T_r_meas.max()

    # Initial guess
    if initial_params is not None:
        x0 = np.array([initial_params.ca0, initial_params.ca1, initial_params.ka3])
    else:
        x0 = INITIAL_GUESS_1S.copy()
    x0 = np.clip(x0, LO_1S, HI_1S)
    u0 = (x0 - LO_1S) / RNG_1S   # normalize to [0,1]

    eval_count = [0]

    def objective(u: np.ndarray) -> float:
        eval_count[0] += 1
        x = LO_1S + u * RNG_1S
        ca0_, ca1_, ka3_ = x

        # Physical constraint: C_r > 0 in data range
        min_Cr = min(ca0_ + ca1_ * Tr_min, ca0_ + ca1_ * Tr_max)
        if min_Cr < 50.0:
            return 1.0

        T_r_sim = _sim_1state(
            ca0_, ca1_, ka3_, Q_stir,
            t_ds, T_r_meas[0],
            t_meas, inputs["T_amb"], Q_jacket, inputs["Q_calib"],
            max_step)

        if T_r_sim is None:
            return 1.0

        return _nrmse(T_r_sim, T_r_ds)

    best_loss = np.inf
    best_u    = u0.copy()
    best_msg  = "not started"

    starts = [u0]
    if n_restarts > 1:
        rng = np.random.default_rng(42)
        for _ in range(n_restarts - 1):
            starts.append(rng.uniform(0.0, 1.0, size=3))

    for u_start in starts:
        res = minimize(
            objective,
            u_start,
            method="L-BFGS-B",
            bounds=[(0.0, 1.0)] * 3,
            options={
                "maxiter": 400,
                "ftol": 1e-12,
                "gtol": 1e-8,
                "maxfun": 3000,
                "eps": 1e-2,
            },
        )
        if res.fun < best_loss:
            best_loss = float(res.fun)
            best_u    = res.x.copy()
            best_msg  = res.message

    best_u = np.clip(best_u, 0.0, 1.0)
    x_best = LO_1S + best_u * RNG_1S
    ca0_f, ca1_f, ka3_f = x_best

    # Build ModelParams — set ka0 large (jacket dominated by flow, not UA)
    # and Cj=1000 as placeholder (not used in 1-state analysis)
    final_params = ModelParams(
        ca0=float(ca0_f), ca1=float(ca1_f), Cj=1000.0,
        ka0=1000.0, ka1=0.0, ka2=0.0,
        ka3=float(ka3_f), Q_stir=Q_stir,
    )

    # Final T_r simulation at full resolution (tight tol)
    try:
        from scipy.integrate import solve_ivp as _solvp
        sol_final = _solvp(
            _ode_1state,
            (float(t_meas[0]), float(t_meas[-1])),
            [float(T_r_meas[0])],
            method="Radau",
            t_eval=t_meas,
            args=(t_meas, inputs["T_amb"], Q_jacket, inputs["Q_calib"],
                  ca0_f, ca1_f, ka3_f, Q_stir),
            rtol=1e-6, atol=1e-8,
            max_step=dt_orig * 2,
        )
        sim_ok = sol_final.status == 0
        T_r_sim_full = sol_final.y[0] if sim_ok else np.full_like(t_meas, np.nan)
    except Exception:
        sim_ok = False
        T_r_sim_full = np.full_like(t_meas, np.nan)

    nrmse_Tr = _nrmse(T_r_sim_full, T_r_meas) if sim_ok else np.nan

    # Build SimulationResult (T_j_sim = measured T_jout for plot purposes)
    from models import SimulationResult
    sim_result = SimulationResult(
        t=t_meas,
        T_r_sim=T_r_sim_full,
        T_j_sim=T_j_meas,
        residuals_Tr=T_r_sim_full - T_r_meas if sim_ok else np.full_like(t_meas, np.nan),
        residuals_Tj=np.zeros_like(t_meas),
        success=sim_ok,
    )

    return FitResult(
        params=final_params,
        nrmse_Tr=float(nrmse_Tr),
        nrmse_Tj=float(0.0),
        loss=best_loss,
        n_evals=eval_count[0],
        success=sim_ok,
        message=best_msg,
        sim_result=sim_result,
    )

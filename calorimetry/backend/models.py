"""
2-State nonlinear lumped-element ODE model for double-jacket batch reactor calorimetry.
Based on MacLeod et al. 2018 (arXiv 1808.04518).
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional
import numpy as np
from scipy.integrate import solve_ivp


@dataclass
class ModelParams:
    """Identifiable parameters for the 2-state nonlinear model."""
    ca0: float   # J/K   constant term in C_r(T_r)
    ca1: float   # J/K²  temperature-dependent term in C_r
    Cj: float    # J/K   jacket heat capacity (constant)
    ka0: float   # W/K   constant term in UA_rj
    ka1: float   # W/K²  T_r-dependent term in UA_rj
    ka2: float   # W/K²  T_j-dependent term in UA_rj
    ka3: float   # W/K   UA_loss (reactor to ambient)
    Q_stir: float = 0.0  # W  stirrer power (constant)

    def to_array(self) -> np.ndarray:
        return np.array([self.ca0, self.ca1, self.Cj,
                         self.ka0, self.ka1, self.ka2, self.ka3])

    @classmethod
    def from_array(cls, arr: np.ndarray, Q_stir: float = 0.0) -> "ModelParams":
        return cls(
            ca0=float(arr[0]), ca1=float(arr[1]), Cj=float(arr[2]),
            ka0=float(arr[3]), ka1=float(arr[4]), ka2=float(arr[5]),
            ka3=float(arr[6]), Q_stir=Q_stir,
        )

    def to_dict(self) -> dict:
        return {
            "ca0": self.ca0, "ca1": self.ca1, "Cj": self.Cj,
            "ka0": self.ka0, "ka1": self.ka1, "ka2": self.ka2,
            "ka3": self.ka3, "Q_stir": self.Q_stir,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ModelParams":
        return cls(**{k: float(v) for k, v in d.items()})


@dataclass
class SimulationResult:
    t: np.ndarray
    T_r_sim: np.ndarray
    T_j_sim: np.ndarray
    residuals_Tr: np.ndarray
    residuals_Tj: np.ndarray
    success: bool


def Cr(T_r: float | np.ndarray, ca0: float, ca1: float) -> float | np.ndarray:
    """Nonlinear reactor thermal capacitance [J/K]."""
    return ca0 + ca1 * T_r


def UA_rj(T_r: float | np.ndarray, T_j: float | np.ndarray,
          ka0: float, ka1: float, ka2: float) -> float | np.ndarray:
    """Nonlinear reactor-jacket overall heat transfer [W/K]."""
    return ka0 + ka1 * T_r + ka2 * T_j


def ode_rhs(
    t: float,
    y: list,
    t_data: np.ndarray,
    T_jin_data: np.ndarray,
    T_amb_data: np.ndarray,
    mdot_cpf_data: np.ndarray,
    Q_calib_data: np.ndarray,
    Q_rxn_data: np.ndarray,
    params: ModelParams,
) -> list:
    """RHS of the 2-state ODE system. All time-varying inputs interpolated at t."""
    T_r, T_j = y[0], y[1]

    T_jin   = float(np.interp(t, t_data, T_jin_data))
    T_amb   = float(np.interp(t, t_data, T_amb_data))
    mdot_cp = float(np.interp(t, t_data, mdot_cpf_data))
    Q_cal   = float(np.interp(t, t_data, Q_calib_data))
    Q_rxn   = float(np.interp(t, t_data, Q_rxn_data))

    cr   = max(Cr(T_r, params.ca0, params.ca1), 1.0)
    ua   = max(UA_rj(T_r, T_j, params.ka0, params.ka1, params.ka2), 0.0)
    cj   = max(params.Cj, 1.0)

    dTr_dt = (Q_rxn + params.Q_stir + ua * (T_j - T_r)
              + params.ka3 * (T_amb - T_r) + Q_cal) / cr
    dTj_dt = (mdot_cp * (T_jin - T_j) + ua * (T_r - T_j)) / cj

    return [dTr_dt, dTj_dt]


def simulate(
    params: ModelParams,
    t_meas: np.ndarray,
    T_r_meas: np.ndarray,
    T_j_meas: np.ndarray,
    inputs: dict,
    Q_rxn_data: Optional[np.ndarray] = None,
    tight_tol: bool = True,
) -> SimulationResult:
    """
    Integrate the 2-state ODE and return simulated temperatures aligned to t_meas.

    inputs must contain: T_jin, T_amb, mdot_cpf, Q_calib (all 1-D arrays same length as t_meas).
    """
    if Q_rxn_data is None:
        Q_rxn_data = np.zeros_like(t_meas)

    dt_min = float(np.min(np.diff(t_meas))) if len(t_meas) > 1 else 1.0
    rtol, atol = (1e-6, 1e-8) if tight_tol else (1e-4, 1e-6)

    y0 = [float(T_r_meas[0]), float(T_j_meas[0])]

    try:
        sol = solve_ivp(
            fun=ode_rhs,
            t_span=(float(t_meas[0]), float(t_meas[-1])),
            y0=y0,
            method="Radau",
            t_eval=t_meas,
            args=(
                t_meas,
                inputs["T_jin"],
                inputs["T_amb"],
                inputs["mdot_cpf"],
                inputs["Q_calib"],
                Q_rxn_data,
                params,
            ),
            rtol=rtol,
            atol=atol,
            max_step=dt_min * 10,
            dense_output=False,
        )
        success = sol.status == 0
    except Exception:
        success = False

    if not success:
        nan = np.full_like(t_meas, np.nan)
        return SimulationResult(t_meas, nan, nan, nan, nan, False)

    T_r_sim = sol.y[0]
    T_j_sim = sol.y[1]
    return SimulationResult(
        t=t_meas,
        T_r_sim=T_r_sim,
        T_j_sim=T_j_sim,
        residuals_Tr=T_r_sim - T_r_meas,
        residuals_Tj=T_j_sim - T_j_meas,
        success=True,
    )

"""
FastAPI application for double-jacket batch reactor calorimetric analysis.
"""
from __future__ import annotations
import asyncio
import io
import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, Form, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from models import ModelParams, simulate
from identification import fit_parameters, FitResult
from analysis import infer_Q_rxn_pointwise, direct_heat_balance, compute_metrics


# ── Column alias resolution ───────────────────────────────────────────────────

COLUMN_ALIASES: dict[str, list[str]] = {
    "time_s":     ["t", "time", "Time_s", "Zeit_s", "Zeit"],
    "T_r":        ["T_reactor", "Tr", "T_reaktor", "T_Reaktor"],
    "T_jin":      ["T_jacket_in", "Tjin", "T_mantel_ein", "T_ein"],
    "T_jout":     ["T_jacket_out", "Tjout", "T_mantel_aus", "T_aus"],
    "T_amb":      ["T_ambient", "Tamb", "T_umgebung", "T_Umgebung"],
    "flow_kg_s":  ["mdot", "flow_rate", "Massenstrom_kg_s"],
    "flow_L_min": ["volume_flow_L_min", "Volumenstrom_L_min", "V_dot"],
    "Q_calib_W":  ["Q_calib", "P_calib", "Q_electrical", "Q_el", "P_el"],
}


def _resolve_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename detected alias columns to canonical names."""
    rename_map: dict[str, str] = {}
    lower_cols = {c.lower(): c for c in df.columns}
    for canonical, aliases in COLUMN_ALIASES.items():
        if canonical.lower() in lower_cols:
            rename_map[lower_cols[canonical.lower()]] = canonical
            continue
        for alias in aliases:
            if alias.lower() in lower_cols:
                rename_map[lower_cols[alias.lower()]] = canonical
                break
    return df.rename(columns=rename_map)


def _parse_csv(content: bytes, cp_fluid: float, rho_fluid: float = 1000.0) -> pd.DataFrame:
    """Parse uploaded CSV, resolve columns, compute mdot_cpf."""
    df = pd.read_csv(io.BytesIO(content))
    df = _resolve_columns(df)

    # Convert L/min to kg/s if needed
    if "flow_L_min" in df.columns and "flow_kg_s" not in df.columns:
        df["flow_kg_s"] = df["flow_L_min"] / 60.0 / 1000.0 * rho_fluid

    # Compute m_dot * cp_fluid [W/K]
    if "flow_kg_s" in df.columns:
        df["mdot_cpf"] = df["flow_kg_s"] * cp_fluid
    else:
        df["mdot_cpf"] = 0.0

    # Fill missing Q_calib with zeros
    if "Q_calib_W" not in df.columns:
        df["Q_calib_W"] = 0.0

    # Fill missing T_amb with NaN → will be replaced by T_r mean later
    if "T_amb" not in df.columns:
        df["T_amb"] = np.nan

    # Drop rows with NaN in required columns
    required = ["time_s", "T_r", "T_jin", "T_jout"]
    for col in required:
        if col not in df.columns:
            raise ValueError(f"Required column '{col}' not found. "
                             f"Available: {list(df.columns)}")
    before = len(df)
    df = df.dropna(subset=required)
    if len(df) < before:
        pass  # silently dropped; reported in preview

    # Fill T_amb NaN with T_r mean (reasonable fallback)
    if df["T_amb"].isna().any():
        df["T_amb"] = df["T_amb"].fillna(df["T_r"].mean())

    df = df.sort_values("time_s").reset_index(drop=True)
    return df


def _df_to_inputs(df: pd.DataFrame) -> dict:
    return {
        "T_jin":    df["T_jin"].to_numpy(dtype=float),
        "T_amb":    df["T_amb"].to_numpy(dtype=float),
        "mdot_cpf": df["mdot_cpf"].to_numpy(dtype=float),
        "Q_calib":  df["Q_calib_W"].to_numpy(dtype=float),
    }


# ── Session management ────────────────────────────────────────────────────────

@dataclass
class SessionData:
    calib_df: Optional[pd.DataFrame] = None
    fit_result: Optional[FitResult] = None
    experiment_df: Optional[pd.DataFrame] = None
    analysis_result: Optional[dict] = None
    Q_stir: float = 0.0
    created_at: datetime = field(default_factory=datetime.utcnow)

    def is_expired(self) -> bool:
        return datetime.utcnow() - self.created_at > timedelta(hours=2)


sessions: dict[str, SessionData] = {}
_executor = ThreadPoolExecutor(max_workers=4)


def _get_session(session_id: str) -> SessionData:
    s = sessions.get(session_id)
    if s is None or s.is_expired():
        raise HTTPException(status_code=404, detail="Session not found or expired")
    return s


async def _cleanup_sessions():
    while True:
        await asyncio.sleep(600)
        expired = [k for k, v in sessions.items() if v.is_expired()]
        for k in expired:
            del sessions[k]


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_cleanup_sessions())
    yield
    task.cancel()


# ── App setup ────────────────────────────────────────────────────────────────

app = FastAPI(title="Calorimetric Batch Reactor Analysis", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/ui", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


@app.get("/")
async def root():
    return RedirectResponse(url="/ui/index.html")


# ── Helper: numpy-safe JSON serialization ────────────────────────────────────

def _to_list(arr) -> list:
    if isinstance(arr, np.ndarray):
        return arr.tolist()
    return list(arr)


def _safe_float(v) -> float:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return float(v)


# ── Pydantic request models ───────────────────────────────────────────────────

class IdentifyRequest(BaseModel):
    session_id: str
    initial_params: Optional[dict] = None
    weights: list[float] = [2.0, 1.0]
    n_restarts: int = 1
    smoothing_window: int = 0
    Q_stir: Optional[float] = None  # overrides value from upload form if set


class AnalyzeRequest(BaseModel):
    session_id: str
    method: str = "ode"          # "ode" or "direct"
    smoothing_window: int = 11
    override_params: Optional[dict] = None


# ── API routes ────────────────────────────────────────────────────────────────

@app.post("/api/v1/session")
async def create_session():
    sid = str(uuid.uuid4())
    sessions[sid] = SessionData()
    return {"session_id": sid}


@app.delete("/api/v1/session/{session_id}")
async def delete_session(session_id: str):
    sessions.pop(session_id, None)
    return {"status": "deleted"}


@app.get("/api/v1/session/{session_id}/params")
async def get_params(session_id: str):
    s = _get_session(session_id)
    if s.fit_result is None:
        raise HTTPException(status_code=404, detail="No fitted parameters in session")
    return s.fit_result.params.to_dict()


async def _handle_upload(
    file: UploadFile,
    session_id: str,
    cp_fluid: float,
    Q_stir: float,
    which: str,
) -> dict:
    s = _get_session(session_id)
    content = await file.read()
    try:
        df = _parse_csv(content, cp_fluid=cp_fluid)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if which == "calibration":
        s.calib_df = df
        s.Q_stir = Q_stir
        s.fit_result = None
    else:
        s.experiment_df = df
        s.analysis_result = None

    preview = df.head(5).to_dict(orient="records")
    return {
        "n_rows": len(df),
        "t_start": float(df["time_s"].iloc[0]),
        "t_end":   float(df["time_s"].iloc[-1]),
        "columns_detected": list(df.columns),
        "preview": preview,
    }


@app.post("/api/v1/upload/calibration")
async def upload_calibration(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    cp_fluid: float = Form(4186.0),
    Q_stir: float = Form(0.0),
):
    return await _handle_upload(file, session_id, cp_fluid, Q_stir, "calibration")


@app.post("/api/v1/upload/experiment")
async def upload_experiment(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    cp_fluid: float = Form(4186.0),
    Q_stir: float = Form(0.0),
):
    return await _handle_upload(file, session_id, cp_fluid, Q_stir, "experiment")


@app.post("/api/v1/identify")
async def identify(req: IdentifyRequest):
    s = _get_session(req.session_id)
    if s.calib_df is None:
        raise HTTPException(status_code=400, detail="Upload calibration data first")

    df = s.calib_df
    t   = df["time_s"].to_numpy(dtype=float)
    T_r = df["T_r"].to_numpy(dtype=float)
    T_j = ((df["T_jin"] + df["T_jout"]) / 2.0).to_numpy(dtype=float)
    inputs = _df_to_inputs(df)

    init_params = (
        ModelParams.from_dict(req.initial_params)
        if req.initial_params else None
    )
    Q_stir = req.Q_stir if req.Q_stir is not None else s.Q_stir

    def _fit():
        return fit_parameters(
            t, T_r, T_j, inputs,
            Q_stir=Q_stir,
            initial_params=init_params,
            weights=tuple(req.weights),
            n_restarts=req.n_restarts,
        )

    loop = asyncio.get_event_loop()
    result: FitResult = await loop.run_in_executor(_executor, _fit)
    s.fit_result = result

    sim = result.sim_result
    return {
        "params": result.params.to_dict(),
        "nrmse_Tr": _safe_float(result.nrmse_Tr),
        "nrmse_Tj": _safe_float(result.nrmse_Tj),
        "loss": _safe_float(result.loss),
        "n_evals": result.n_evals,
        "success": result.success,
        "message": result.message,
        "timeseries": {
            "t":        _to_list(sim.t),
            "T_r_meas": _to_list(T_r),
            "T_r_sim":  _to_list(sim.T_r_sim),
            "T_j_meas": _to_list(T_j),
            "T_j_sim":  _to_list(sim.T_j_sim),
        },
    }


@app.post("/api/v1/analyze")
async def analyze(req: AnalyzeRequest):
    s = _get_session(req.session_id)
    if s.experiment_df is None:
        raise HTTPException(status_code=400, detail="Upload experiment data first")

    # Resolve parameters: override > session fitted > error
    if req.override_params:
        params = ModelParams.from_dict(req.override_params)
    elif s.fit_result is not None:
        params = s.fit_result.params
    else:
        raise HTTPException(
            status_code=400,
            detail="No fitted parameters available. Run identification first or provide override_params.",
        )

    df = s.experiment_df
    t      = df["time_s"].to_numpy(dtype=float)
    T_r    = df["T_r"].to_numpy(dtype=float)
    T_jout = df["T_jout"].to_numpy(dtype=float)
    T_jin  = df["T_jin"].to_numpy(dtype=float)
    T_j    = (T_jin + T_jout) / 2.0
    T_amb  = df["T_amb"].to_numpy(dtype=float)
    mdot   = df["mdot_cpf"].to_numpy(dtype=float)
    Q_cal  = df["Q_calib_W"].to_numpy(dtype=float)
    sw     = req.smoothing_window

    if req.method == "ode":
        Q_rxn = infer_Q_rxn_pointwise(
            t, T_r, T_j, T_amb, mdot, T_jin, Q_cal, params, smoothing_window=sw
        )
    elif req.method == "direct":
        Q_rxn = direct_heat_balance(
            t, T_r, T_jout, T_jin, T_amb, mdot,
            C_r_eff=params.ca0,
            UA_loss=params.ka3,
            Q_stir=params.Q_stir,
            Q_calib=Q_cal,
            smoothing_window=sw,
        )
    else:
        raise HTTPException(status_code=422, detail="method must be 'ode' or 'direct'")

    from scipy.integrate import cumulative_trapezoid
    cumulative = cumulative_trapezoid(Q_rxn, t, initial=0.0)
    metrics = compute_metrics(t, Q_rxn)

    result = {
        "method": req.method,
        "timeseries": {
            "t":              _to_list(t),
            "T_r_meas":       _to_list(T_r),
            "Q_rxn":          _to_list(Q_rxn),
            "Q_rxn_cumulative_kJ": _to_list(cumulative / 1000.0),
        },
        "metrics": {k: _safe_float(v) if v is not None else None for k, v in metrics.items()},
    }
    s.analysis_result = result
    return result

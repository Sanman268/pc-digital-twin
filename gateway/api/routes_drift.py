"""GET /api/drift — Stage 4 Phase 3 endpoint powering the per-chart drift
badge and the dashboard's header status pill.

Wraps the pure ``llm.drift.detect_drift`` helper. Unlike
``execute_detect_drift`` (which formats timestamps as local-no-tz strings
for the chat LLM), this endpoint returns tz-aware UTC ISO timestamps so
the frontend's ``new Date(...)`` parses them correctly. Infinite z-scores
(degenerate baselines where the historical stddev was zero) come back as
``null`` plus an ``is_infinite`` flag so JSON.parse on the frontend
doesn't trip over ``Infinity``.
"""

import math
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from influx.writer import query_history
from llm.drift import detect_drift
from llm.executor import METRIC_TO_FIELD, METRIC_TO_UNIT

router = APIRouter()

WINDOW_VALUES = {"1h", "6h", "24h", "7d"}


class DriftResponse(BaseModel):
    ok: bool
    metric: str
    field: str
    unit: str
    baseline_window: str
    reason: Optional[str] = None
    status: Optional[Literal["normal", "drifting", "fault"]] = None
    drift_score: Optional[float] = None
    drift_score_is_infinite: bool = False
    z_value: Optional[float] = None
    z_value_is_infinite: bool = False
    z_slope: Optional[float] = None
    z_slope_is_infinite: bool = False
    current_value: Optional[float] = None
    current_slope_per_hour: Optional[float] = None
    current_session_start: Optional[datetime] = None
    current_session_end: Optional[datetime] = None
    current_fit_point_count: Optional[int] = None
    baseline_value_mean: Optional[float] = None
    baseline_value_stddev: Optional[float] = None
    baseline_value_n: Optional[int] = None
    baseline_slope_mean: Optional[float] = None
    baseline_slope_stddev: Optional[float] = None
    baseline_session_count: Optional[int] = None
    baseline_span_start: Optional[datetime] = None
    baseline_span_end: Optional[datetime] = None


def _finite_or_flag(value: Optional[float]) -> tuple[Optional[float], bool]:
    """Return (json-safe value, is_infinite). NaN is treated as None too."""
    if value is None:
        return (None, False)
    if math.isinf(value):
        return (None, True)
    if math.isnan(value):
        return (None, False)
    return (value, False)


@router.get("", response_model=DriftResponse)
def drift_endpoint(
    metric: str = Query(
        ..., description="One of: temperature, humidity, pressure, vibration, light."
    ),
    baseline_window: str = Query(
        "7d",
        description=(
            "History range to build the baseline from: 1h / 6h / 24h / 7d. "
            "Everything except the trailing (active) session contributes to "
            "the baseline; that session is what gets scored."
        ),
    ),
) -> DriftResponse:
    if metric not in METRIC_TO_FIELD:
        raise HTTPException(
            status_code=400,
            detail=f"unknown metric '{metric}'; valid: {sorted(METRIC_TO_FIELD)}",
        )
    if baseline_window not in WINDOW_VALUES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"unknown baseline_window '{baseline_window}'; "
                f"valid: {sorted(WINDOW_VALUES)}"
            ),
        )

    field = METRIC_TO_FIELD[metric]
    raw = query_history(field=field, range_=baseline_window)
    result = detect_drift(raw)

    base: dict = {
        "metric": metric,
        "field": field,
        "unit": METRIC_TO_UNIT[metric],
        "baseline_window": baseline_window,
    }
    if not result.ok:
        return DriftResponse(
            ok=False,
            reason=result.reason,
            baseline_value_n=result.baseline_value_n,
            baseline_session_count=result.baseline_session_count,
            **base,
        )

    drift_score, drift_inf = _finite_or_flag(result.drift_score)
    z_value, z_value_inf = _finite_or_flag(result.z_value)
    z_slope, z_slope_inf = _finite_or_flag(result.z_slope)

    return DriftResponse(
        ok=True,
        status=result.status,
        drift_score=drift_score,
        drift_score_is_infinite=drift_inf,
        z_value=z_value,
        z_value_is_infinite=z_value_inf,
        z_slope=z_slope,
        z_slope_is_infinite=z_slope_inf,
        current_value=result.current_value,
        current_slope_per_hour=result.current_slope_per_hour,
        current_session_start=result.current_session_start,
        current_session_end=result.current_session_end,
        current_fit_point_count=result.current_fit_point_count,
        baseline_value_mean=result.baseline_value_mean,
        baseline_value_stddev=result.baseline_value_stddev,
        baseline_value_n=result.baseline_value_n,
        baseline_slope_mean=result.baseline_slope_mean,
        baseline_slope_stddev=result.baseline_slope_stddev,
        baseline_session_count=result.baseline_session_count,
        baseline_span_start=result.baseline_span_start,
        baseline_span_end=result.baseline_span_end,
        **base,
    )

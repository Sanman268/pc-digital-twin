"""GET /api/threshold — Stage 4 Phase 4C endpoint powering the
"predicted to cross X at ~HH:MM" badge on chart cards.

Wraps the pure ``llm.forecast.time_to_cross`` helper. Unlike
``execute_time_to_threshold`` (which formats timestamps as local-no-tz
strings for the chat LLM), this endpoint returns a tz-aware UTC ISO
``crossing_time`` so the frontend's ``new Date(...)`` parses it as a
real Date and can format it in the user's local zone.
"""

from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from influx.writer import query_history
from llm.executor import METRIC_TO_FIELD, METRIC_TO_UNIT
from llm.forecast import time_to_cross

router = APIRouter()

WINDOW_VALUES = {"1h", "6h", "24h", "7d"}


class ThresholdResponse(BaseModel):
    ok: bool
    metric: str
    field: str
    unit: str
    history_window: str
    threshold: float
    direction: Literal["above", "below"]
    reason: Optional[str] = None
    already_crossed: bool = False
    current_value: Optional[float] = None
    slope_per_hour: Optional[float] = None
    eta_minutes: Optional[float] = None
    crossing_time: Optional[datetime] = None
    fit_start: Optional[datetime] = None
    fit_end: Optional[datetime] = None
    fit_point_count: Optional[int] = None


@router.get("", response_model=ThresholdResponse)
def threshold_endpoint(
    metric: str = Query(
        ..., description="One of: temperature, humidity, pressure, vibration, light."
    ),
    threshold: float = Query(..., description="Target value in the metric's units."),
    direction: Literal["above", "below"] = Query(
        ...,
        description="'above' = when will the value rise to threshold; 'below' = fall to.",
    ),
    history_window: str = Query(
        "1h", description="History range to fit on: 1h / 6h / 24h / 7d."
    ),
) -> ThresholdResponse:
    if metric not in METRIC_TO_FIELD:
        raise HTTPException(
            status_code=400,
            detail=f"unknown metric '{metric}'; valid: {sorted(METRIC_TO_FIELD)}",
        )
    if history_window not in WINDOW_VALUES:
        raise HTTPException(
            status_code=400,
            detail=f"unknown history_window '{history_window}'; valid: {sorted(WINDOW_VALUES)}",
        )

    field = METRIC_TO_FIELD[metric]
    raw = query_history(field=field, range_=history_window)
    result = time_to_cross(raw, threshold=threshold, direction=direction)

    base: dict = {
        "metric": metric,
        "field": field,
        "unit": METRIC_TO_UNIT[metric],
        "history_window": history_window,
        "threshold": threshold,
        "direction": direction,
    }
    if not result.ok:
        return ThresholdResponse(
            ok=False,
            reason=result.reason,
            current_value=result.current_value,
            slope_per_hour=result.slope_per_hour,
            fit_start=result.fit_start,
            fit_end=result.fit_end,
            fit_point_count=result.fit_point_count,
            **base,
        )

    assert result.current_value is not None and result.slope_per_hour is not None
    assert result.eta_minutes is not None and result.crossing_time is not None
    assert result.fit_start is not None and result.fit_end is not None
    return ThresholdResponse(
        ok=True,
        already_crossed=result.already_crossed,
        current_value=result.current_value,
        slope_per_hour=result.slope_per_hour,
        eta_minutes=result.eta_minutes,
        crossing_time=result.crossing_time,
        fit_start=result.fit_start,
        fit_end=result.fit_end,
        fit_point_count=result.fit_point_count,
        **base,
    )

"""GET /api/forecast — Stage 4 Phase 4B endpoint that powers the
dashboard's dashed forecast overlay.

Reuses the pure ``llm.forecast.forecast`` helper. Unlike
``execute_forecast_window`` (which formats timestamps as local-no-tz
strings for the chat LLM), this endpoint returns tz-aware UTC ISO
timestamps so the frontend's ``new Date(...)`` parses them correctly
and aligns them with ``/api/sensor/history``.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from influx.writer import query_history
from llm.executor import HORIZON_TO_TIMEDELTA, METRIC_TO_FIELD, METRIC_TO_UNIT
from llm.forecast import forecast

router = APIRouter()

# Mirror the Window literal in executor.py without importing a private type.
WINDOW_VALUES = {"1h", "6h", "24h", "7d"}


class ForecastPointDTO(BaseModel):
    time: datetime
    value: float


class ForecastResponse(BaseModel):
    ok: bool
    metric: str
    field: str
    unit: str
    history_window: str
    horizon: str
    reason: Optional[str] = None
    slope_per_hour: Optional[float] = None
    fit_start: Optional[datetime] = None
    fit_end: Optional[datetime] = None
    fit_point_count: Optional[int] = None
    horizon_end: Optional[datetime] = None
    horizon_end_value: Optional[float] = None
    points: list[ForecastPointDTO] = []


@router.get("", response_model=ForecastResponse)
def forecast_endpoint(
    metric: str = Query(
        ..., description="One of: temperature, humidity, pressure, vibration, light."
    ),
    history_window: str = Query(
        "1h", description="History range to fit on: 1h / 6h / 24h / 7d."
    ),
    horizon: str = Query("15m", description="Forecast horizon: 15m / 1h / 6h."),
) -> ForecastResponse:
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
    if horizon not in HORIZON_TO_TIMEDELTA:
        raise HTTPException(
            status_code=400,
            detail=f"unknown horizon '{horizon}'; valid: {sorted(HORIZON_TO_TIMEDELTA)}",
        )

    field = METRIC_TO_FIELD[metric]
    raw = query_history(field=field, range_=history_window)
    result = forecast(raw, horizon=HORIZON_TO_TIMEDELTA[horizon])

    base: dict = {
        "metric": metric,
        "field": field,
        "unit": METRIC_TO_UNIT[metric],
        "history_window": history_window,
        "horizon": horizon,
    }
    if not result.ok:
        return ForecastResponse(ok=False, reason=result.reason, **base)

    assert result.fit_start is not None and result.fit_end is not None
    assert result.horizon_end is not None and result.horizon_end_value is not None
    assert result.slope_per_hour is not None
    return ForecastResponse(
        ok=True,
        slope_per_hour=result.slope_per_hour,
        fit_start=result.fit_start,
        fit_end=result.fit_end,
        fit_point_count=result.fit_point_count,
        horizon_end=result.horizon_end,
        horizon_end_value=result.horizon_end_value,
        points=[ForecastPointDTO(time=p.time, value=p.value) for p in result.points],
        **base,
    )

import logging
import math
from datetime import datetime, timedelta
from typing import Any, Literal, Optional
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, ValidationError

from config import get_settings
from influx.writer import query_api
from llm.forecast import forecast as run_forecast
from llm.forecast import time_to_cross as run_time_to_cross

log = logging.getLogger(__name__)

Metric = Literal["temperature", "humidity", "pressure", "vibration", "light"]
Window = Literal["1h", "6h", "24h", "7d"]
Horizon = Literal["15m", "1h", "6h"]
Aggregation = Literal["min", "max", "mean", "std"]
CompareAggregation = Literal["mean", "max"]
Direction = Literal["above", "below"]

HORIZON_TO_TIMEDELTA: dict[str, timedelta] = {
    "15m": timedelta(minutes=15),
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
}

METRIC_TO_FIELD: dict[str, str] = {
    "temperature": "temperature_c",
    "humidity": "humidity_pct",
    "pressure": "pressure_hpa",
    "vibration": "vibration_rms",
    "light": "light_lux",
}

METRIC_TO_UNIT: dict[str, str] = {
    "temperature": "°C",
    "humidity": "%",
    "pressure": "hPa",
    "vibration": "m/s²",
    "light": "lux",
}

# Cap returned rows so tool result never blows up Llama's context.
MAX_POINTS = 50


def _local_tz() -> ZoneInfo:
    return ZoneInfo(get_settings().local_tz)


def _to_local_iso(dt: datetime) -> str:
    """Local wall-clock time, no microseconds or tz suffix.
    Server has already converted; suppressing the offset avoids accidentally
    biasing the LLM toward a region's language."""
    return (
        dt.astimezone(_local_tz()).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%S")
    )


class QueryWindowParams(BaseModel):
    metric: Metric
    window: Window
    aggregation: Aggregation


class FindAnomaliesParams(BaseModel):
    metric: Metric
    window: Window
    threshold_sigma: float = Field(default=2.5, ge=1.0, le=5.0)


class CompareWindowsParams(BaseModel):
    metric: Metric
    window_a: Window
    window_b: Window
    aggregation: CompareAggregation


class ForecastWindowParams(BaseModel):
    metric: Metric
    history_window: Window
    horizon: Horizon


class TimeToThresholdParams(BaseModel):
    metric: Metric
    history_window: Window
    threshold: float
    direction: Direction


def _flux_aggregate(field: str, window: str, agg: str, bucket: str) -> str:
    agg_fn = {"min": "min()", "max": "max()", "mean": "mean()", "std": "stddev()"}[agg]
    # min/max are selectors and preserve _time; mean/stddev collapse the
    # series and have no meaningful timestamp.
    keep = (
        '|> keep(columns: ["_value", "_time"])'
        if agg in ("min", "max")
        else '|> keep(columns: ["_value"])'
    )
    return f'''
    from(bucket: "{bucket}")
      |> range(start: -{window})
      |> filter(fn: (r) => r._measurement == "case_sensor_data")
      |> filter(fn: (r) => r._field == "{field}")
      |> {agg_fn}
      {keep}
    '''


def _flux_raw(field: str, window: str, bucket: str) -> str:
    return f'''
    from(bucket: "{bucket}")
      |> range(start: -{window})
      |> filter(fn: (r) => r._measurement == "case_sensor_data")
      |> filter(fn: (r) => r._field == "{field}")
      |> keep(columns: ["_time", "_value"])
    '''


def _run_aggregate(
    field: str, window: str, agg: str
) -> tuple[Optional[float], Optional[datetime]]:
    """Return (value, time). time is only meaningful for min/max selectors."""
    s = get_settings()
    flux = _flux_aggregate(field, window, agg, s.influxdb_bucket)
    tables = query_api().query(flux, org=s.influxdb_org)
    for table in tables:
        for rec in table.records:
            v = rec.get_value()
            t = rec.get_time() if agg in ("min", "max") else None
            return (float(v) if v is not None else None, t)
    return (None, None)


def _run_raw(field: str, window: str) -> list[dict]:
    s = get_settings()
    flux = _flux_raw(field, window, s.influxdb_bucket)
    tables = query_api().query(flux, org=s.influxdb_org)
    out: list[dict] = []
    for table in tables:
        for rec in table.records:
            v = rec.get_value()
            if v is None:
                continue
            out.append({"time": rec.get_time(), "value": float(v)})
    return out


def execute_query_window(p: QueryWindowParams) -> dict[str, Any]:
    field = METRIC_TO_FIELD[p.metric]
    value, t = _run_aggregate(field, p.window, p.aggregation)
    out: dict[str, Any] = {
        "metric": p.metric,
        "field": field,
        "window": p.window,
        "aggregation": p.aggregation,
        "value": value,
        "unit": METRIC_TO_UNIT[p.metric],
    }
    if t is not None:
        out["time"] = _to_local_iso(t)
    return out


def execute_find_anomalies(p: FindAnomaliesParams) -> dict[str, Any]:
    field = METRIC_TO_FIELD[p.metric]
    raw = _run_raw(field, p.window)
    n = len(raw)
    if n < 2:
        return {
            "metric": p.metric,
            "field": field,
            "window": p.window,
            "threshold_sigma": p.threshold_sigma,
            "sample_count": n,
            "mean": None,
            "stddev": None,
            "anomaly_count": 0,
            "anomalies": [],
            "unit": METRIC_TO_UNIT[p.metric],
        }
    values = [r["value"] for r in raw]
    mean_v = sum(values) / n
    variance = sum((v - mean_v) ** 2 for v in values) / n
    std_v = math.sqrt(variance)
    cutoff = p.threshold_sigma * std_v
    anomalies = [r for r in raw if abs(r["value"] - mean_v) > cutoff][:MAX_POINTS]
    return {
        "metric": p.metric,
        "field": field,
        "window": p.window,
        "threshold_sigma": p.threshold_sigma,
        "sample_count": n,
        "mean": round(mean_v, 3),
        "stddev": round(std_v, 3),
        "anomaly_count": len(anomalies),
        "anomalies": [
            {"time": _to_local_iso(r["time"]), "value": round(r["value"], 3)}
            for r in anomalies
        ],
        "unit": METRIC_TO_UNIT[p.metric],
    }


def execute_compare_windows(p: CompareWindowsParams) -> dict[str, Any]:
    field = METRIC_TO_FIELD[p.metric]
    a, _ = _run_aggregate(field, p.window_a, p.aggregation)
    b, _ = _run_aggregate(field, p.window_b, p.aggregation)
    delta = (a - b) if (a is not None and b is not None) else None
    return {
        "metric": p.metric,
        "field": field,
        "window_a": p.window_a,
        "window_b": p.window_b,
        "aggregation": p.aggregation,
        "value_a": a,
        "value_b": b,
        "delta": delta,
        "unit": METRIC_TO_UNIT[p.metric],
    }


def execute_forecast_window(p: ForecastWindowParams) -> dict[str, Any]:
    """Pull history, fit a line on the current session, project forward.

    The forecaster itself is pure — this wrapper just handles I/O and shapes
    the result for the LLM (local-time ISO timestamps, rounded numbers).
    """
    field = METRIC_TO_FIELD[p.metric]
    raw = _run_raw(field, p.history_window)
    horizon_td = HORIZON_TO_TIMEDELTA[p.horizon]
    result = run_forecast(raw, horizon=horizon_td)

    base: dict[str, Any] = {
        "metric": p.metric,
        "field": field,
        "history_window": p.history_window,
        "horizon": p.horizon,
        "unit": METRIC_TO_UNIT[p.metric],
    }
    if not result.ok:
        base["ok"] = False
        base["reason"] = result.reason
        return base

    assert result.fit_start is not None
    assert result.fit_end is not None
    assert result.horizon_end is not None
    assert result.horizon_end_value is not None
    assert result.slope_per_hour is not None

    base.update(
        {
            "ok": True,
            "slope_per_hour": round(result.slope_per_hour, 4),
            "fit_start": _to_local_iso(result.fit_start),
            "fit_end": _to_local_iso(result.fit_end),
            "fit_point_count": result.fit_point_count,
            "horizon_end": _to_local_iso(result.horizon_end),
            "horizon_end_value": round(result.horizon_end_value, 3),
            "points": [
                {"time": _to_local_iso(pt.time), "value": round(pt.value, 3)}
                for pt in result.points[:MAX_POINTS]
            ],
        }
    )
    return base


def execute_time_to_threshold(p: TimeToThresholdParams) -> dict[str, Any]:
    """Pull history, fit a line on the current session, project until crossing.

    Like ``execute_forecast_window``, the math is delegated to the pure
    ``time_to_cross`` helper; this wrapper handles I/O and shapes the result
    for the LLM (local-time ISO timestamp, rounded numbers).
    """
    field = METRIC_TO_FIELD[p.metric]
    raw = _run_raw(field, p.history_window)
    result = run_time_to_cross(raw, threshold=p.threshold, direction=p.direction)

    base: dict[str, Any] = {
        "metric": p.metric,
        "field": field,
        "history_window": p.history_window,
        "threshold": p.threshold,
        "direction": p.direction,
        "unit": METRIC_TO_UNIT[p.metric],
    }
    if not result.ok:
        base["ok"] = False
        base["reason"] = result.reason
        if result.current_value is not None:
            base["current_value"] = round(result.current_value, 3)
        if result.slope_per_hour is not None:
            base["slope_per_hour"] = round(result.slope_per_hour, 4)
        return base

    assert result.current_value is not None
    assert result.slope_per_hour is not None
    assert result.eta_minutes is not None
    assert result.crossing_time is not None
    assert result.fit_start is not None and result.fit_end is not None

    base.update(
        {
            "ok": True,
            "already_crossed": result.already_crossed,
            "current_value": round(result.current_value, 3),
            "slope_per_hour": round(result.slope_per_hour, 4),
            "eta_minutes": round(result.eta_minutes, 1),
            "crossing_time": _to_local_iso(result.crossing_time),
            "fit_start": _to_local_iso(result.fit_start),
            "fit_end": _to_local_iso(result.fit_end),
            "fit_point_count": result.fit_point_count,
        }
    )
    return base


TOOL_DISPATCH: dict[str, tuple[type[BaseModel], Any]] = {
    "query_window": (QueryWindowParams, execute_query_window),
    "find_anomalies": (FindAnomaliesParams, execute_find_anomalies),
    "compare_windows": (CompareWindowsParams, execute_compare_windows),
    "forecast_window": (ForecastWindowParams, execute_forecast_window),
    "time_to_threshold": (TimeToThresholdParams, execute_time_to_threshold),
}


def execute_tool(name: str, raw_args: dict) -> tuple[Optional[dict], Optional[str]]:
    """Validate args via Pydantic, dispatch, return (result, error)."""
    if name not in TOOL_DISPATCH:
        return None, f"Unknown tool '{name}'. Valid tools: {list(TOOL_DISPATCH.keys())}"
    schema_cls, fn = TOOL_DISPATCH[name]
    try:
        params = schema_cls(**raw_args)
    except ValidationError as e:
        return None, f"Invalid params for {name}: {e.errors()}"
    try:
        return fn(params), None
    except Exception as e:
        log.exception("Tool execution failed: %s", name)
        return None, f"Tool '{name}' execution failed: {e}"

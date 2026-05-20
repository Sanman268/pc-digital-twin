import logging
import math
from datetime import datetime
from typing import Any, Literal, Optional
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, ValidationError

from config import get_settings
from influx.writer import query_api

log = logging.getLogger(__name__)

Metric = Literal["temperature", "humidity", "pressure", "vibration", "light"]
Window = Literal["1h", "6h", "24h", "7d"]
Aggregation = Literal["min", "max", "mean", "std"]
CompareAggregation = Literal["mean", "max"]

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
    return dt.astimezone(_local_tz()).isoformat()


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


TOOL_DISPATCH: dict[str, tuple[type[BaseModel], Any]] = {
    "query_window": (QueryWindowParams, execute_query_window),
    "find_anomalies": (FindAnomaliesParams, execute_find_anomalies),
    "compare_windows": (CompareWindowsParams, execute_compare_windows),
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

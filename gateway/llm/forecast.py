"""Stage 4 Phase 1 — pure intra-session linear forecaster.

`forecast(points, horizon)` fits a least-squares line over the **current
session** (the trailing run of samples not separated by a powered-off gap)
and projects it forward by ``horizon``. All session segmentation is delegated
to ``verify_data.detect_sessions`` so the gap definition stays in one place.

The function is I/O-free and CI Tier 1 testable. All InfluxDB access lives
in ``execute_forecast_window`` in ``executor.py``.

When the data cannot support a forecast the function returns a result with
``ok=False`` and a human-readable ``reason``. It never fabricates numbers.

Insufficiency rules:
- empty input
- current session has fewer than ``min_points`` samples (default 3)
- current session duration < 2 * horizon (mirrors the Phase 0 verdict
  threshold for intra-session GO)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

from verify_data import detect_sessions


# ---------- result model ----------


@dataclass(frozen=True)
class ForecastPoint:
    time: datetime
    value: float


@dataclass(frozen=True)
class ForecastResult:
    ok: bool
    reason: Optional[str] = None
    slope_per_hour: Optional[float] = None
    fit_start: Optional[datetime] = None
    fit_end: Optional[datetime] = None
    fit_point_count: Optional[int] = None
    horizon_end: Optional[datetime] = None
    horizon_end_value: Optional[float] = None
    points: list[ForecastPoint] = field(default_factory=list)


# ---------- helpers (pure) ----------


def _last_session_points(
    points: list[dict],
    gap_threshold_s: float,
) -> list[dict]:
    """Return the trailing run of points within one session.

    Reuses ``verify_data.detect_sessions`` for the gap rule so there is a
    single source of truth for "what counts as a session boundary".
    """
    if not points:
        return []
    timestamps = [p["time"] for p in points]
    sessions = detect_sessions(timestamps, gap_threshold_s)
    if not sessions:
        return []
    last = sessions[-1]
    return points[-last.count :]


def _least_squares(xs: list[float], ys: list[float]) -> tuple[float, float]:
    """Return (slope, intercept) for y ≈ slope·x + intercept.

    Caller is responsible for ensuring len(xs) >= 2 and not-all-identical xs.
    """
    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    den = sum((x - mean_x) ** 2 for x in xs)
    if den == 0:
        return 0.0, mean_y
    slope = num / den
    intercept = mean_y - slope * mean_x
    return slope, intercept


# ---------- public API ----------


def forecast(
    points: list[dict],
    horizon: timedelta,
    gap_threshold_s: float = 600.0,
    min_points: int = 3,
    n_forecast_steps: int = 12,
) -> ForecastResult:
    """Project the current session forward by ``horizon`` using a linear fit.

    Parameters
    ----------
    points : list[{time: datetime, value: float}]
        Sorted ascending by time. Anything older than the current session is
        ignored — the fit uses only the last contiguous run.
    horizon : timedelta
        How far ahead to project from the last observed sample.
    gap_threshold_s : float
        Seconds of silence above which a new session is considered to have
        started. Defaults to 10 min to match ``verify_data.py``.
    min_points : int
        Refuse to fit on fewer than this many in-session samples.
    n_forecast_steps : int
        Number of forecast points to emit over the horizon (≥ 2).
    """
    if not points:
        return ForecastResult(ok=False, reason="no points")
    if horizon <= timedelta(0):
        return ForecastResult(ok=False, reason="non-positive horizon")

    session = _last_session_points(points, gap_threshold_s)
    if len(session) < min_points:
        return ForecastResult(
            ok=False,
            reason=f"current session has {len(session)} point(s); need >= {min_points}",
        )

    t0 = session[0]["time"]
    t_last = session[-1]["time"]
    session_duration = t_last - t0
    if session_duration < 2 * horizon:
        return ForecastResult(
            ok=False,
            reason=(
                f"current session is {_fmt_td(session_duration)} long; "
                f"need >= 2x horizon ({_fmt_td(2 * horizon)})"
            ),
        )

    # Convert to hours-since-t0 so slope is per-hour and the numbers stay small.
    xs = [(p["time"] - t0).total_seconds() / 3600.0 for p in session]
    ys = [float(p["value"]) for p in session]
    slope_per_hour, intercept = _least_squares(xs, ys)

    # Emit n_forecast_steps evenly spaced points from t_last + step .. t_last + horizon.
    steps = max(2, n_forecast_steps)
    step = horizon / steps
    forecast_points: list[ForecastPoint] = []
    for i in range(1, steps + 1):
        t = t_last + step * i
        x_hours = (t - t0).total_seconds() / 3600.0
        y = slope_per_hour * x_hours + intercept
        forecast_points.append(ForecastPoint(time=t, value=y))

    horizon_end = forecast_points[-1].time
    horizon_end_value = forecast_points[-1].value

    return ForecastResult(
        ok=True,
        slope_per_hour=slope_per_hour,
        fit_start=t0,
        fit_end=t_last,
        fit_point_count=len(session),
        horizon_end=horizon_end,
        horizon_end_value=horizon_end_value,
        points=forecast_points,
    )


# ---------- formatting (also pure) ----------


def _fmt_td(td: timedelta) -> str:
    total = int(td.total_seconds())
    sign = "-" if total < 0 else ""
    total = abs(total)
    hours, rem = divmod(total, 3600)
    minutes, seconds = divmod(rem, 60)
    if hours:
        return f"{sign}{hours}h {minutes:02d}m"
    if minutes:
        return f"{sign}{minutes}m {seconds:02d}s"
    return f"{sign}{seconds}s"

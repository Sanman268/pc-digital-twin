"""Stage 4 Phase 1 + Phase 2 — pure intra-session linear forecasting.

This module exposes two pure, I/O-free functions:

- ``forecast(points, horizon)`` — projects the current session forward by
  ``horizon`` using a least-squares line.
- ``time_to_cross(points, threshold, direction)`` — projects the same line
  forward until it crosses a threshold from above or below, and reports the
  ETA in minutes.

Both share ``_fit_current_session``, which delegates session segmentation to
``verify_data.detect_sessions`` so the powered-off-gap rule lives in one
place. When the data cannot support a prediction either function returns a
result with ``ok=False`` and a human-readable ``reason`` — neither one
fabricates numbers. All InfluxDB access lives in ``executor.py``.

Insufficiency rules common to both:
- empty input
- current session has fewer than ``min_points`` samples (default 3)

Additional rules:
- ``forecast`` requires session duration ≥ 2 × horizon (the Phase 0 verdict
  threshold for intra-session GO).
- ``time_to_cross`` requires the fitted slope to point toward the threshold.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Literal, Optional

from verify_data import detect_sessions


Direction = Literal["above", "below"]


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


@dataclass(frozen=True)
class TimeToCrossResult:
    ok: bool
    reason: Optional[str] = None
    direction: Optional[Direction] = None
    threshold: Optional[float] = None
    current_value: Optional[float] = None
    slope_per_hour: Optional[float] = None
    eta_minutes: Optional[float] = None
    crossing_time: Optional[datetime] = None
    already_crossed: bool = False
    fit_start: Optional[datetime] = None
    fit_end: Optional[datetime] = None
    fit_point_count: Optional[int] = None


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


@dataclass(frozen=True)
class _SessionFit:
    """Result of fitting a line on the current session. Internal."""

    ok: bool
    reason: Optional[str] = None
    slope_per_hour: Optional[float] = None
    intercept: Optional[float] = None  # value of the fit at t0 (in hours)
    session_points: list[dict] = field(default_factory=list)
    t0: Optional[datetime] = None
    t_last: Optional[datetime] = None


def _fit_current_session(
    points: list[dict],
    gap_threshold_s: float,
    min_points: int,
) -> _SessionFit:
    """Detect the current session and fit a least-squares line on it.

    Returned slope is per-hour and the intercept is the fitted value at
    ``t0`` (i.e. the first point of the current session). Both ``forecast``
    and ``time_to_cross`` rely on this so they share the same notion of
    "current session" and the same fit.
    """
    if not points:
        return _SessionFit(ok=False, reason="no points")
    session = _last_session_points(points, gap_threshold_s)
    if len(session) < min_points:
        return _SessionFit(
            ok=False,
            reason=f"current session has {len(session)} point(s); need >= {min_points}",
        )
    t0 = session[0]["time"]
    t_last = session[-1]["time"]
    xs = [(p["time"] - t0).total_seconds() / 3600.0 for p in session]
    ys = [float(p["value"]) for p in session]
    slope_per_hour, intercept = _least_squares(xs, ys)
    return _SessionFit(
        ok=True,
        slope_per_hour=slope_per_hour,
        intercept=intercept,
        session_points=session,
        t0=t0,
        t_last=t_last,
    )


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
    if horizon <= timedelta(0):
        return ForecastResult(ok=False, reason="non-positive horizon")

    fit = _fit_current_session(points, gap_threshold_s, min_points)
    if not fit.ok:
        return ForecastResult(ok=False, reason=fit.reason)

    assert fit.t0 is not None and fit.t_last is not None
    assert fit.slope_per_hour is not None and fit.intercept is not None
    t0, t_last = fit.t0, fit.t_last
    session = fit.session_points
    slope_per_hour, intercept = fit.slope_per_hour, fit.intercept

    session_duration = t_last - t0
    if session_duration < 2 * horizon:
        return ForecastResult(
            ok=False,
            reason=(
                f"current session is {_fmt_td(session_duration)} long; "
                f"need >= 2x horizon ({_fmt_td(2 * horizon)})"
            ),
        )

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


def time_to_cross(
    points: list[dict],
    threshold: float,
    direction: Direction,
    gap_threshold_s: float = 600.0,
    min_points: int = 3,
) -> TimeToCrossResult:
    """Estimate when the current session's trend will cross ``threshold``.

    Parameters
    ----------
    points : list[{time, value}]
        Sorted ascending by time. Only the most recent session is used; the
        gap rule is shared with ``verify_data.detect_sessions``.
    threshold : float
        The value to project toward (e.g. 35.0 °C).
    direction : "above" | "below"
        "above" answers "when will the value rise to threshold?"; "below"
        answers "when will it fall to threshold?".

    Insufficiency:
    - empty input, or fewer than ``min_points`` in-session samples
    - the fitted slope points away from the threshold (no crossing possible
      under the current trend; flat lines are reported the same way)

    Already-crossed:
    - if the last observed value is already on the requested side of the
      threshold, returns ok=True with ``already_crossed=True`` and
      ``eta_minutes=0`` — there is nothing to predict.
    """
    fit = _fit_current_session(points, gap_threshold_s, min_points)
    if not fit.ok:
        return TimeToCrossResult(
            ok=False,
            reason=fit.reason,
            direction=direction,
            threshold=threshold,
        )

    assert fit.t0 is not None and fit.t_last is not None
    assert fit.slope_per_hour is not None and fit.intercept is not None
    t0, t_last = fit.t0, fit.t_last
    slope_per_hour, intercept = fit.slope_per_hour, fit.intercept
    current_value = float(fit.session_points[-1]["value"])

    crossed_now = (direction == "above" and current_value >= threshold) or (
        direction == "below" and current_value <= threshold
    )
    if crossed_now:
        return TimeToCrossResult(
            ok=True,
            direction=direction,
            threshold=threshold,
            current_value=current_value,
            slope_per_hour=slope_per_hour,
            eta_minutes=0.0,
            crossing_time=t_last,
            already_crossed=True,
            fit_start=t0,
            fit_end=t_last,
            fit_point_count=len(fit.session_points),
        )

    # For a non-trivial answer the slope has to point toward the threshold.
    # A flat trend (slope == 0) is handled here too — it never crosses.
    heading_toward = (direction == "above" and slope_per_hour > 0) or (
        direction == "below" and slope_per_hour < 0
    )
    if not heading_toward:
        return TimeToCrossResult(
            ok=False,
            reason=(
                f"trend (slope {slope_per_hour:+.3f}/h) is not heading "
                f"{direction} threshold {threshold}"
            ),
            direction=direction,
            threshold=threshold,
            current_value=current_value,
            slope_per_hour=slope_per_hour,
            fit_start=t0,
            fit_end=t_last,
            fit_point_count=len(fit.session_points),
        )

    # Fitted line is y = slope * (t - t0)_hours + intercept. Solve for t where
    # y == threshold, then compute the offset from t_last.
    t_cross_hours_from_t0 = (threshold - intercept) / slope_per_hour
    crossing_time = t0 + timedelta(hours=t_cross_hours_from_t0)
    eta_seconds = (crossing_time - t_last).total_seconds()
    eta_minutes = max(0.0, eta_seconds / 60.0)
    # If the fit projects a crossing in the past while the observed value
    # hasn't crossed yet, treat it as "imminent" — anchor to t_last.
    if eta_seconds < 0:
        crossing_time = t_last

    return TimeToCrossResult(
        ok=True,
        direction=direction,
        threshold=threshold,
        current_value=current_value,
        slope_per_hour=slope_per_hour,
        eta_minutes=eta_minutes,
        crossing_time=crossing_time,
        already_crossed=False,
        fit_start=t0,
        fit_end=t_last,
        fit_point_count=len(fit.session_points),
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

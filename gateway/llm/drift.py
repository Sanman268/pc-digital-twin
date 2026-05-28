"""Stage 4 Phase 3 — pure baseline + drift detection.

The forecaster (``llm/forecast.py``) describes *where the active session is
heading*. This module answers a different question: *is the current session
behaving like normal, or is it drifting away from how the case usually runs?*

A baseline is built from the **historical** sessions in the window — every
session except the trailing (active) one. From those we collect:

- ``value_mean`` / ``value_stddev`` — pooled over every baseline sample.
- ``slope_mean`` / ``slope_stddev`` — per-session least-squares slopes,
  collected across historical sessions long enough to fit.

The current session contributes two scalars:

- ``current_value`` — mean of the last ``current_smoothing_n`` points
  (smoothing kills momentary BLE spikes that would otherwise dominate a
  pure point-in-time z-score).
- ``current_slope_per_hour`` — least-squares slope on the active session,
  or ``None`` if the session is too short.

The reported drift score is the larger of |z_value| and |z_slope|, so a
session whose value sits in the normal band but whose slope is racing
upward still raises a flag. Status thresholds:

- ``drift_score < k_drift`` (default 1.5) → ``normal``
- ``drift_score < k_fault`` (default 3.0) → ``drifting``
- otherwise → ``fault``

Insufficiency rules:
- empty input
- only one session present (no historical baseline yet)
- baseline has fewer than ``min_baseline_samples`` total samples
- if no per-session slope can be fit on any historical session,
  ``baseline_slope_*`` come back ``None`` and ``z_slope`` is simply omitted
  (status falls back to z_value only).

All InfluxDB access lives in ``executor.py`` and ``api/routes_drift.py``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Optional

from llm.forecast import _fit_current_session, _least_squares
from verify_data import detect_sessions


Status = Literal["normal", "drifting", "fault"]


# ---------- result model ----------


@dataclass(frozen=True)
class BaselineStats:
    """Aggregate stats over historical (non-current) sessions."""

    value_mean: float
    value_stddev: float
    value_n: int
    slope_mean: Optional[float]
    slope_stddev: Optional[float]
    session_count: int
    span_start: Optional[datetime]
    span_end: Optional[datetime]


@dataclass(frozen=True)
class DriftResult:
    ok: bool
    reason: Optional[str] = None
    status: Optional[Status] = None
    drift_score: Optional[float] = None
    z_value: Optional[float] = None
    z_slope: Optional[float] = None
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


# ---------- pure helpers ----------


def _split_sessions(
    points: list[dict],
    gap_threshold_s: float,
) -> list[list[dict]]:
    """Partition ``points`` into sessions, in order, sharing the gap rule."""
    if not points:
        return []
    timestamps = [p["time"] for p in points]
    meta = detect_sessions(timestamps, gap_threshold_s)
    out: list[list[dict]] = []
    cursor = 0
    for s in meta:
        out.append(points[cursor : cursor + s.count])
        cursor += s.count
    return out


def _pooled_value_stats(sessions: list[list[dict]]) -> tuple[float, float, int]:
    """Mean, *population* stddev, and count over all values in ``sessions``.

    Population stddev (divide by n) is what we want here — the baseline is
    the full historical observation, not a sample of a wider population.
    """
    values = [float(p["value"]) for s in sessions for p in s]
    n = len(values)
    if n == 0:
        return (0.0, 0.0, 0)
    mean = sum(values) / n
    variance = sum((v - mean) ** 2 for v in values) / n
    return (mean, math.sqrt(variance), n)


def _session_slope_per_hour(
    session: list[dict],
    min_points: int,
) -> Optional[float]:
    """Least-squares slope-per-hour for one session, or None if too short."""
    if len(session) < min_points:
        return None
    t0 = session[0]["time"]
    xs = [(p["time"] - t0).total_seconds() / 3600.0 for p in session]
    ys = [float(p["value"]) for p in session]
    # Guard against degenerate sessions (all timestamps identical).
    if all(x == xs[0] for x in xs):
        return None
    slope, _ = _least_squares(xs, ys)
    return slope


def _baseline_slope_stats(
    historical_sessions: list[list[dict]],
    min_points: int,
) -> tuple[Optional[float], Optional[float]]:
    """Per-session-slope mean and stddev across historical sessions."""
    slopes = [
        _session_slope_per_hour(s, min_points)
        for s in historical_sessions
    ]
    slopes_valid = [s for s in slopes if s is not None]
    n = len(slopes_valid)
    if n < 2:
        # With <2 historical slopes we can't define a spread.
        return (None, None)
    mean = sum(slopes_valid) / n
    variance = sum((s - mean) ** 2 for s in slopes_valid) / n
    return (mean, math.sqrt(variance))


def _classify(drift_score: float, k_drift: float, k_fault: float) -> Status:
    if drift_score < k_drift:
        return "normal"
    if drift_score < k_fault:
        return "drifting"
    return "fault"


# ---------- public API ----------


def compute_baseline(
    points: list[dict],
    gap_threshold_s: float = 600.0,
    min_fit_points: int = 3,
) -> Optional[BaselineStats]:
    """Compute baseline stats over the *historical* sessions in ``points``.

    The trailing session is treated as "current" and excluded so the
    baseline reflects how the case has run on *prior* sessions only.
    Returns ``None`` if there are no historical sessions.
    """
    sessions = _split_sessions(points, gap_threshold_s)
    if len(sessions) < 2:
        return None
    historical = sessions[:-1]
    value_mean, value_stddev, value_n = _pooled_value_stats(historical)
    slope_mean, slope_stddev = _baseline_slope_stats(historical, min_fit_points)
    span_start = historical[0][0]["time"] if historical[0] else None
    span_end = historical[-1][-1]["time"] if historical[-1] else None
    return BaselineStats(
        value_mean=value_mean,
        value_stddev=value_stddev,
        value_n=value_n,
        slope_mean=slope_mean,
        slope_stddev=slope_stddev,
        session_count=len(historical),
        span_start=span_start,
        span_end=span_end,
    )


def detect_drift(
    points: list[dict],
    gap_threshold_s: float = 600.0,
    min_baseline_samples: int = 30,
    min_fit_points: int = 3,
    current_smoothing_n: int = 10,
    k_drift: float = 1.5,
    k_fault: float = 3.0,
    stddev_floor: float = 1e-6,
    slope_stddev_floor: float = 0.05,
) -> DriftResult:
    """Score the trailing session against the baseline of prior sessions.

    Parameters
    ----------
    points : list[{time, value}]
        Sorted ascending. Comes from one history window (e.g. the last 7d).
    gap_threshold_s : float
        Seconds of silence above which a new session starts. Matches the
        rule shared by ``verify_data.detect_sessions``.
    min_baseline_samples : int
        Refuse to score if the historical sessions together hold fewer
        than this many samples.
    min_fit_points : int
        Refuse to fit a slope on a session with fewer than this many points.
    current_smoothing_n : int
        Average the trailing N points of the current session for the
        value reading, to dampen single-sample BLE spikes.
    k_drift, k_fault : float
        Z-score thresholds for ``drifting`` and ``fault`` classification.
    stddev_floor : float
        Treat baseline stddevs at or below this as effectively zero; if
        the current reading differs at all from the baseline mean under
        that condition, the drift score is reported as +inf and the
        status is ``fault``.
    slope_stddev_floor : float
        Minimum baseline slope-stddev (in metric-units per hour) required
        to consider the slope channel actionable. The least-squares slope
        of a pure-noise session is itself a small noisy number, so a
        noise-dominated baseline has a vanishing slope spread that would
        otherwise turn tiny current-session slope wobbles into huge
        z-scores. When the baseline slope spread falls below this floor,
        the slope channel is disabled (``z_slope = None``) and the verdict
        rests on the value channel alone.
    """
    if not points:
        return DriftResult(ok=False, reason="no points")

    sessions = _split_sessions(points, gap_threshold_s)
    if len(sessions) < 2:
        return DriftResult(
            ok=False,
            reason="no historical baseline yet (need >= 1 prior session)",
        )

    baseline = compute_baseline(
        points, gap_threshold_s=gap_threshold_s, min_fit_points=min_fit_points
    )
    assert baseline is not None  # len(sessions) >= 2 guarantees this

    if baseline.value_n < min_baseline_samples:
        return DriftResult(
            ok=False,
            reason=(
                f"baseline has {baseline.value_n} sample(s); "
                f"need >= {min_baseline_samples}"
            ),
            baseline_value_n=baseline.value_n,
            baseline_session_count=baseline.session_count,
        )

    current = sessions[-1]
    if len(current) == 0:
        # detect_sessions shouldn't emit empty sessions, but be defensive.
        return DriftResult(ok=False, reason="current session is empty")

    # Smoothed current value: mean of last N samples within the current session.
    tail = current[-current_smoothing_n:] if current_smoothing_n > 0 else current
    current_value = sum(float(p["value"]) for p in tail) / len(tail)

    # Current slope: reuse the forecast fit helper so the slope is computed the
    # same way as in forecast() and time_to_cross().
    fit = _fit_current_session(points, gap_threshold_s, min_fit_points)
    current_slope = fit.slope_per_hour if fit.ok else None
    current_fit_n = len(fit.session_points) if fit.ok else len(current)
    current_session_start = current[0]["time"]
    current_session_end = current[-1]["time"]

    # z_value — always computable once the baseline passes min_baseline_samples.
    if baseline.value_stddev <= stddev_floor:
        # Degenerate baseline: every prior sample was the same number.
        # Any deviation at all is "fault"; exact equality is "normal".
        z_value = 0.0 if current_value == baseline.value_mean else math.inf
    else:
        z_value = (current_value - baseline.value_mean) / baseline.value_stddev

    # z_slope — only when both sides have a slope AND the baseline slope
    # spread is wide enough to be meaningful. Pure-noise baselines have a
    # vanishing slope_stddev that would otherwise manufacture huge
    # z-scores from sub-noise current-session wobbles; disable the channel
    # rather than fabricate signal.
    z_slope: Optional[float] = None
    if (
        current_slope is not None
        and baseline.slope_mean is not None
        and baseline.slope_stddev is not None
        and baseline.slope_stddev >= slope_stddev_floor
    ):
        z_slope = (current_slope - baseline.slope_mean) / baseline.slope_stddev

    candidates = [abs(z_value)]
    if z_slope is not None:
        candidates.append(abs(z_slope))
    drift_score = max(candidates)
    status = _classify(drift_score, k_drift=k_drift, k_fault=k_fault)

    return DriftResult(
        ok=True,
        status=status,
        drift_score=drift_score,
        z_value=z_value,
        z_slope=z_slope,
        current_value=current_value,
        current_slope_per_hour=current_slope,
        current_session_start=current_session_start,
        current_session_end=current_session_end,
        current_fit_point_count=current_fit_n,
        baseline_value_mean=baseline.value_mean,
        baseline_value_stddev=baseline.value_stddev,
        baseline_value_n=baseline.value_n,
        baseline_slope_mean=baseline.slope_mean,
        baseline_slope_stddev=baseline.slope_stddev,
        baseline_session_count=baseline.session_count,
        baseline_span_start=baseline.span_start,
        baseline_span_end=baseline.span_end,
    )

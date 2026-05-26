"""Stage 4 Phase 5 — pure intra-session forecast backtester.

For each anchor inside a session, fit on the points up to and including
the anchor, project ``horizon`` ahead, and compare the prediction to the
actual value at ``anchor + horizon`` (linearly interpolated from the
surrounding samples within the same session).

The backtester is pure and CI Tier 1 testable. It reuses
``forecast()`` so the validity rules (≥ min_points in fit window,
session duration ≥ 2 × horizon) are enforced from one place — an anchor
that ``forecast()`` would refuse is simply skipped.

A backtest **never crosses a session boundary**: the actual outcome at
horizon must lie inside the same session as the anchor. This matches
Stage 4's intra-session scope.
"""

from __future__ import annotations

import bisect
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

from llm.forecast import forecast
from verify_data import detect_sessions


# ---------- result model ----------


@dataclass(frozen=True)
class BacktestSample:
    anchor: datetime
    horizon_end: datetime
    predicted: float
    actual: float

    @property
    def error(self) -> float:
        return self.predicted - self.actual


@dataclass(frozen=True)
class BacktestResult:
    ok: bool
    reason: Optional[str] = None
    horizon: Optional[timedelta] = None
    n: int = 0
    mae: Optional[float] = None
    rmse: Optional[float] = None
    samples: list[BacktestSample] = field(default_factory=list)


# ---------- pure helpers ----------


def _interp_future_value(
    session: list[dict],
    target_time: datetime,
    after_idx: int,
) -> Optional[float]:
    """Linearly interpolate the actual value at ``target_time`` using only
    points strictly after ``after_idx`` within the same session.

    Returns None when the target falls outside the available future range
    (i.e. before the next sample or beyond the session's last sample).
    """
    future = session[after_idx + 1 :]
    if not future:
        return None
    if target_time < future[0]["time"] or target_time > future[-1]["time"]:
        return None
    times = [p["time"] for p in future]
    idx = bisect.bisect_left(times, target_time)
    if idx == 0:
        return float(future[0]["value"])
    if idx >= len(future):
        return float(future[-1]["value"])
    a = future[idx - 1]
    b = future[idx]
    span = (b["time"] - a["time"]).total_seconds()
    if span == 0:
        return float(a["value"])
    alpha = (target_time - a["time"]).total_seconds() / span
    return float(a["value"]) + alpha * (float(b["value"]) - float(a["value"]))


def _split_into_sessions(
    points: list[dict],
    gap_threshold_s: float,
) -> list[list[dict]]:
    """Return ``points`` partitioned into sessions, in order. Pure."""
    if not points:
        return []
    timestamps = [p["time"] for p in points]
    sessions_meta = detect_sessions(timestamps, gap_threshold_s)
    out: list[list[dict]] = []
    cursor = 0
    for s in sessions_meta:
        out.append(points[cursor : cursor + s.count])
        cursor += s.count
    return out


# ---------- public API ----------


def backtest(
    points: list[dict],
    horizon: timedelta,
    stride_samples: int = 10,
    gap_threshold_s: float = 600.0,
    min_fit_points: int = 3,
    max_samples_returned: int = 50,
) -> BacktestResult:
    """Backtest the linear forecaster over the available history.

    Parameters
    ----------
    points : list[{time, value}]
        Sorted ascending. Multiple sessions are handled correctly; the
        backtester never fits or compares across a session boundary.
    horizon : timedelta
        Forecast horizon to evaluate (e.g. 1h).
    stride_samples : int
        Anchor every Nth in-session sample. Default 10. Smaller = more
        anchors and tighter stats, but O(n²) work.
    gap_threshold_s : float
        Session boundary rule, mirroring ``verify_data.detect_sessions``.
    min_fit_points : int
        Refuse to fit on fewer than this many in-session samples per
        anchor (mirrors ``forecast()`` default).
    max_samples_returned : int
        Cap the ``samples`` list in the result so a chat-tool consumer
        doesn't blow up the LLM context. Aggregates (n / mae / rmse) are
        always computed over the full anchor set.
    """
    if not points:
        return BacktestResult(ok=False, reason="no points", horizon=horizon)
    if horizon <= timedelta(0):
        return BacktestResult(ok=False, reason="non-positive horizon", horizon=horizon)
    if stride_samples < 1:
        return BacktestResult(
            ok=False, reason="stride_samples must be >= 1", horizon=horizon
        )

    sessions = _split_into_sessions(points, gap_threshold_s)
    collected: list[BacktestSample] = []

    for session in sessions:
        if len(session) < min_fit_points + 1:
            continue
        # Walk anchors. The earliest viable anchor is one where the fit
        # window (session[:anchor+1]) can satisfy forecast()'s rules; we
        # just hand the slice to forecast() and let it judge.
        for anchor_idx in range(min_fit_points - 1, len(session), stride_samples):
            history = session[: anchor_idx + 1]
            fcast = forecast(
                history,
                horizon=horizon,
                gap_threshold_s=gap_threshold_s,
                min_points=min_fit_points,
            )
            if not fcast.ok:
                continue
            anchor_time = session[anchor_idx]["time"]
            target_time = anchor_time + horizon
            actual = _interp_future_value(session, target_time, anchor_idx)
            if actual is None:
                continue
            assert fcast.horizon_end_value is not None
            collected.append(
                BacktestSample(
                    anchor=anchor_time,
                    horizon_end=target_time,
                    predicted=float(fcast.horizon_end_value),
                    actual=actual,
                )
            )

    if not collected:
        return BacktestResult(
            ok=False,
            reason="no usable anchors (sessions too short, or horizon exceeds session length)",
            horizon=horizon,
        )

    errors = [s.error for s in collected]
    n = len(errors)
    mae = sum(abs(e) for e in errors) / n
    rmse = math.sqrt(sum(e * e for e in errors) / n)

    return BacktestResult(
        ok=True,
        horizon=horizon,
        n=n,
        mae=mae,
        rmse=rmse,
        samples=collected[:max_samples_returned],
    )

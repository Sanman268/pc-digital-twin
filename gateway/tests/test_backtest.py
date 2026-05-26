"""CI Tier 1 unit tests for the pure backtester.

No InfluxDB, no config, no environment required.
"""

import random
from datetime import datetime, timedelta, timezone

import pytest

from llm.backtest import backtest


UTC = timezone.utc


def _ts(*args) -> datetime:
    return datetime(*args, tzinfo=UTC)


def _ramp(
    start: datetime, step_s: float, n: int, base: float, slope_per_step: float
) -> list[dict]:
    return [
        {
            "time": start + timedelta(seconds=step_s * i),
            "value": base + slope_per_step * i,
        }
        for i in range(n)
    ]


def _flat(start: datetime, step_s: float, n: int, value: float) -> list[dict]:
    return [
        {"time": start + timedelta(seconds=step_s * i), "value": value}
        for i in range(n)
    ]


def _noisy(
    start: datetime, step_s: float, n: int, value: float, noise: float, seed: int = 0
) -> list[dict]:
    rng = random.Random(seed)
    return [
        {
            "time": start + timedelta(seconds=step_s * i),
            "value": value + rng.uniform(-noise, noise),
        }
        for i in range(n)
    ]


# ---------- happy path ----------


def test_backtest_on_perfect_ramp_has_near_zero_error():
    # A perfectly linear 4-hour session — the linear forecaster should be
    # close to exact at every anchor.
    n = 4 * 3600 // 2
    slope_per_step = 0.5 / (3600 / 2)
    pts = _ramp(
        _ts(2026, 5, 24, 21, 0), 2.0, n, base=25.0, slope_per_step=slope_per_step
    )
    result = backtest(pts, horizon=timedelta(hours=1), stride_samples=30)
    assert result.ok, result.reason
    assert result.n > 10
    assert result.mae == pytest.approx(0.0, abs=1e-6)
    assert result.rmse == pytest.approx(0.0, abs=1e-6)


def test_backtest_on_flat_series_has_near_zero_error():
    pts = _flat(_ts(2026, 5, 24, 21, 0), 2.0, 4 * 3600 // 2, value=42.0)
    result = backtest(pts, horizon=timedelta(hours=1), stride_samples=30)
    assert result.ok
    assert result.mae == pytest.approx(0.0, abs=1e-6)


def test_backtest_on_noisy_flat_has_bounded_rmse():
    pts = _noisy(_ts(2026, 5, 24, 21, 0), 2.0, 4 * 3600 // 2, value=42.0, noise=1.0)
    result = backtest(pts, horizon=timedelta(hours=1), stride_samples=30)
    assert result.ok
    # RMSE on uniform U(-1, 1) noise is sqrt(1/3) ≈ 0.577. Forecast errors
    # are a difference of two noisy samples (predicted - actual), so the
    # error std is ~sqrt(2) * 0.577 ≈ 0.82. Allow plenty of slack — the
    # point is "stays in a sensible band", not exact match.
    assert result.rmse < 1.5


def test_backtest_samples_are_capped_but_aggregates_are_full():
    # 1h of 2s samples, 15min horizon — produces enough anchors to exercise
    # the cap without making the suite slow.
    pts = _flat(_ts(2026, 5, 24, 21, 0), 2.0, 3600 // 2, value=20.0)
    result = backtest(
        pts,
        horizon=timedelta(minutes=15),
        stride_samples=10,
        max_samples_returned=5,
    )
    assert result.ok
    assert len(result.samples) <= 5
    assert result.n > len(result.samples)


# ---------- multi-session ----------


def test_backtest_walks_multiple_sessions_independently():
    # Two 4h sessions with a 1-day gap between them.
    s1 = _ramp(
        _ts(2026, 5, 22, 21, 0),
        2.0,
        4 * 3600 // 2,
        base=25.0,
        slope_per_step=0.5 / (3600 / 2),
    )
    s2 = _ramp(
        _ts(2026, 5, 23, 21, 0),
        2.0,
        4 * 3600 // 2,
        base=22.0,
        slope_per_step=0.8 / (3600 / 2),
    )
    result = backtest(s1 + s2, horizon=timedelta(hours=1), stride_samples=60)
    assert result.ok
    assert result.n > 0
    # Crucially: no anchor "looks across" the day-long gap. Every sample's
    # horizon_end must be within either s1's or s2's time range.
    s1_end = s1[-1]["time"]
    s2_start = s2[0]["time"]
    s2_end = s2[-1]["time"]
    for sample in result.samples:
        in_s1 = sample.horizon_end <= s1_end
        in_s2 = s2_start <= sample.horizon_end <= s2_end
        assert in_s1 or in_s2, f"anchor {sample.anchor} crossed a session gap"


# ---------- insufficient data ----------


def test_backtest_on_empty_is_insufficient():
    result = backtest([], horizon=timedelta(hours=1))
    assert not result.ok
    assert "no points" in (result.reason or "").lower()


def test_backtest_on_session_shorter_than_2x_horizon_yields_no_anchors():
    # 30-min session, 1h horizon — every anchor would have either too
    # little history or no future point at anchor + horizon.
    pts = _flat(_ts(2026, 5, 24, 21, 0), 2.0, 900, value=20.0)
    result = backtest(pts, horizon=timedelta(hours=1))
    assert not result.ok
    assert "no usable anchors" in (result.reason or "").lower()


def test_backtest_rejects_non_positive_horizon():
    pts = _flat(_ts(2026, 5, 24, 21, 0), 2.0, 1000, value=20.0)
    result = backtest(pts, horizon=timedelta(0))
    assert not result.ok


def test_backtest_rejects_zero_stride():
    pts = _flat(_ts(2026, 5, 24, 21, 0), 2.0, 1000, value=20.0)
    result = backtest(pts, horizon=timedelta(hours=1), stride_samples=0)
    assert not result.ok

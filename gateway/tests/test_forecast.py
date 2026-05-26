"""CI Tier 1 unit tests for the pure linear forecaster.

No InfluxDB, no config, no environment required.
"""

from datetime import datetime, timedelta, timezone

import pytest

from llm.forecast import forecast


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


# ---------- happy path ----------


def test_linear_trend_recovers_known_slope():
    # +0.5 °C per hour, 2-second cadence, 3-hour session
    n = 3 * 3600 // 2
    slope_per_step = 0.5 / (3600 / 2)
    pts = _ramp(
        _ts(2026, 5, 24, 21, 0), 2.0, n, base=25.0, slope_per_step=slope_per_step
    )
    result = forecast(pts, horizon=timedelta(hours=1))
    assert result.ok, result.reason
    assert result.slope_per_hour == pytest.approx(0.5, abs=1e-6)
    assert result.fit_point_count == n
    assert result.horizon_end_value == pytest.approx(25.0 + 0.5 * (3 + 1), abs=1e-3)


def test_flat_series_has_zero_slope():
    pts = _flat(_ts(2026, 5, 24, 21, 0), 2.0, 5400, value=42.0)
    result = forecast(pts, horizon=timedelta(hours=1))
    assert result.ok
    assert result.slope_per_hour == pytest.approx(0.0, abs=1e-9)
    assert result.horizon_end_value == pytest.approx(42.0, abs=1e-6)


def test_forecast_points_span_the_horizon():
    pts = _flat(_ts(2026, 5, 24, 21, 0), 2.0, 5400, value=20.0)
    result = forecast(pts, horizon=timedelta(hours=1), n_forecast_steps=12)
    assert result.ok
    assert len(result.points) == 12
    last_obs_time = pts[-1]["time"]
    assert result.points[0].time > last_obs_time
    assert result.points[-1].time == last_obs_time + timedelta(hours=1)


# ---------- session awareness ----------


def test_fits_only_on_current_session_ignoring_prior_session():
    # Yesterday's session: flat at 30. Today's session: rising from 20.
    older = _flat(_ts(2026, 5, 23, 21, 0), 2.0, 5400, value=30.0)
    recent = _ramp(
        _ts(2026, 5, 24, 21, 0),
        2.0,
        5400,
        base=20.0,
        slope_per_step=0.0001,
    )
    result = forecast(older + recent, horizon=timedelta(hours=1))
    assert result.ok
    # Fit was over the recent session only.
    assert result.fit_point_count == len(recent)
    assert result.fit_start == recent[0]["time"]
    # The slope reflects the recent session (small positive), not the jump
    # back down to 20 from the prior session's 30.
    assert result.slope_per_hour > 0
    assert result.slope_per_hour < 1.0


# ---------- insufficient-data branches ----------


def test_empty_input_is_insufficient():
    result = forecast([], horizon=timedelta(hours=1))
    assert not result.ok
    assert "no points" in (result.reason or "").lower()


def test_too_few_points_in_current_session_is_insufficient():
    pts = _flat(_ts(2026, 5, 24, 21, 0), 2.0, 2, value=20.0)
    result = forecast(pts, horizon=timedelta(hours=1))
    assert not result.ok
    assert "session" in (result.reason or "").lower()


def test_session_shorter_than_2x_horizon_is_insufficient():
    # 30-min session, 1h horizon — session_duration < 2 * horizon.
    pts = _flat(_ts(2026, 5, 24, 21, 0), 2.0, 900, value=20.0)
    result = forecast(pts, horizon=timedelta(hours=1))
    assert not result.ok
    assert "horizon" in (result.reason or "").lower() or "2x" in (result.reason or "")


def test_non_positive_horizon_is_insufficient():
    pts = _flat(_ts(2026, 5, 24, 21, 0), 2.0, 5400, value=20.0)
    result = forecast(pts, horizon=timedelta(0))
    assert not result.ok


def test_does_not_fit_across_a_gap_even_with_lots_of_total_points():
    # 5 points yesterday + only 2 points today. Total looks plentiful, but the
    # current session is too small — must refuse rather than fitting across.
    older = _flat(_ts(2026, 5, 23, 21, 0), 2.0, 5400, value=30.0)
    recent = _flat(_ts(2026, 5, 24, 21, 0), 2.0, 2, value=20.0)
    result = forecast(older + recent, horizon=timedelta(hours=1))
    assert not result.ok

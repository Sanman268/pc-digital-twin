"""CI Tier 1 unit tests for the pure baseline + drift detector.

No InfluxDB, no config, no environment required.
"""

import math
from datetime import datetime, timedelta, timezone

import pytest

from llm.drift import compute_baseline, detect_drift


UTC = timezone.utc


def _ts(*args) -> datetime:
    return datetime(*args, tzinfo=UTC)


def _flat(start: datetime, step_s: float, n: int, value: float) -> list[dict]:
    return [
        {"time": start + timedelta(seconds=step_s * i), "value": value}
        for i in range(n)
    ]


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


def _noisy_flat(
    start: datetime, step_s: float, n: int, base: float, seed: int
) -> list[dict]:
    """Pseudo-random small wobble (~±0.5) around ``base``. Deterministic."""
    pts = []
    state = seed
    for i in range(n):
        state = (state * 1103515245 + 12345) & 0x7FFFFFFF
        noise = (state / 0x7FFFFFFF) - 0.5  # in [-0.5, 0.5)
        pts.append(
            {"time": start + timedelta(seconds=step_s * i), "value": base + noise}
        )
    return pts


def _multi_session(*sessions: list[dict]) -> list[dict]:
    """Concatenate sessions with a 1-hour gap between them so the detector
    splits them into separate sessions (gap_threshold defaults to 600s)."""
    out: list[dict] = []
    for s in sessions:
        out.extend(s)
    return out


def _session(day: int, hour: int, n: int, base: float, seed: int) -> list[dict]:
    """One ~3h session of 2-second-cadence noisy-flat data on day ``day``."""
    return _noisy_flat(_ts(2026, 5, day, hour, 0), 2.0, n, base=base, seed=seed)


# ---------- compute_baseline ----------


def test_compute_baseline_excludes_trailing_session():
    # Day 20–22 are baseline (flat around 30); day 23 is "current" (40).
    hist1 = _session(20, 21, 5400, base=30.0, seed=1)
    hist2 = _session(21, 21, 5400, base=30.0, seed=2)
    hist3 = _session(22, 21, 5400, base=30.0, seed=3)
    cur = _session(23, 21, 5400, base=40.0, seed=4)
    pts = _multi_session(hist1, hist2, hist3, cur)
    base = compute_baseline(pts)
    assert base is not None
    assert base.session_count == 3
    # Pooled mean should sit at ~30, not be dragged toward 40.
    assert base.value_mean == pytest.approx(30.0, abs=0.05)
    # Some spread from the noise, well clear of zero.
    assert base.value_stddev > 0.1
    # All historical sessions are flat-ish → slopes near zero.
    assert base.slope_mean is not None and abs(base.slope_mean) < 0.01
    assert base.slope_stddev is not None and base.slope_stddev >= 0


def test_compute_baseline_returns_none_with_only_one_session():
    only = _session(23, 21, 5400, base=30.0, seed=1)
    assert compute_baseline(only) is None


def test_compute_baseline_returns_none_with_no_points():
    assert compute_baseline([]) is None


# ---------- detect_drift: happy paths ----------


def test_drift_normal_when_current_matches_baseline():
    sessions = [
        _session(20, 21, 5400, base=30.0, seed=1),
        _session(21, 21, 5400, base=30.0, seed=2),
        _session(22, 21, 5400, base=30.0, seed=3),
        _session(23, 21, 5400, base=30.0, seed=4),  # current
    ]
    result = detect_drift(_multi_session(*sessions))
    assert result.ok, result.reason
    assert result.status == "normal"
    assert result.z_value is not None and abs(result.z_value) < 1.5
    # All sessions are noisy-flat so baseline slope spread sits below the
    # slope_stddev_floor — the slope channel is intentionally disabled and
    # the verdict rides on z_value alone.
    assert result.z_slope is None
    assert result.baseline_session_count == 3


def test_drift_fault_when_current_value_jumps_far_from_baseline():
    # Baseline at 30 with tight spread; current session sits at 40 (way off).
    sessions = [
        _session(20, 21, 5400, base=30.0, seed=1),
        _session(21, 21, 5400, base=30.0, seed=2),
        _session(22, 21, 5400, base=30.0, seed=3),
        _session(23, 21, 5400, base=40.0, seed=4),  # current, big offset
    ]
    result = detect_drift(_multi_session(*sessions))
    assert result.ok, result.reason
    assert result.z_value is not None and abs(result.z_value) >= 3.0
    assert result.status == "fault"


def test_drift_flagged_when_current_slope_diverges():
    # Historical sessions have *real* slope variation (-0.3, 0.0, +0.5 °C/h
    # plus noise), so baseline slope spread is well above the floor and the
    # slope channel is active. Current session climbs at +5 °C/h — clearly
    # outside the historical envelope.
    def _ramp_session(day, base, slope_per_hour, seed):
        # Combine a clean ramp with a noisy-flat overlay to get realistic
        # slopes plus sample noise.
        clean = _ramp(
            _ts(2026, 5, day, 21, 0),
            2.0,
            5400,
            base=base,
            slope_per_step=slope_per_hour / (3600 / 2),
        )
        noise = _noisy_flat(_ts(2026, 5, day, 21, 0), 2.0, 5400, base=0.0, seed=seed)
        return [
            {"time": c["time"], "value": c["value"] + n["value"]}
            for c, n in zip(clean, noise)
        ]

    sessions = [
        _ramp_session(20, base=30.0, slope_per_hour=-0.3, seed=1),
        _ramp_session(21, base=30.0, slope_per_hour=0.0, seed=2),
        _ramp_session(22, base=30.0, slope_per_hour=0.5, seed=3),
        _ramp_session(23, base=30.0, slope_per_hour=5.0, seed=4),
    ]
    result = detect_drift(_multi_session(*sessions))
    assert result.ok, result.reason
    assert result.current_slope_per_hour == pytest.approx(5.0, abs=0.05)
    assert result.z_slope is not None and abs(result.z_slope) >= 3.0
    # z_value will also be high (the +5°C/h ramp leaves the smoothed tail
    # well above 30 °C) — the contract under test is that *something*
    # lights up, with the slope channel in particular firing.
    assert result.status in ("drifting", "fault")


def test_drift_drifting_band_between_thresholds():
    # Pick an offset that lands z_value in the (k_drift=1.5, k_fault=3.0) band.
    # Baseline noise is ±0.5 → stddev ≈ 0.29; an offset of ~0.6 yields
    # |z_value| ≈ 2.0, which should classify as "drifting".
    sessions = [
        _session(20, 21, 5400, base=30.0, seed=1),
        _session(21, 21, 5400, base=30.0, seed=2),
        _session(22, 21, 5400, base=30.0, seed=3),
        _session(23, 21, 5400, base=30.6, seed=4),
    ]
    result = detect_drift(_multi_session(*sessions))
    assert result.ok, result.reason
    assert result.z_value is not None
    assert 1.5 <= abs(result.z_value) < 3.0
    assert result.status == "drifting"


# ---------- detect_drift: refusal branches ----------


def test_drift_refuses_when_no_historical_baseline():
    only = _session(23, 21, 5400, base=30.0, seed=1)
    result = detect_drift(only)
    assert not result.ok
    assert "historical" in (result.reason or "").lower()


def test_drift_refuses_empty_input():
    result = detect_drift([])
    assert not result.ok
    assert "no points" in (result.reason or "").lower()


def test_drift_refuses_when_baseline_too_sparse():
    # Two historical sessions but each tiny — fewer total samples than the
    # default min_baseline_samples=30 floor.
    sessions = [
        _flat(_ts(2026, 5, 20, 21, 0), 2.0, 5, value=30.0),
        _flat(_ts(2026, 5, 21, 21, 0), 2.0, 5, value=30.0),
        _flat(_ts(2026, 5, 22, 21, 0), 2.0, 5, value=30.0),  # current
    ]
    result = detect_drift(_multi_session(*sessions))
    assert not result.ok
    assert "baseline" in (result.reason or "").lower()
    assert result.baseline_value_n == 10
    assert result.baseline_session_count == 2


# ---------- detect_drift: degenerate baselines ----------


def test_drift_constant_baseline_produces_finite_or_infinite_z_value():
    # Three identical historical sessions (no spread) + offset current.
    # baseline stddev <= floor → any difference becomes inf, exact match becomes 0.
    sessions = [
        _flat(_ts(2026, 5, 20, 21, 0), 2.0, 5400, value=30.0),
        _flat(_ts(2026, 5, 21, 21, 0), 2.0, 5400, value=30.0),
        _flat(_ts(2026, 5, 22, 21, 0), 2.0, 5400, value=30.0),
        _flat(_ts(2026, 5, 23, 21, 0), 2.0, 5400, value=31.0),  # offset
    ]
    result = detect_drift(_multi_session(*sessions))
    assert result.ok, result.reason
    assert result.z_value is not None and math.isinf(result.z_value)
    assert result.status == "fault"


def test_drift_constant_baseline_with_matching_current_is_normal():
    sessions = [
        _flat(_ts(2026, 5, 20, 21, 0), 2.0, 5400, value=30.0),
        _flat(_ts(2026, 5, 21, 21, 0), 2.0, 5400, value=30.0),
        _flat(_ts(2026, 5, 22, 21, 0), 2.0, 5400, value=30.0),
        _flat(_ts(2026, 5, 23, 21, 0), 2.0, 5400, value=30.0),  # matches
    ]
    result = detect_drift(_multi_session(*sessions))
    assert result.ok, result.reason
    assert result.z_value == 0.0
    assert result.status == "normal"


# ---------- detect_drift: current-session details ----------


def test_drift_current_value_is_smoothed_tail():
    # Final 10 samples of the current session are 50.0; the rest are 30.0.
    # current_smoothing_n defaults to 10, so the reported current_value
    # should be ~50, not the session-wide mean.
    pre = _flat(_ts(2026, 5, 23, 21, 0), 2.0, 5390, value=30.0)
    last_10_start = pre[-1]["time"] + timedelta(seconds=2)
    tail = _flat(last_10_start, 2.0, 10, value=50.0)
    current = pre + tail
    sessions = [
        _session(20, 21, 5400, base=30.0, seed=1),
        _session(21, 21, 5400, base=30.0, seed=2),
        _session(22, 21, 5400, base=30.0, seed=3),
        current,
    ]
    result = detect_drift(_multi_session(*sessions))
    assert result.ok, result.reason
    assert result.current_value == pytest.approx(50.0, abs=1e-6)

"""CI Tier 1 unit tests for verify_data.

Pure-function tests — no InfluxDB, no config, no environment required.
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from verify_data import (
    actual_interval_seconds,
    build_report,
    detect_sessions,
    distinct_local_days,
    format_report,
    hour_of_day_histogram,
    largest_gap,
    per_feature_verdict,
)


UTC = timezone.utc


def _ts(*args) -> datetime:
    return datetime(*args, tzinfo=UTC)


def _series(start: datetime, step_s: float, n: int) -> list[datetime]:
    return [start + timedelta(seconds=step_s * i) for i in range(n)]


# ---------- detect_sessions ----------

def test_detect_sessions_splits_at_large_gap():
    a = _series(_ts(2026, 5, 24, 21, 0), 2.0, 100)   # ~3m20s of dense samples
    b = _series(_ts(2026, 5, 25, 21, 0), 2.0, 100)   # next "evening"
    sessions = detect_sessions(a + b, gap_threshold_s=600)
    assert len(sessions) == 2
    assert sessions[0].count == 100
    assert sessions[1].count == 100
    assert sessions[0].start == a[0]
    assert sessions[0].end == a[-1]
    assert sessions[1].start == b[0]


def test_detect_sessions_keeps_contiguous_run_together():
    pts = _series(_ts(2026, 5, 24, 21, 0), 2.0, 500)
    sessions = detect_sessions(pts, gap_threshold_s=600)
    assert len(sessions) == 1
    assert sessions[0].count == 500


def test_detect_sessions_gap_exactly_at_threshold_does_not_split():
    # Threshold is "> gap", so equal-to-threshold stays in same session.
    pts = [
        _ts(2026, 5, 24, 21, 0, 0),
        _ts(2026, 5, 24, 21, 10, 0),  # exactly 600s later
    ]
    sessions = detect_sessions(pts, gap_threshold_s=600)
    assert len(sessions) == 1
    assert sessions[0].count == 2


def test_detect_sessions_gap_just_over_threshold_splits():
    pts = [
        _ts(2026, 5, 24, 21, 0, 0),
        _ts(2026, 5, 24, 21, 10, 1),  # 601s gap
    ]
    sessions = detect_sessions(pts, gap_threshold_s=600)
    assert len(sessions) == 2


def test_detect_sessions_empty_and_single():
    assert detect_sessions([], gap_threshold_s=600) == []
    one = [_ts(2026, 5, 24, 21, 0)]
    sessions = detect_sessions(one, gap_threshold_s=600)
    assert len(sessions) == 1
    assert sessions[0].count == 1
    assert sessions[0].duration == timedelta(0)


# ---------- hour_of_day_histogram ----------

def test_hour_histogram_buckets_by_local_hour():
    tz = ZoneInfo("Asia/Ho_Chi_Minh")  # UTC+7
    # 14:30 UTC == 21:30 local
    pts = [_ts(2026, 5, 24, 14, 30) + timedelta(minutes=i) for i in range(60)]
    hist = hour_of_day_histogram(pts, tz)
    assert sum(hist.values()) == 60
    assert hist[21] == 30  # first half-hour falls in 21:xx local
    assert hist[22] == 30
    assert hist[14] == 0   # UTC hour must not leak through


def test_hour_histogram_always_has_24_keys_even_when_empty():
    hist = hour_of_day_histogram([], ZoneInfo("UTC"))
    assert set(hist.keys()) == set(range(24))
    assert all(v == 0 for v in hist.values())


# ---------- distinct_local_days ----------

def test_distinct_local_days_handles_tz_rollover():
    tz = ZoneInfo("Asia/Ho_Chi_Minh")  # UTC+7
    # 18:00 UTC on May 24 == 01:00 local May 25 — counts as May 25 locally.
    pts = [_ts(2026, 5, 24, 18, 0), _ts(2026, 5, 25, 0, 0)]
    assert distinct_local_days(pts, tz) == 1


# ---------- gap + interval ----------

def test_largest_gap_finds_the_outlier():
    pts = [
        _ts(2026, 5, 24, 21, 0, 0),
        _ts(2026, 5, 24, 21, 0, 2),
        _ts(2026, 5, 24, 23, 30, 0),   # big jump
        _ts(2026, 5, 24, 23, 30, 2),
    ]
    gap = largest_gap(pts)
    assert gap == timedelta(hours=2, minutes=29, seconds=58)


def test_largest_gap_handles_short_series():
    assert largest_gap([]) is None
    assert largest_gap([_ts(2026, 5, 24, 21, 0)]) is None


def test_actual_interval_seconds_on_steady_series():
    pts = _series(_ts(2026, 5, 24, 21, 0), 2.0, 100)
    assert actual_interval_seconds(pts) == 2.0


def test_actual_interval_seconds_short_series_is_none():
    assert actual_interval_seconds([]) is None
    assert actual_interval_seconds([_ts(2026, 5, 24, 21, 0)]) is None


# ---------- verdicts ----------

def test_verdict_evenings_only_host_matches_stage4_doc():
    """A ~4.5h evening session w/ dense samples but no full-day coverage —
    intra-session: GO, seasonal: NOT READY. This is the exact scenario
    STAGE4.md predicts for an intermittently-powered host."""
    pts: list[datetime] = []
    # 6 evening sessions, ~4.5h each, dense @ 2s
    for d in range(6):
        start = _ts(2026, 5, 16 + d, 14, 0)  # 21:00 local in UTC+7
        pts += _series(start, 2.0, int(4.5 * 3600 / 2.0))
    tz = ZoneInfo("Asia/Ho_Chi_Minh")
    report = build_report(
        timestamps=pts,
        tz=tz,
        expected_interval_s=2.0,
        gap_threshold_s=600,
    )
    assert len(report.sessions) == 6
    assert report.verdicts["intra_session_forecast"][0] == "GO"
    assert report.verdicts["time_to_threshold"][0] == "GO"
    assert report.verdicts["seasonal_daily"][0] == "NOT READY"
    assert report.verdicts["long_term_drift"][0] == "PARTIAL"


def test_verdict_full_day_coverage_unlocks_seasonal():
    tz = ZoneInfo("UTC")
    # 3 days of dense data, every hour represented
    pts = _series(_ts(2026, 5, 20, 0, 0), 60.0, 3 * 24 * 60)
    report = build_report(pts, tz, expected_interval_s=60.0, gap_threshold_s=600)
    assert report.verdicts["seasonal_daily"][0] == "GO"


def test_verdict_short_session_fails_intra_session():
    # Only 30 min of data — shorter than 2x the default 1h horizon.
    pts = _series(_ts(2026, 5, 24, 21, 0), 2.0, 900)
    report = build_report(pts, ZoneInfo("UTC"), expected_interval_s=2.0, gap_threshold_s=600)
    assert report.verdicts["intra_session_forecast"][0] == "NOT READY"


def test_verdict_sparse_samples_demotes_to_partial():
    # Long session but sample rate 4x expected — heavy dropout.
    pts = _series(_ts(2026, 5, 24, 21, 0), 8.0, 3000)  # ~6.7h @ 8s
    report = build_report(pts, ZoneInfo("UTC"), expected_interval_s=2.0, gap_threshold_s=600)
    assert report.verdicts["intra_session_forecast"][0] == "PARTIAL"


def test_verdict_empty_series_is_not_ready_everywhere():
    report = build_report([], ZoneInfo("UTC"), expected_interval_s=2.0, gap_threshold_s=600)
    for verdict, _ in report.verdicts.values():
        assert verdict == "NOT READY"


def test_per_feature_verdict_custom_horizon():
    # ~33-min session against a 15-min horizon -> GO (session >= 2*horizon)
    pts = _series(_ts(2026, 5, 24, 21, 0), 2.0, 1000)
    sessions = detect_sessions(pts, gap_threshold_s=600)
    hist = hour_of_day_histogram(pts, ZoneInfo("UTC"))
    days = distinct_local_days(pts, ZoneInfo("UTC"))
    interval = actual_interval_seconds(pts)
    verdicts = per_feature_verdict(
        sessions, hist, days, interval,
        expected_interval_s=2.0,
        forecast_horizon=timedelta(minutes=15),
    )
    assert verdicts["intra_session_forecast"][0] == "GO"


# ---------- formatting smoke ----------

def test_format_report_runs_on_empty_and_populated():
    tz = ZoneInfo("UTC")
    empty = build_report([], tz, 2.0, 600)
    out = format_report(empty, tz)
    assert "No samples" in out

    pts = _series(_ts(2026, 5, 24, 21, 0), 2.0, 1000)
    populated = build_report(pts, tz, 2.0, 600)
    out = format_report(populated, tz)
    assert "Span:" in out
    assert "VERDICT" in out
    assert "RECOMMENDATION" in out

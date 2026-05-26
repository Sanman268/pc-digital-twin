"""Stage 4 Phase 0 — InfluxDB data readiness report.

Inspects the actual contents of the configured Influx bucket and prints a
verdict on which Stage 4 features the data can support today.

Usage (from gateway/ with venv active):
    python verify_data.py                 # report on last 30 days
    python verify_data.py --days 7        # narrow the lookback window
    python verify_data.py --gap-minutes 5 # tighter session boundary

The pure logic (session detection, hour-of-day histogram, verdict) lives in
this file and is unit-tested in tests/test_verify_data.py without touching
InfluxDB. Only ``_fetch_timestamps`` and ``main`` perform I/O.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo


# ---------- pure data model ----------


@dataclass(frozen=True)
class Session:
    start: datetime
    end: datetime
    count: int

    @property
    def duration(self) -> timedelta:
        return self.end - self.start


@dataclass
class ReadinessReport:
    first: Optional[datetime]
    last: Optional[datetime]
    total_samples: int
    expected_interval_s: float
    actual_interval_s: Optional[float]
    largest_gap: Optional[timedelta]
    sessions: list[Session]
    hour_histogram: dict[int, int]
    distinct_days: int
    verdicts: dict[str, tuple[str, str]] = field(default_factory=dict)

    @property
    def span(self) -> Optional[timedelta]:
        if self.first is None or self.last is None:
            return None
        return self.last - self.first


# ---------- pure functions (CI Tier 1 testable) ----------


def detect_sessions(
    timestamps: list[datetime],
    gap_threshold_s: float,
) -> list[Session]:
    """Split a sorted timestamp list into sessions at gaps > threshold.

    A session is a maximal run of consecutive timestamps whose pairwise gap
    stays at or below ``gap_threshold_s`` seconds. Empty input yields [].
    A single timestamp yields one zero-duration session.
    """
    if not timestamps:
        return []
    sessions: list[Session] = []
    run_start = timestamps[0]
    run_count = 1
    prev = timestamps[0]
    for t in timestamps[1:]:
        if (t - prev).total_seconds() > gap_threshold_s:
            sessions.append(Session(start=run_start, end=prev, count=run_count))
            run_start = t
            run_count = 1
        else:
            run_count += 1
        prev = t
    sessions.append(Session(start=run_start, end=prev, count=run_count))
    return sessions


def hour_of_day_histogram(
    timestamps: list[datetime],
    tz: ZoneInfo,
) -> dict[int, int]:
    """Count samples by local clock hour. Always returns keys 0..23."""
    hist = {h: 0 for h in range(24)}
    for t in timestamps:
        local = t.astimezone(tz)
        hist[local.hour] += 1
    return hist


def distinct_local_days(timestamps: list[datetime], tz: ZoneInfo) -> int:
    return len({t.astimezone(tz).date() for t in timestamps})


def largest_gap(timestamps: list[datetime]) -> Optional[timedelta]:
    if len(timestamps) < 2:
        return None
    gap = timedelta(0)
    for a, b in zip(timestamps, timestamps[1:]):
        d = b - a
        if d > gap:
            gap = d
    return gap


def actual_interval_seconds(
    timestamps: list[datetime],
    gap_threshold_s: Optional[float] = None,
) -> Optional[float]:
    """Mean inter-sample interval. None if fewer than 2 points.

    When ``gap_threshold_s`` is set, intervals above the threshold are treated
    as session boundaries and excluded — otherwise an evenings-only host with
    daylong gaps between sessions would look like one slow stream and mask
    the actual within-session sample rate.
    """
    if len(timestamps) < 2:
        return None
    intervals = [(b - a).total_seconds() for a, b in zip(timestamps, timestamps[1:])]
    if gap_threshold_s is not None:
        intervals = [d for d in intervals if d <= gap_threshold_s]
    if not intervals:
        return None
    return sum(intervals) / len(intervals)


def per_feature_verdict(
    sessions: list[Session],
    hour_histogram: dict[int, int],
    distinct_days: int,
    actual_interval_s: Optional[float],
    expected_interval_s: float,
    forecast_horizon: timedelta = timedelta(hours=1),
) -> dict[str, tuple[str, str]]:
    """Judge each Stage 4 feature against the data. Pure.

    Returns ``feature -> (verdict, reason)`` where verdict is one of
    GO / PARTIAL / NOT READY.
    """
    out: dict[str, tuple[str, str]] = {}

    # Density: actual sample rate should be within 2x of expected, else BLE
    # dropout is too heavy for a reliable short-horizon fit.
    dense = (
        actual_interval_s is not None and actual_interval_s <= expected_interval_s * 2.5
    )

    # Intra-session forecast / time_to_threshold: need at least one session
    # twice as long as the forecast horizon.
    long_enough = [s for s in sessions if s.duration >= 2 * forecast_horizon]
    if not sessions:
        intra = ("NOT READY", "no sessions detected")
    elif not long_enough:
        longest = max((s.duration for s in sessions), default=timedelta(0))
        intra = (
            "NOT READY",
            f"longest session {_fmt_td(longest)} < 2x horizon {_fmt_td(2 * forecast_horizon)}",
        )
    elif not dense:
        intra = (
            "PARTIAL",
            f"sample rate ~{actual_interval_s:.1f}s vs expected {expected_interval_s:.1f}s",
        )
    else:
        intra = (
            "GO",
            f"{len(long_enough)} session(s) >= {_fmt_td(2 * forecast_horizon)}",
        )

    out["intra_session_forecast"] = intra
    out["time_to_threshold"] = intra  # same prerequisites

    # Seasonal / daily pattern: need every hour of the day covered across
    # several distinct days.
    hours_covered = sum(1 for c in hour_histogram.values() if c > 0)
    if hours_covered == 24 and distinct_days >= 3:
        seasonal = ("GO", f"24h coverage across {distinct_days} days")
    elif hours_covered == 24:
        seasonal = ("PARTIAL", f"24h coverage but only {distinct_days} day(s)")
    else:
        missing = 24 - hours_covered
        seasonal = ("NOT READY", f"{missing}/24 clock hours empty")
    out["seasonal_daily"] = seasonal

    # Long-term drift: ≥14 sessions of comparable conditions.
    n = len(sessions)
    if n >= 14:
        drift = ("GO", f"{n} sessions")
    elif n >= 3:
        drift = ("PARTIAL", f"{n} sessions -- need ~14+")
    else:
        drift = ("NOT READY", f"only {n} session(s)")
    out["long_term_drift"] = drift

    return out


def build_report(
    timestamps: list[datetime],
    tz: ZoneInfo,
    expected_interval_s: float,
    gap_threshold_s: float,
    forecast_horizon: timedelta = timedelta(hours=1),
) -> ReadinessReport:
    """Compose all pure stats into a single report. No I/O."""
    sessions = detect_sessions(timestamps, gap_threshold_s)
    hist = hour_of_day_histogram(timestamps, tz)
    days = distinct_local_days(timestamps, tz)
    interval = actual_interval_seconds(timestamps, gap_threshold_s)
    gap = largest_gap(timestamps)
    verdicts = per_feature_verdict(
        sessions, hist, days, interval, expected_interval_s, forecast_horizon
    )
    return ReadinessReport(
        first=timestamps[0] if timestamps else None,
        last=timestamps[-1] if timestamps else None,
        total_samples=len(timestamps),
        expected_interval_s=expected_interval_s,
        actual_interval_s=interval,
        largest_gap=gap,
        sessions=sessions,
        hour_histogram=hist,
        distinct_days=days,
        verdicts=verdicts,
    )


# ---------- formatting ----------


def _fmt_td(td: timedelta) -> str:
    """Compact human duration: '4h 22m', '19h 04m', '0m 12s'."""
    total = int(td.total_seconds())
    sign = "-" if total < 0 else ""
    total = abs(total)
    days, rem = divmod(total, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, seconds = divmod(rem, 60)
    if days:
        return f"{sign}{days}d {hours:02d}h {minutes:02d}m"
    if hours:
        return f"{sign}{hours}h {minutes:02d}m"
    if minutes:
        return f"{sign}{minutes}m {seconds:02d}s"
    return f"{sign}{seconds}s"


def _bar(count: int, peak: int, width: int = 8) -> str:
    if peak <= 0:
        return ""
    n = round(count / peak * width)
    return "#" * n


def format_report(r: ReadinessReport, tz: ZoneInfo) -> str:
    lines: list[str] = []
    lines.append("=== InfluxDB Data Readiness Report ===")
    if r.total_samples == 0:
        lines.append("No samples found in the configured bucket / window.")
        return "\n".join(lines)

    assert r.first is not None and r.last is not None  # total_samples > 0
    span = r.span or timedelta(0)
    first_local = r.first.astimezone(tz).strftime("%Y-%m-%d %H:%M")
    last_local = r.last.astimezone(tz).strftime("%Y-%m-%d %H:%M")
    lines.append(f"Span:            {_fmt_td(span)}  ({first_local}  ->  {last_local})")
    lines.append(f"Total samples:   {r.total_samples:,}")
    if r.actual_interval_s is not None:
        ratio = (
            r.actual_interval_s / r.expected_interval_s if r.expected_interval_s else 0
        )
        flag = "OK" if ratio <= 1.5 else ("HIGH" if ratio <= 3 else "VERY HIGH")
        lines.append(
            f"Actual rate:     ~{r.actual_interval_s:.1f}s/sample "
            f"(expected {r.expected_interval_s:.1f}s)  {flag}"
        )
    if r.largest_gap is not None:
        lines.append(f"Largest gap:     {_fmt_td(r.largest_gap)}")
    lines.append("")

    # Sessions
    lines.append(f"Sessions (gap > threshold):   {len(r.sessions)}")
    if r.sessions:
        durations = [s.duration for s in r.sessions]
        avg = sum((d.total_seconds() for d in durations), 0.0) / len(durations)
        lines.append(f"  avg length:           {_fmt_td(timedelta(seconds=avg))}")
        lines.append(
            f"  shortest / longest:   {_fmt_td(min(durations))} / {_fmt_td(max(durations))}"
        )
    lines.append("")

    # Hour-of-day histogram
    lines.append("Hour-of-day coverage (local tz):")
    peak = max(r.hour_histogram.values()) if r.hour_histogram else 0
    nonzero_hours = [h for h, c in r.hour_histogram.items() if c > 0]
    if not nonzero_hours:
        lines.append("  (no samples)")
    else:
        for h in range(24):
            c = r.hour_histogram[h]
            if c == 0:
                lines.append(f"  {h:02d}h  {'':8}  -")
            else:
                lines.append(f"  {h:02d}h  {_bar(c, peak):<8}  {c}")
    lines.append(f"Distinct local days: {r.distinct_days}")
    lines.append("")

    # Verdicts
    lines.append("VERDICT")
    label = {
        "intra_session_forecast": "intra-session forecast (<=1h)",
        "time_to_threshold": "time_to_threshold",
        "seasonal_daily": "seasonal / daily",
        "long_term_drift": "long-term drift",
    }
    for key, (verdict, reason) in r.verdicts.items():
        lines.append(f"  {label.get(key, key):30}  {verdict:10} ({reason})")
    lines.append("")

    # Recommendation
    lines.append("RECOMMENDATION")
    intra_v = r.verdicts.get("intra_session_forecast", ("", ""))[0]
    seasonal_v = r.verdicts.get("seasonal_daily", ("", ""))[0]
    if intra_v == "GO" and seasonal_v != "GO":
        lines.append(
            "  Scope Stage 4 to intra-session prediction. Reset forecast state"
        )
        lines.append("  on each session boundary. Revisit seasonal after 24/7 capture.")
    elif intra_v == "GO" and seasonal_v == "GO":
        lines.append(
            "  Data supports the full Stage 4 plan (intra-session + seasonal)."
        )
    else:
        lines.append("  Data is not yet sufficient for prediction. Collect more before")
        lines.append("  building forecast tools, or accept very short horizons only.")

    return "\n".join(lines)


# ---------- I/O layer ----------


def _fetch_timestamps(field_name: str, days: int) -> list[datetime]:
    """Pull all sample timestamps for one field over the lookback window.

    Filtering on a single field that every reading writes (temperature_c by
    default) gives one row per sample. Returns sorted, tz-aware datetimes.
    """
    # Local import so the pure functions above can be imported (and tested)
    # without an Influx client / config on the path.
    from config import get_settings
    from influx.writer import query_api

    s = get_settings()
    flux = f'''
    from(bucket: "{s.influxdb_bucket}")
      |> range(start: -{days}d)
      |> filter(fn: (r) => r._measurement == "case_sensor_data")
      |> filter(fn: (r) => r._field == "{field_name}")
      |> keep(columns: ["_time"])
    '''
    tables = query_api().query(flux, org=s.influxdb_org)
    times: list[datetime] = []
    for table in tables:
        for rec in table.records:
            t = rec.get_time()
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            times.append(t)
    times.sort()
    return times


# ---------- CLI ----------


def main() -> int:
    ap = argparse.ArgumentParser(description="Stage 4 Phase 0 — data readiness report.")
    ap.add_argument(
        "--days", type=int, default=30, help="Lookback window in days (default 30)."
    )
    ap.add_argument(
        "--gap-minutes",
        type=float,
        default=10.0,
        help="Inter-sample gap above which a new session starts (default 10).",
    )
    ap.add_argument(
        "--field",
        default="temperature_c",
        help="Influx field used to count samples (default temperature_c).",
    )
    args = ap.parse_args()

    from config import get_settings  # late import: pure tests don't need it

    s = get_settings()
    tz = ZoneInfo(s.local_tz)

    print(
        f"Querying InfluxDB at {s.influxdb_url} (bucket={s.influxdb_bucket}, last {args.days}d) ..."
    )
    try:
        timestamps = _fetch_timestamps(args.field, args.days)
    except Exception as e:
        print(f"ERROR: failed to query InfluxDB: {e}", file=sys.stderr)
        return 2

    report = build_report(
        timestamps=timestamps,
        tz=tz,
        expected_interval_s=s.ble_sample_interval,
        gap_threshold_s=args.gap_minutes * 60.0,
    )
    print()
    print(format_report(report, tz))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

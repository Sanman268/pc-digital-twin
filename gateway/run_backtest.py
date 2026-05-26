"""Stage 4 Phase 5 — capture live forecast-accuracy numbers.

Calls the same ``execute_forecast_accuracy`` path the chat agent uses,
for each (metric × horizon) combination, against the configured
InfluxDB bucket. Prints a markdown table suitable for pasting into the
README so the published accuracy numbers are honest and reproducible.

Usage (from gateway/ with venv active):
    python run_backtest.py                        # all metrics, 7d history,
                                                  # horizons 15m + 1h + 6h
    python run_backtest.py --history 24h
    python run_backtest.py --metrics temperature humidity
    python run_backtest.py --horizons 15m 1h
"""

from __future__ import annotations

import argparse
import sys

from llm.executor import (
    ForecastAccuracyParams,
    HORIZON_TO_TIMEDELTA,
    METRIC_TO_FIELD,
    execute_forecast_accuracy,
)

# Some units (°C, m/s²) are not in Windows cp1252. Force UTF-8 on stdout so
# the printed markdown table is paste-ready even when redirected.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--history",
        default="7d",
        help="History window for the backtest (1h / 6h / 24h / 7d). Default 7d.",
    )
    ap.add_argument(
        "--metrics",
        nargs="*",
        default=list(METRIC_TO_FIELD.keys()),
        help="Metrics to evaluate. Default: all five.",
    )
    ap.add_argument(
        "--horizons",
        nargs="*",
        default=list(HORIZON_TO_TIMEDELTA.keys()),
        help="Horizons to evaluate. Default: 15m, 1h, 6h.",
    )
    args = ap.parse_args()

    rows: list[str] = []
    print(f"history_window = {args.history}")
    print()
    print("| metric | horizon | anchors | MAE | RMSE | unit | note |")
    print("|---|---|---:|---:|---:|---|---|")

    for metric in args.metrics:
        if metric not in METRIC_TO_FIELD:
            rows.append(f"unknown metric '{metric}'")
            continue
        for horizon in args.horizons:
            if horizon not in HORIZON_TO_TIMEDELTA:
                rows.append(f"unknown horizon '{horizon}'")
                continue
            result = execute_forecast_accuracy(
                ForecastAccuracyParams(
                    metric=metric,  # type: ignore[arg-type]
                    history_window=args.history,
                    horizon=horizon,  # type: ignore[arg-type]
                )
            )
            unit = result.get("unit", "")
            if result.get("ok"):
                print(
                    f"| {metric} | {horizon} | {result['n_anchors']} "
                    f"| {result['mae']} | {result['rmse']} | {unit} |  |"
                )
            else:
                print(
                    f"| {metric} | {horizon} | 0 | — | — | {unit} "
                    f"| {result.get('reason', 'no result')} |"
                )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

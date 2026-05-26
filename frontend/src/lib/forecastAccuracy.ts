// Stage 4 Phase 5 — measured RMSE per (metric, horizon) from
// `python gateway/run_backtest.py --history 7d` against the local
// fm_simulation bucket on 2026-05-26. These power the confidence band
// drawn alongside the dashed forecast line. Refresh by re-running
// run_backtest.py and pasting the numbers from the markdown table.
//
// 6h horizon is intentionally absent: no single intra-session window
// in the captured data was long enough to backtest at that horizon.

import type { ForecastHorizon, ForecastMetric } from '../types/sensor'

export const FORECAST_RMSE: Record<
  ForecastMetric,
  Partial<Record<ForecastHorizon, number>>
> = {
  temperature: { '15m': 1.22, '1h': 1.17 },
  humidity:    { '15m': 5.07, '1h': 8.17 },
  pressure:    { '15m': 1.03, '1h': 1.80 },
  vibration:   { '15m': 1.10, '1h': 1.12 },
  light:       { '15m': 4.38, '1h': 4.94 },
}

export function rmseFor(
  metric: ForecastMetric,
  horizon: ForecastHorizon,
): number | null {
  return FORECAST_RMSE[metric]?.[horizon] ?? null
}

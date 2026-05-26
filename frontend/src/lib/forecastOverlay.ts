import type {
  ForecastHorizon,
  ForecastMetric,
  ForecastResponse,
  HistoryPoint,
} from '../types/sensor'
import { rmseFor } from './forecastAccuracy'

/**
 * Combined chart row consumed by Recharts: every history sample sits
 * here with `value` set and `forecast`/band fields null; forecast rows
 * sit *after* the history span with `value` null and the forecast
 * fields populated. The last history point is duplicated with both
 * fields set so the dashed forecast line visually anchors to it.
 */
export interface ChartRow {
  time: string
  value: number | null
  forecast: number | null
  band_low: number | null
  band_high: number | null
}

export function combineHistoryAndForecast(
  history: HistoryPoint[],
  forecast: ForecastResponse | null,
  metric: ForecastMetric,
  horizon: ForecastHorizon,
): ChartRow[] {
  const rows: ChartRow[] = history.map((p) => ({
    time: p.time,
    value: p.value,
    forecast: null,
    band_low: null,
    band_high: null,
  }))

  if (!forecast || !forecast.ok || forecast.points.length === 0) {
    return rows
  }

  const rmse = rmseFor(metric, horizon)
  const lastHistory = history.length ? history[history.length - 1] : null

  // Anchor the dashed line at the last observed sample so it does not
  // float free of the history curve.
  if (lastHistory) {
    rows[rows.length - 1] = {
      ...rows[rows.length - 1],
      forecast: lastHistory.value,
      band_low: rmse == null ? null : lastHistory.value - rmse,
      band_high: rmse == null ? null : lastHistory.value + rmse,
    }
  }

  for (const p of forecast.points) {
    rows.push({
      time: p.time,
      value: null,
      forecast: p.value,
      band_low: rmse == null ? null : p.value - rmse,
      band_high: rmse == null ? null : p.value + rmse,
    })
  }
  return rows
}

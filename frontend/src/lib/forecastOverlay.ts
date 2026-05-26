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
 *
 * The numeric `t` column (ms since epoch) is what the chart's XAxis
 * binds to — a categorical XAxis on `time` would crush the forecast
 * to the rightmost ~7 % of the chart width regardless of how far
 * forward the forecast actually extends.
 */
export interface ChartRow {
  time: string
  t: number
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
    t: new Date(p.time).getTime(),
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
      t: new Date(p.time).getTime(),
      value: null,
      forecast: p.value,
      band_low: rmse == null ? null : p.value - rmse,
      band_high: rmse == null ? null : p.value + rmse,
    })
  }
  return rows
}

/**
 * Timestamp (ms since epoch) of the boundary between history and
 * forecast — i.e. the last observed sample. Used to drop a subtle
 * vertical reference line on the chart so the user sees "now". Returns
 * null when there's no history yet.
 */
export function nowBoundaryMs(history: HistoryPoint[]): number | null {
  if (history.length === 0) return null
  return new Date(history[history.length - 1].time).getTime()
}

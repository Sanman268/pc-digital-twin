import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useSettings } from '../settings/SettingsContext'
import type {
  ForecastHistoryWindow,
  ForecastHorizon,
  ForecastMetric,
  ForecastResponse,
} from '../types/sensor'

/**
 * Poll the gateway's /api/forecast endpoint for an intra-session
 * projection of the given metric. Re-uses the settings hook so the
 * forecast refreshes at the same cadence as the history charts and
 * honours the pause toggle / manual refresh.
 *
 * Returns `null` until the first fetch returns. Returns the typed
 * response (with `ok=false` and a `reason` when the current session is
 * too short to support a forecast) so callers can choose to hide the
 * overlay rather than render a misleading line.
 */
export function useForecast(
  metric: ForecastMetric,
  historyWindow: ForecastHistoryWindow,
  horizon: ForecastHorizon,
) {
  const { pollIntervalMs, paused, refreshTick } = useSettings()
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await api.get<ForecastResponse>('/forecast', {
          params: { metric, history_window: historyWindow, horizon },
        })
        if (!cancelled) setForecast(res.data)
      } catch (e) {
        if (!cancelled) setError(e)
      }
    }
    load()
    if (paused) return () => { cancelled = true }
    const id = setInterval(load, pollIntervalMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [metric, historyWindow, horizon, pollIntervalMs, paused, refreshTick])

  return { forecast, error }
}

import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useSettings } from '../settings/SettingsContext'
import type {
  ForecastDirection,
  ForecastHistoryWindow,
  ForecastMetric,
  ThresholdResponse,
} from '../types/sensor'

/**
 * Poll the gateway's /api/threshold endpoint for an ETA on when the
 * current-session trend will cross ``threshold``. Same cadence and
 * pause/refresh semantics as useSensorData / useForecast.
 *
 * Returns ``null`` until the first fetch completes. Returns the typed
 * response (which may carry ``ok=false`` plus a ``reason`` when the
 * current session is too short, the trend is flat, or it points the
 * wrong way) so the badge component can choose to hide itself.
 */
export function useThreshold(
  metric: ForecastMetric,
  threshold: number,
  direction: ForecastDirection,
  historyWindow: ForecastHistoryWindow = '1h',
) {
  const { pollIntervalMs, paused, refreshTick } = useSettings()
  const [result, setResult] = useState<ThresholdResponse | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await api.get<ThresholdResponse>('/threshold', {
          params: {
            metric,
            threshold,
            direction,
            history_window: historyWindow,
          },
        })
        if (!cancelled) setResult(res.data)
      } catch (e) {
        if (!cancelled) setError(e)
      }
    }
    load()
    if (paused) return () => { cancelled = true }
    const id = setInterval(load, pollIntervalMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [metric, threshold, direction, historyWindow, pollIntervalMs, paused, refreshTick])

  return { threshold: result, error }
}

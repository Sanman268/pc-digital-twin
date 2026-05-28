import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useSettings } from '../settings/SettingsContext'
import type {
  DriftResponse,
  ForecastHistoryWindow,
  ForecastMetric,
} from '../types/sensor'

/**
 * Poll /api/drift for a per-metric drift verdict (normal / drifting /
 * fault) against the baseline of prior sessions. Same cadence, pause,
 * and refresh semantics as useSensorData / useForecast / useThreshold,
 * so the drift badge, chart, and chat all freeze together when the user
 * pauses or hits manual refresh.
 *
 * Returns ``null`` until the first fetch completes. ok=false carries a
 * ``reason`` (e.g. "no historical baseline yet") so the badge component
 * can render a soft "warming up" hint instead of pretending everything
 * is fine.
 */
export function useDrift(
  metric: ForecastMetric,
  baselineWindow: ForecastHistoryWindow = '7d',
) {
  const { pollIntervalMs, paused, refreshTick } = useSettings()
  const [drift, setDrift] = useState<DriftResponse | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await api.get<DriftResponse>('/drift', {
          params: { metric, baseline_window: baselineWindow },
        })
        if (!cancelled) setDrift(res.data)
      } catch (e) {
        if (!cancelled) setError(e)
      }
    }
    load()
    if (paused) return () => { cancelled = true }
    const id = setInterval(load, pollIntervalMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [metric, baselineWindow, pollIntervalMs, paused, refreshTick])

  return { drift, error }
}

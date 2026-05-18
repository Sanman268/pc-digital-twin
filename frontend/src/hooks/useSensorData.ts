import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { HistoryPoint } from '../types/sensor'
import { useSettings } from '../settings/SettingsContext'

export function useSensorData(field: string) {
  const { pollIntervalMs, historyRange, paused, refreshTick } = useSettings()
  const [data, setData] = useState<HistoryPoint[]>([])
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await api.get<HistoryPoint[]>('/sensor/history', {
          params: { field, range: historyRange },
        })
        if (!cancelled) setData(res.data)
      } catch (e) {
        if (!cancelled) setError(e)
      }
    }
    load()
    if (paused) return () => { cancelled = true }
    const id = setInterval(load, pollIntervalMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [field, historyRange, pollIntervalMs, paused, refreshTick])

  return { data, error }
}

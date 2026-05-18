import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { HistoryPoint } from '../types/sensor'

export function useSensorData(field: string, range = '1h', intervalMs = 5000) {
  const [data, setData] = useState<HistoryPoint[]>([])
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await api.get<HistoryPoint[]>('/sensor/history', { params: { field, range } })
        if (!cancelled) setData(res.data)
      } catch (e) {
        if (!cancelled) setError(e)
      }
    }
    load()
    const id = setInterval(load, intervalMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [field, range, intervalMs])

  return { data, error }
}

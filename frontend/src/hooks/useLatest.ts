import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { LatestSnapshot } from '../types/sensor'

export function useLatest(intervalMs = 5000) {
  const [latest, setLatest] = useState<LatestSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await api.get<LatestSnapshot>('/sensor/latest')
        if (!cancelled) setLatest(res.data)
      } catch {
        if (!cancelled) setLatest(null)
      }
    }
    load()
    const id = setInterval(load, intervalMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [intervalMs])

  return latest
}

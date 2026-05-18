import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { GatewayStatus } from '../types/sensor'

export function useGatewayStatus(intervalMs = 5000) {
  const [status, setStatus] = useState<GatewayStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await api.get<GatewayStatus>('/status/gateway')
        if (!cancelled) setStatus(res.data)
      } catch {
        if (!cancelled) setStatus(null)
      }
    }
    load()
    const id = setInterval(load, intervalMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [intervalMs])

  return status
}

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export type HistoryRange = '5m' | '15m' | '1h' | '6h' | '24h'

export const RANGE_OPTIONS: HistoryRange[] = ['5m', '15m', '1h', '6h', '24h']
export const INTERVAL_OPTIONS = [1000, 2000, 5000, 10000, 30000] as const

interface SettingsState {
  pollIntervalMs: number
  historyRange: HistoryRange
  paused: boolean
  refreshTick: number
  setPollIntervalMs: (ms: number) => void
  setHistoryRange: (r: HistoryRange) => void
  setPaused: (p: boolean) => void
  togglePaused: () => void
  refreshNow: () => void
}

const Ctx = createContext<SettingsState | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [pollIntervalMs, setPollIntervalMs] = useState<number>(5000)
  const [historyRange, setHistoryRange] = useState<HistoryRange>('1h')
  const [paused, setPaused] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const refreshNow = useCallback(() => setRefreshTick(t => t + 1), [])
  const togglePaused = useCallback(() => setPaused(p => !p), [])

  return (
    <Ctx.Provider value={{
      pollIntervalMs, historyRange, paused, refreshTick,
      setPollIntervalMs, setHistoryRange, setPaused,
      togglePaused, refreshNow,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSettings(): SettingsState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSettings must be used within <SettingsProvider>')
  return ctx
}

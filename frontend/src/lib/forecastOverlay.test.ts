import { describe, expect, it } from 'vitest'
import { combineHistoryAndForecast, nowBoundaryMs } from './forecastOverlay'
import type { ForecastResponse, HistoryPoint } from '../types/sensor'

function mkHistory(times: string[], baseValue = 25): HistoryPoint[] {
  return times.map((time, i) => ({ time, value: baseValue + i * 0.1 }))
}

function mkForecast(
  points: { time: string; value: number }[],
  partial?: Partial<ForecastResponse>,
): ForecastResponse {
  return {
    ok: true,
    metric: 'temperature',
    field: 'temperature_c',
    unit: '°C',
    history_window: '1h',
    horizon: '1h',
    points,
    ...partial,
  }
}

describe('combineHistoryAndForecast', () => {
  const history = mkHistory([
    '2026-05-26T08:00:00Z',
    '2026-05-26T08:01:00Z',
    '2026-05-26T08:02:00Z',
  ])
  const forecastPoints = [
    { time: '2026-05-26T08:07:00Z', value: 26.5 },
    { time: '2026-05-26T08:12:00Z', value: 27.0 },
    { time: '2026-05-26T08:17:00Z', value: 27.5 },
  ]

  it('emits a numeric t column equal to ms-since-epoch of time', () => {
    const rows = combineHistoryAndForecast(history, null, 'temperature', '1h')
    expect(rows).toHaveLength(history.length)
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].t).toBe(new Date(history[i].time).getTime())
    }
  })

  it('places every forecast row strictly later than the last history row', () => {
    const rows = combineHistoryAndForecast(
      history,
      mkForecast(forecastPoints),
      'temperature',
      '1h',
    )
    // History rows + forecast rows. The boundary (last history) carries
    // both value and forecast, but stays at its own t.
    const lastHistoryT = new Date(history[history.length - 1].time).getTime()
    const forecastRows = rows.filter((r) => r.value === null && r.forecast != null)
    expect(forecastRows).toHaveLength(forecastPoints.length)
    for (const r of forecastRows) {
      expect(r.t).toBeGreaterThan(lastHistoryT)
    }
  })

  it('anchors the dashed line by duplicating the last history value as forecast at the boundary', () => {
    const rows = combineHistoryAndForecast(
      history,
      mkForecast(forecastPoints),
      'temperature',
      '1h',
    )
    const boundary = rows[history.length - 1]
    const lastHistory = history[history.length - 1]
    expect(boundary.t).toBe(new Date(lastHistory.time).getTime())
    expect(boundary.value).toBe(lastHistory.value)
    expect(boundary.forecast).toBe(lastHistory.value)
  })

  it('sets band_low/band_high to forecast ± RMSE for known (metric, horizon)', () => {
    // forecastAccuracy.ts ships RMSE for temperature @ 1h = 1.17.
    const rows = combineHistoryAndForecast(
      history,
      mkForecast(forecastPoints),
      'temperature',
      '1h',
    )
    const futureRows = rows.filter((r) => r.value === null && r.forecast != null)
    for (const r of futureRows) {
      expect(r.forecast).not.toBeNull()
      const f = r.forecast as number
      expect(r.band_low).toBeCloseTo(f - 1.17, 5)
      expect(r.band_high).toBeCloseTo(f + 1.17, 5)
    }
  })

  it('returns only history rows when forecast is null or ok=false', () => {
    const noneRows = combineHistoryAndForecast(history, null, 'temperature', '1h')
    expect(noneRows).toHaveLength(history.length)
    expect(noneRows.every((r) => r.forecast === null)).toBe(true)

    const refused = mkForecast([], { ok: false, reason: 'session too short' })
    const refusedRows = combineHistoryAndForecast(history, refused, 'temperature', '1h')
    expect(refusedRows).toHaveLength(history.length)
    expect(refusedRows.every((r) => r.forecast === null)).toBe(true)
  })
})

describe('nowBoundaryMs', () => {
  it('returns the ms timestamp of the last history sample', () => {
    const history = mkHistory(['2026-05-26T08:00:00Z', '2026-05-26T08:01:00Z'])
    expect(nowBoundaryMs(history)).toBe(new Date('2026-05-26T08:01:00Z').getTime())
  })

  it('returns null when history is empty', () => {
    expect(nowBoundaryMs([])).toBeNull()
  })
})

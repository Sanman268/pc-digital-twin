export interface HistoryPoint {
  time: string
  value: number
}

export interface ForecastPoint {
  time: string
  value: number
}

export interface ForecastResponse {
  ok: boolean
  metric: string
  field: string
  unit: string
  history_window: string
  horizon: string
  reason?: string | null
  slope_per_hour?: number | null
  fit_start?: string | null
  fit_end?: string | null
  fit_point_count?: number | null
  horizon_end?: string | null
  horizon_end_value?: number | null
  points: ForecastPoint[]
}

export type ForecastMetric =
  | 'temperature'
  | 'humidity'
  | 'pressure'
  | 'vibration'
  | 'light'

export type ForecastHorizon = '15m' | '1h' | '6h'

export type ForecastHistoryWindow = '1h' | '6h' | '24h' | '7d'

export interface LatestSnapshot {
  temperature_c?: number
  humidity_pct?: number
  pressure_hpa?: number
  light_lux?: number
  air_quality_index?: number
  co2_ppm?: number
  vibration_rms?: number
}

export interface GatewayStatus {
  connected: boolean
  last_seen: string | null
  node_id: string
}

export type SensorState = 'normal' | 'warning' | 'critical' | 'offline'

export const STATE_COLORS: Record<SensorState, string> = {
  normal: '#00ff88',
  warning: '#ffaa00',
  critical: '#ff3333',
  offline: '#666666',
}

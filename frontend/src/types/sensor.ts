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

export type ForecastDirection = 'above' | 'below'

export interface ThresholdResponse {
  ok: boolean
  metric: string
  field: string
  unit: string
  history_window: string
  threshold: number
  direction: ForecastDirection
  reason?: string | null
  already_crossed: boolean
  current_value?: number | null
  slope_per_hour?: number | null
  eta_minutes?: number | null
  crossing_time?: string | null
  fit_start?: string | null
  fit_end?: string | null
  fit_point_count?: number | null
}

export type DriftStatus = 'normal' | 'drifting' | 'fault'

export interface DriftResponse {
  ok: boolean
  metric: string
  field: string
  unit: string
  baseline_window: string
  reason?: string | null
  status?: DriftStatus | null
  drift_score?: number | null
  drift_score_is_infinite?: boolean
  z_value?: number | null
  z_value_is_infinite?: boolean
  z_slope?: number | null
  z_slope_is_infinite?: boolean
  current_value?: number | null
  current_slope_per_hour?: number | null
  current_session_start?: string | null
  current_session_end?: string | null
  current_fit_point_count?: number | null
  baseline_value_mean?: number | null
  baseline_value_stddev?: number | null
  baseline_value_n?: number | null
  baseline_slope_mean?: number | null
  baseline_slope_stddev?: number | null
  baseline_session_count?: number | null
  baseline_span_start?: string | null
  baseline_span_end?: string | null
}

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

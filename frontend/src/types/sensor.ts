export interface HistoryPoint {
  time: string
  value: number
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

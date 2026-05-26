import type { ThresholdResponse } from '../../types/sensor'

interface Props {
  result: ThresholdResponse | null
  unit: string
  decimals?: number
}

function formatEta(minutes: number): string {
  if (minutes < 1) return '< 1m'
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes - h * 60)
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatCrossingTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * "Predicted to reach X at ~HH:MM (in 2h 15m)" badge. Renders nothing
 * when the result is missing or the forecaster refused (ok=false /
 * trend heading the wrong way / session too short) so the chart card
 * stays clean rather than showing a noisy placeholder.
 */
export default function ThresholdBadge({ result, unit, decimals = 1 }: Props) {
  if (!result) return null

  const arrow = result.direction === 'above' ? '↑' : '↓'
  const thresholdText = `${result.threshold.toFixed(decimals)} ${unit}`

  if (!result.ok) {
    return null
  }

  if (result.already_crossed) {
    const side = result.direction === 'above' ? 'above' : 'below'
    return (
      <div className="dim" style={{ fontSize: 11, padding: '4px 8px' }}>
        {arrow} Currently {side} {thresholdText}
      </div>
    )
  }

  if (result.crossing_time == null || result.eta_minutes == null) return null

  return (
    <div className="dim mono" style={{ fontSize: 11, padding: '4px 8px' }}>
      {arrow} Predicted to reach {thresholdText} at ~{formatCrossingTime(result.crossing_time)}
      {' '}<span style={{ opacity: 0.7 }}>(in {formatEta(result.eta_minutes)})</span>
    </div>
  )
}

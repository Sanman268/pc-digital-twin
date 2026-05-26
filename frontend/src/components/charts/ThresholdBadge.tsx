import type { ThresholdResponse } from '../../types/sensor'

interface Props {
  result: ThresholdResponse | null
  unit: string
  decimals?: number
}

// Warm orange for "approaching upper limit", cool blue for "approaching
// lower limit" — communicates direction at a glance without needing to
// read the arrow character.
const ABOVE_COLOR = '#ff8c4a'
const BELOW_COLOR = '#4aa3ff'

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
 * "Predicted to reach X at ~HH:MM (in 2h 15m)" badge that sits under
 * the chart card. Renders nothing when the forecaster refused
 * (ok=false / flat trend / session too short / pointing the wrong
 * way) so the card stays clean rather than displaying placeholder
 * text. The arrow + label get a directional colour so the user spots
 * the warning before reading the number.
 */
export default function ThresholdBadge({ result, unit, decimals = 1 }: Props) {
  if (!result || !result.ok) return null

  const isAbove = result.direction === 'above'
  const arrow = isAbove ? '↑' : '↓'
  const arrowColor = isAbove ? ABOVE_COLOR : BELOW_COLOR
  const thresholdText = `${result.threshold.toFixed(decimals)} ${unit}`

  const container: React.CSSProperties = {
    fontSize: 12,
    padding: '5px 10px',
    borderTop: '1px solid var(--border, rgba(255,255,255,0.08))',
    color: 'var(--text-secondary, #ccc)',
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    fontFamily: 'var(--font-mono, monospace)',
  }

  if (result.already_crossed) {
    const side = isAbove ? 'above' : 'below'
    return (
      <div style={container}>
        <span style={{ color: arrowColor, fontWeight: 600 }}>{arrow}</span>
        <span>Currently {side} {thresholdText}</span>
      </div>
    )
  }

  if (result.crossing_time == null || result.eta_minutes == null) return null

  return (
    <div style={container}>
      <span style={{ color: arrowColor, fontWeight: 600 }}>{arrow}</span>
      <span>
        Predicted to reach <span style={{ color: 'var(--text, #fff)' }}>{thresholdText}</span> at
        {' ~'}{formatCrossingTime(result.crossing_time)}
      </span>
      <span style={{ opacity: 0.65 }}>(in {formatEta(result.eta_minutes)})</span>
    </div>
  )
}

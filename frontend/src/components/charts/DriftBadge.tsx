import type { DriftResponse, DriftStatus } from '../../types/sensor'

interface Props {
  result: DriftResponse | null
}

const STATUS_COLOR: Record<DriftStatus, string> = {
  normal: '#3ddc84',     // calm green
  drifting: '#ffb547',   // warm amber
  fault: '#ff5d6c',      // hot red
}

const STATUS_LABEL: Record<DriftStatus, string> = {
  normal: 'normal',
  drifting: 'DRIFTING',
  fault: 'FAULT',
}

function formatZ(value: number | null | undefined, isInf: boolean): string {
  if (isInf) return '∞'
  if (value == null) return '—'
  const abs = Math.abs(value)
  if (abs < 10) return value.toFixed(2)
  if (abs < 100) return value.toFixed(1)
  return value.toFixed(0)
}

/**
 * Per-chart drift badge — renders the current status pill plus the
 * baseline z-scores driving it. When the baseline isn't ready yet
 * (single-session install, sparse history) we render a quiet "baseline
 * warming up" hint instead of hiding entirely, so the user can tell
 * the missing dot isn't a bug.
 */
export default function DriftBadge({ result }: Props) {
  const container: React.CSSProperties = {
    fontSize: 12,
    padding: '5px 10px',
    borderTop: '1px solid var(--border, rgba(255,255,255,0.08))',
    color: 'var(--text-secondary, #ccc)',
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    fontFamily: 'var(--font-mono, monospace)',
    flexWrap: 'wrap',
  }

  if (!result) return null

  if (!result.ok || !result.status) {
    const reason = result.reason ?? 'baseline warming up'
    return (
      <div style={{ ...container, opacity: 0.7 }} title={reason}>
        <span style={{ color: 'var(--text-dim, rgba(255,255,255,0.45))' }}>○</span>
        <span>Baseline warming up</span>
      </div>
    )
  }

  const color = STATUS_COLOR[result.status]
  const label = STATUS_LABEL[result.status]
  const zValue = formatZ(result.z_value, result.z_value_is_infinite ?? false)
  const zSlopePresent = result.z_slope != null || result.z_slope_is_infinite
  const zSlope = zSlopePresent
    ? formatZ(result.z_slope ?? null, result.z_slope_is_infinite ?? false)
    : null

  // Choose a tooltip that names the driving channel so the user can
  // tell whether "drifting" means "value sits outside normal" or
  // "session is changing faster than usual".
  const channel =
    zSlope != null && Math.abs(result.z_slope ?? 0) > Math.abs(result.z_value ?? 0)
      ? 'slope'
      : 'value'
  const title =
    result.status === 'normal'
      ? `Current session sits inside the baseline of ${result.baseline_session_count ?? '?'} prior sessions.`
      : `${label} driven by the ${channel} channel — current ${channel} ${
          channel === 'value' ? 'reading' : 'slope'
        } is ${zValue}σ from baseline.`

  return (
    <div style={container} title={title}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${color}`,
          display: 'inline-block',
        }}
      />
      <span style={{ color, fontWeight: result.status === 'normal' ? 500 : 700 }}>
        {label}
      </span>
      <span style={{ opacity: 0.8 }}>
        z_value <span style={{ color: 'var(--text, #fff)' }}>{zValue}</span>
        {zSlope != null && (
          <>
            {' · '}z_slope <span style={{ color: 'var(--text, #fff)' }}>{zSlope}</span>
          </>
        )}
      </span>
    </div>
  )
}

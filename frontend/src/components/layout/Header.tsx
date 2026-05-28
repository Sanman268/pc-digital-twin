import { useGatewayStatus } from '../../hooks/useGatewayStatus'
import { useDrift } from '../../hooks/useDrift'
import type { DriftResponse, DriftStatus, ForecastMetric } from '../../types/sensor'

const DRIFT_METRICS: ForecastMetric[] = ['temperature', 'humidity', 'vibration']

// Sample cadence is ~2 s. Anything beyond 30 s without a fresh reading
// means the gateway's "connected" flag is lying — the BLE link died in a
// way that did not trip the disconnect handler (host sleep, peer
// vanished). Show a stale state rather than a misleading green pill.
const STALE_AFTER_MS = 30_000

const STATUS_RANK: Record<DriftStatus, number> = {
  normal: 0,
  drifting: 1,
  fault: 2,
}

const STATUS_COLOR: Record<DriftStatus, string> = {
  normal: '#3ddc84',
  drifting: '#ffb547',
  fault: '#ff5d6c',
}

const STATUS_LABEL: Record<DriftStatus, string> = {
  normal: 'Operational',
  drifting: 'Drifting',
  fault: 'Fault',
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - t)
  if (diff < 5_000)   return 'just now'
  if (diff < 60_000)  return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}

/** Reduce the per-metric drift responses to a single worst-status pill. */
function rollupStatus(
  results: { metric: ForecastMetric; drift: DriftResponse | null }[],
): { status: DriftStatus | null; metric: ForecastMetric | null; ready: boolean } {
  const ok = results.filter(r => r.drift && r.drift.ok && r.drift.status)
  if (ok.length === 0) {
    return { status: null, metric: null, ready: false }
  }
  let worst = ok[0]
  for (const candidate of ok.slice(1)) {
    const a = STATUS_RANK[candidate.drift!.status as DriftStatus]
    const b = STATUS_RANK[worst.drift!.status as DriftStatus]
    if (a > b) worst = candidate
  }
  return {
    status: worst.drift!.status as DriftStatus,
    metric: worst.metric,
    ready: true,
  }
}

export default function Header() {
  const status = useGatewayStatus()
  const connected = status?.connected ?? false
  const lastSeenMs = status?.last_seen ? new Date(status.last_seen).getTime() : null
  const stale =
    connected &&
    lastSeenMs != null &&
    Date.now() - lastSeenMs > STALE_AFTER_MS
  let pillClass: string
  let stateText: string
  if (!connected) {
    pillClass = 'pill'
    stateText = 'BLE disconnected'
  } else if (stale) {
    pillClass = 'pill'
    stateText = 'BLE stale'
  } else {
    pillClass = 'pill ok'
    stateText = 'BLE connected'
  }

  // Per-metric drift polls — hooks must run unconditionally and in stable order.
  const temperature = useDrift('temperature')
  const humidity = useDrift('humidity')
  const vibration = useDrift('vibration')
  const driftPolls = [
    { metric: DRIFT_METRICS[0], drift: temperature.drift },
    { metric: DRIFT_METRICS[1], drift: humidity.drift },
    { metric: DRIFT_METRICS[2], drift: vibration.drift },
  ]
  const rollup = rollupStatus(driftPolls)

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '14px 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h1>PC Digital Twin</h1>
        <span className="dim mono" style={{ fontSize: 12 }}>v0.6.0</span>
      </div>

      <div style={{ flex: 1 }} />

      {rollup.ready && rollup.status && (
        <span
          className="pill"
          style={{
            background: 'transparent',
            border: `1px solid ${STATUS_COLOR[rollup.status]}`,
            color: STATUS_COLOR[rollup.status],
          }}
          title={
            rollup.status === 'normal'
              ? 'All monitored metrics sit inside their baseline envelopes.'
              : `${STATUS_LABEL[rollup.status]} — driven by ${rollup.metric}.`
          }
        >
          <span
            className="dot"
            style={{
              background: STATUS_COLOR[rollup.status],
              boxShadow: `0 0 8px ${STATUS_COLOR[rollup.status]}`,
            }}
          />
          {STATUS_LABEL[rollup.status]}
          {rollup.status !== 'normal' && rollup.metric && (
            <span className="dim" style={{ marginLeft: 6, fontSize: 11 }}>
              ({rollup.metric})
            </span>
          )}
        </span>
      )}

      <span className={pillClass}>
        <span className="dot" />
        {stateText}
      </span>
      {status?.node_id && (
        <span className="muted mono" style={{ fontSize: 12 }}>
          {status.node_id}
        </span>
      )}
      <span className="dim" style={{ fontSize: 12 }}>
        last seen <span className="mono">{formatRelative(status?.last_seen ?? null)}</span>
      </span>
    </header>
  )
}

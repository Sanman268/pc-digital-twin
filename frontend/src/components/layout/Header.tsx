import { useGatewayStatus } from '../../hooks/useGatewayStatus'

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - t)
  if (diff < 5_000)   return 'just now'
  if (diff < 60_000)  return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}

export default function Header() {
  const status = useGatewayStatus()
  const connected = status?.connected ?? false
  const pillClass = connected ? 'pill ok' : 'pill'
  const stateText = connected ? 'BLE connected' : 'BLE disconnected'

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
        <span className="dim mono" style={{ fontSize: 12 }}>v0.2.2</span>
      </div>

      <div style={{ flex: 1 }} />

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

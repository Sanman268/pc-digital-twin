import { useGatewayStatus } from '../../hooks/useGatewayStatus'

export default function StatusBar() {
  const status = useGatewayStatus()
  return (
    <footer style={{
      display: 'flex',
      gap: 16,
      alignItems: 'center',
      padding: '8px 24px',
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-card)',
      fontSize: 11,
      color: 'var(--text-dim)',
    }}>
      <span>asset <span className="mono muted">{status?.node_id ?? 'PC_CASE_001'}</span></span>
      <span>·</span>
      <span>gateway <span className="mono muted">localhost:8000</span></span>
      <span>·</span>
      <span>influx <span className="mono muted">localhost:8086</span></span>
      <span style={{ flex: 1 }} />
      <span className="dim">PC Digital Twin · MIT</span>
    </footer>
  )
}

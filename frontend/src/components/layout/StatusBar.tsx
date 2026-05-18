import { useGatewayStatus } from '../../hooks/useGatewayStatus'

export default function StatusBar() {
  const status = useGatewayStatus()
  const dot = status?.connected ? '#00ff88' : '#ff3333'
  return (
    <footer style={{
      padding: '8px 16px',
      borderTop: '1px solid #222',
      display: 'flex',
      gap: 12,
      alignItems: 'center',
      fontSize: 12,
    }}>
      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: dot }} />
      <span>{status?.connected ? 'BLE connected' : 'BLE disconnected'}</span>
      {status?.node_id && <span style={{ opacity: 0.6 }}>node: {status.node_id}</span>}
      {status?.last_seen && <span style={{ opacity: 0.6 }}>last seen: {status.last_seen}</span>}
    </footer>
  )
}

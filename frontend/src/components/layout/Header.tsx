export default function Header() {
  return (
    <header style={{
      padding: '12px 16px',
      borderBottom: '1px solid #222',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <h2 style={{ margin: 0 }}>PC Digital Twin</h2>
      <span style={{ opacity: 0.6, fontSize: 12 }}>v0.1.0</span>
    </header>
  )
}

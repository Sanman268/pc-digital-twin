export default function AlertBadge({ count }: { count: number }) {
  return (
    <span style={{
      background: 'rgba(255, 51, 51, 0.15)',
      color: '#ff7575',
      border: '1px solid rgba(255, 51, 51, 0.4)',
      borderRadius: 999,
      padding: '2px 10px',
      fontSize: 11,
      fontWeight: 600,
      fontFamily: 'var(--font-mono)',
    }}>
      {count} issue{count === 1 ? '' : 's'}
    </span>
  )
}

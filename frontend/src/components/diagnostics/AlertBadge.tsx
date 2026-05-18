export default function AlertBadge({ count }: { count: number }) {
  return (
    <span style={{
      background: '#ff3333',
      color: 'white',
      borderRadius: 12,
      padding: '2px 8px',
      fontSize: 12,
      fontWeight: 600,
    }}>
      {count} issue{count === 1 ? '' : 's'}
    </span>
  )
}

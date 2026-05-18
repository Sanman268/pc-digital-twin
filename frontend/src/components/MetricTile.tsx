interface MetricTileProps {
  label: string
  value: number | null | undefined
  unit: string
  precision?: number
  accent?: string
  hint?: string
}

export default function MetricTile({
  label,
  value,
  unit,
  precision = 1,
  accent,
  hint,
}: MetricTileProps) {
  const formatted = value == null || Number.isNaN(value)
    ? '—'
    : value.toFixed(precision)
  return (
    <div className="card" style={{ minHeight: 96 }}>
      <div className="card-header" style={{ marginBottom: 8 }}>
        <span className="card-title">{label}</span>
        {accent && <span className="dot" style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: accent, boxShadow: `0 0 8px ${accent}`,
        }} />}
      </div>
      <div>
        <span className="metric-value">{formatted}</span>
        <span className="metric-unit">{unit}</span>
      </div>
      {hint && <div className="metric-sub">{hint}</div>}
    </div>
  )
}

interface Props {
  color: string
}

/**
 * Compact inline legend strip that goes alongside a chart title and
 * explains the three overlay layers introduced in Stage 4 Phase 4:
 *
 *   ━━ history (solid filled area)
 *   ╌╌ forecast (dashed line, intra-session linear projection)
 *   ▓  ±RMSE band (semi-transparent shading around the forecast)
 *
 * Stays in one row, tiny and dim so it does not compete with the
 * card title for attention.
 */
export default function ChartLegend({ color }: Props) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 10,
        color: 'var(--text-dim, #888)',
        whiteSpace: 'nowrap',
      }}
    >
      <Swatch>
        <span style={{ display: 'inline-block', width: 14, height: 2, background: color }} />
        history
      </Swatch>
      <Swatch>
        <span
          style={{
            display: 'inline-block',
            width: 14,
            height: 2,
            background: `repeating-linear-gradient(to right, ${color} 0 4px, transparent 4px 8px)`,
          }}
        />
        forecast
      </Swatch>
      <Swatch>
        <span
          style={{
            display: 'inline-block',
            width: 14,
            height: 8,
            background: color,
            opacity: 0.18,
            borderRadius: 1,
          }}
        />
        ±RMSE
      </Swatch>
    </span>
  )
}

function Swatch({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {children}
    </span>
  )
}

import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useSensorData } from '../../hooks/useSensorData'

// The Thunderboard's BLE payload does not include a CO2 field, so the
// BLE parser falls back to 0 for every sample. Rendering "0 ppm" as a
// live reading would imply real measurement -- detect the all-zeros
// case and surface it as unsupported instead.
function isAllZeros(values: number[]): boolean {
  return values.length > 0 && values.every((v) => v === 0)
}

export default function AirQualityChart() {
  const { data } = useSensorData('co2_ppm')
  const values = data.map((d) => d.value)
  const unsupported = isAllZeros(values)
  const latest = data.length ? data[data.length - 1].value : null

  return (
    <div className="card" style={{ height: 200, display: 'flex', flexDirection: 'column' }}>
      <div className="card-header">
        <span className="card-title">CO₂</span>
        <span>
          <span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>
            {unsupported || latest == null ? '—' : latest.toFixed(0)}
          </span>
          <span className="metric-unit">ppm</span>
        </span>
      </div>
      {unsupported ? (
        <div
          className="dim"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            textAlign: 'center',
            padding: '0 12px',
            lineHeight: 1.4,
          }}
        >
          CO₂ is not reported by the Thunderboard's stock firmware.
          The dashboard would otherwise show a flat 0 ppm line.
        </div>
      ) : (
        <div style={{ flex: 1, marginLeft: -8 }}>
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="g-co2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="var(--chart-4)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" hide />
              <YAxis domain={['auto', 'auto']} width={42} tickFormatter={(v) => v.toFixed(0)} />
              <Tooltip
                formatter={(v: number) => [`${v.toFixed(0)} ppm`, 'CO₂']}
                labelFormatter={(l) => new Date(l).toLocaleTimeString()}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--chart-4)"
                strokeWidth={1.8}
                fill="url(#g-co2)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

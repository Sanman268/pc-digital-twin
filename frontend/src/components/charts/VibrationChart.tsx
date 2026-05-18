import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useSensorData } from '../../hooks/useSensorData'

export default function VibrationChart() {
  const { data } = useSensorData('vibration_rms')
  const latest = data.length ? data[data.length - 1].value : null
  return (
    <div className="card" style={{ height: 200, display: 'flex', flexDirection: 'column' }}>
      <div className="card-header">
        <span className="card-title">Vibration RMS</span>
        <span>
          <span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>
            {latest == null ? '—' : latest.toFixed(0)}
          </span>
          <span className="metric-unit">mg</span>
        </span>
      </div>
      <div style={{ flex: 1, marginLeft: -8 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="g-vib" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="var(--chart-3)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" hide />
            <YAxis domain={['auto', 'auto']} width={48} tickFormatter={(v) => v.toFixed(0)} />
            <Tooltip
              formatter={(v: number) => [`${v.toFixed(1)} mg`, 'Vibration']}
              labelFormatter={(l) => new Date(l).toLocaleTimeString()}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--chart-3)"
              strokeWidth={1.8}
              fill="url(#g-vib)"
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

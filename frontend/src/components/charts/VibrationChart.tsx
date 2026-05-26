import { AreaChart, Area, CartesianGrid, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useSensorData } from '../../hooks/useSensorData'
import { useForecast } from '../../hooks/useForecast'
import { combineHistoryAndForecast } from '../../lib/forecastOverlay'

export default function VibrationChart() {
  const { data } = useSensorData('vibration_rms')
  const { forecast } = useForecast('vibration', '1h', '15m')
  const latest = data.length ? data[data.length - 1].value : null
  const rows = combineHistoryAndForecast(data, forecast, 'vibration', '15m')
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
          <AreaChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
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
              formatter={(v: unknown, name: string) => {
                if (typeof v !== 'number') return ['', ''] as [string, string]
                if (name === 'forecast') return [`${v.toFixed(1)} mg`, 'Forecast']
                return [`${v.toFixed(1)} mg`, 'Vibration']
              }}
              labelFormatter={(l) => new Date(l).toLocaleTimeString()}
            />
            <Area
              type="monotone"
              dataKey={(d: { band_low: number | null; band_high: number | null }) => [d.band_low, d.band_high]}
              stroke="none"
              fill="var(--chart-3)"
              fillOpacity={0.12}
              isAnimationActive={false}
              activeDot={false}
              tooltipType="none"
              name="±1 RMSE"
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--chart-3)"
              strokeWidth={1.8}
              fill="url(#g-vib)"
              isAnimationActive={false}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="var(--chart-3)"
              strokeWidth={1.6}
              strokeDasharray="6 4"
              isAnimationActive={false}
              dot={false}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

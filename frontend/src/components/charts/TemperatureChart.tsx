import { AreaChart, Area, CartesianGrid, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useSensorData } from '../../hooks/useSensorData'
import { useForecast } from '../../hooks/useForecast'
import { combineHistoryAndForecast } from '../../lib/forecastOverlay'

export default function TemperatureChart() {
  const { data } = useSensorData('temperature_c')
  const { forecast } = useForecast('temperature', '1h', '15m')
  const latest = data.length ? data[data.length - 1].value : null
  const rows = combineHistoryAndForecast(data, forecast, 'temperature', '15m')
  return (
    <div className="card" style={{ height: 200, display: 'flex', flexDirection: 'column' }}>
      <div className="card-header">
        <span className="card-title">Temperature</span>
        <span>
          <span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>
            {latest == null ? '—' : latest.toFixed(2)}
          </span>
          <span className="metric-unit">°C</span>
        </span>
      </div>
      <div style={{ flex: 1, marginLeft: -8 }}>
        <ResponsiveContainer>
          <AreaChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="g-temp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="var(--chart-1)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" hide />
            <YAxis domain={['auto', 'auto']} width={36} tickFormatter={(v) => v.toFixed(1)} />
            <Tooltip
              formatter={(v: number, name: string) => {
                if (v == null) return ['—', name]
                if (name === 'forecast') return [`${v.toFixed(2)} °C`, 'Forecast']
                return [`${v.toFixed(2)} °C`, 'Temperature']
              }}
              labelFormatter={(l) => new Date(l).toLocaleTimeString()}
            />
            <Area
              type="monotone"
              dataKey={(d: { band_low: number | null; band_high: number | null }) => [d.band_low, d.band_high]}
              stroke="none"
              fill="var(--chart-1)"
              fillOpacity={0.12}
              isAnimationActive={false}
              activeDot={false}
              name="±1 RMSE"
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--chart-1)"
              strokeWidth={1.8}
              fill="url(#g-temp)"
              isAnimationActive={false}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="var(--chart-1)"
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

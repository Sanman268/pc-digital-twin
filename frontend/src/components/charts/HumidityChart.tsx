import { AreaChart, Area, CartesianGrid, Line, ReferenceLine, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useSensorData } from '../../hooks/useSensorData'
import { useForecast } from '../../hooks/useForecast'
import { useThreshold } from '../../hooks/useThreshold'
import { combineHistoryAndForecast, nowBoundaryMs } from '../../lib/forecastOverlay'
import ChartLegend from './ChartLegend'
import ThresholdBadge from './ThresholdBadge'

const HUMIDITY_CEILING_PCT = 75
const FORECAST_HORIZON = '1h'

export default function HumidityChart() {
  const { data } = useSensorData('humidity_pct')
  const { forecast } = useForecast('humidity', '1h', FORECAST_HORIZON)
  const { threshold } = useThreshold('humidity', HUMIDITY_CEILING_PCT, 'above')
  const latest = data.length ? data[data.length - 1].value : null
  const rows = combineHistoryAndForecast(data, forecast, 'humidity', FORECAST_HORIZON)
  const nowMs = nowBoundaryMs(data)
  return (
    <div className="card" style={{ height: 220, display: 'flex', flexDirection: 'column' }}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span className="card-title">Humidity</span>
          <ChartLegend color="var(--chart-2)" />
        </div>
        <span>
          <span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>
            {latest == null ? '—' : latest.toFixed(2)}
          </span>
          <span className="metric-unit">%</span>
        </span>
      </div>
      <div style={{ flex: 1, marginLeft: -8 }}>
        <ResponsiveContainer>
          <AreaChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="g-hum" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="var(--chart-2)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              hide
            />
            <YAxis domain={[0, 100]} width={36} tickFormatter={(v) => v.toFixed(0)} />
            {nowMs != null && (
              <ReferenceLine
                x={nowMs}
                stroke="var(--text-dim, rgba(255,255,255,0.35))"
                strokeDasharray="2 4"
                strokeWidth={1}
              />
            )}
            <Tooltip
              formatter={(v: unknown, name: string) => {
                if (typeof v !== 'number') return ['', ''] as [string, string]
                if (name === 'forecast') return [`${v.toFixed(2)} %`, 'Forecast']
                return [`${v.toFixed(2)} %`, 'Humidity']
              }}
              labelFormatter={(l) => new Date(l).toLocaleTimeString()}
            />
            <Area
              type="monotone"
              dataKey={(d: { band_low: number | null; band_high: number | null }) => [d.band_low, d.band_high]}
              stroke="none"
              fill="var(--chart-2)"
              fillOpacity={0.10}
              isAnimationActive={false}
              activeDot={false}
              tooltipType="none"
              name="±1 RMSE"
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--chart-2)"
              strokeWidth={1.8}
              fill="url(#g-hum)"
              isAnimationActive={false}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="var(--chart-2)"
              strokeWidth={2.2}
              strokeDasharray="8 5"
              isAnimationActive={false}
              dot={false}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ThresholdBadge result={threshold} unit="%" decimals={0} />
    </div>
  )
}

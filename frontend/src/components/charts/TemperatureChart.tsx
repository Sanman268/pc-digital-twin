import { AreaChart, Area, CartesianGrid, Line, ReferenceLine, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useSensorData } from '../../hooks/useSensorData'
import { useForecast } from '../../hooks/useForecast'
import { useThreshold } from '../../hooks/useThreshold'
import { useDrift } from '../../hooks/useDrift'
import { combineHistoryAndForecast, nowBoundaryMs } from '../../lib/forecastOverlay'
import ChartLegend from './ChartLegend'
import ThresholdBadge from './ThresholdBadge'
import DriftBadge from './DriftBadge'

const TEMP_CEILING_C = 35
// 15m horizon needs >= 30min of in-session history, which almost
// every working session has -- so the dashed overlay actually shows
// up. The earlier reason for using 1h here (right-edge compression
// against a categorical XAxis) was resolved by the time-axis fix in
// 2cb63f1.
const FORECAST_HORIZON = '15m'

export default function TemperatureChart() {
  const { data } = useSensorData('temperature_c')
  const { forecast } = useForecast('temperature', '1h', FORECAST_HORIZON)
  const { threshold } = useThreshold('temperature', TEMP_CEILING_C, 'above')
  const { drift } = useDrift('temperature')
  const latest = data.length ? data[data.length - 1].value : null
  const rows = combineHistoryAndForecast(data, forecast, 'temperature', FORECAST_HORIZON)
  const nowMs = nowBoundaryMs(data)
  return (
    <div className="card" style={{ height: 220, display: 'flex', flexDirection: 'column' }}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span className="card-title">Temperature</span>
          <ChartLegend color="var(--chart-1)" />
        </div>
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
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              hide
            />
            <YAxis domain={['auto', 'auto']} width={36} tickFormatter={(v) => v.toFixed(1)} />
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
              strokeWidth={2.2}
              strokeDasharray="8 5"
              isAnimationActive={false}
              dot={false}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ThresholdBadge result={threshold} unit="°C" decimals={1} />
      <DriftBadge result={drift} />
    </div>
  )
}

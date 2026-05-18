import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useSensorData } from '../../hooks/useSensorData'

export default function AirQualityChart() {
  const { data } = useSensorData('co2_ppm')
  return (
    <div style={{ height: 180 }}>
      <h4 style={{ margin: '4px 0' }}>CO₂ (ppm)</h4>
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis dataKey="time" hide />
          <YAxis domain={['auto', 'auto']} width={50} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#00aa66" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

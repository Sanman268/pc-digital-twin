import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useSensorData } from '../../hooks/useSensorData'

export default function HumidityChart() {
  const { data } = useSensorData('humidity_pct')
  return (
    <div style={{ height: 180 }}>
      <h4 style={{ margin: '4px 0' }}>Humidity (%)</h4>
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis dataKey="time" hide />
          <YAxis domain={[0, 100]} width={40} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#0088ff" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

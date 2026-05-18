import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useSensorData } from '../../hooks/useSensorData'

export default function TemperatureChart() {
  const { data } = useSensorData('temperature_c')
  return (
    <div style={{ height: 180 }}>
      <h4 style={{ margin: '4px 0' }}>Temperature (°C)</h4>
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis dataKey="time" hide />
          <YAxis domain={['auto', 'auto']} width={40} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#ff6600" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

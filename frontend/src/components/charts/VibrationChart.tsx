import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useSensorData } from '../../hooks/useSensorData'

export default function VibrationChart() {
  const { data } = useSensorData('vibration_rms')
  return (
    <div style={{ height: 180 }}>
      <h4 style={{ margin: '4px 0' }}>Vibration RMS (mg)</h4>
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis dataKey="time" hide />
          <YAxis domain={['auto', 'auto']} width={40} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#aa00ff" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

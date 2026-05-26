import TemperatureChart from './charts/TemperatureChart'
import HumidityChart from './charts/HumidityChart'
import VibrationChart from './charts/VibrationChart'

/**
 * Right-sidebar sensor panel. Stacks the three live-reading charts that the
 * Thunderboard stock firmware actually reports — temperature, humidity, and
 * vibration RMS — and closes with a note explaining the missing CO₂ feed.
 */
export default function SensorPanel() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#ff8a1a', boxShadow: '0 0 8px #ff8a1a',
        }} />
        <span className="card-title">Sensor Live Readings</span>
      </div>

      <TemperatureChart />
      <HumidityChart />
      <VibrationChart />

      <div className="sensor-panel-note">
        CO₂ is not available from the Thunderboard stock firmware.
      </div>
    </>
  )
}

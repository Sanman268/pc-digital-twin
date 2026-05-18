import Header from './components/layout/Header'
import StatusBar from './components/layout/StatusBar'
import MetricTile from './components/MetricTile'
import TemperatureChart from './components/charts/TemperatureChart'
import HumidityChart from './components/charts/HumidityChart'
import VibrationChart from './components/charts/VibrationChart'
import AirQualityChart from './components/charts/AirQualityChart'
import PCTwinViewer from './components/twin3d/PCTwinViewer'
import DiagnosticsPanel from './components/diagnostics/DiagnosticsPanel'
import { useLatest } from './hooks/useLatest'

function tempAccent(t?: number) {
  if (t == null) return 'var(--offline)'
  if (t > 70) return 'var(--crit)'
  if (t > 55) return 'var(--warn)'
  return 'var(--accent)'
}

export default function App() {
  const latest = useLatest()

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <main style={{
        flex: 1,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        maxWidth: 1600,
        width: '100%',
        margin: '0 auto',
      }}>
        {/* KPI strip */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
        }}>
          <MetricTile
            label="Temperature"
            value={latest?.temperature_c}
            unit="°C"
            precision={2}
            accent={tempAccent(latest?.temperature_c)}
            hint="internal case, near front panel"
          />
          <MetricTile
            label="Humidity"
            value={latest?.humidity_pct}
            unit="%"
            precision={2}
            hint="relative humidity"
          />
          <MetricTile
            label="Pressure"
            value={latest?.pressure_hpa}
            unit="hPa"
            precision={1}
            hint="barometric"
          />
          <MetricTile
            label="Vibration RMS"
            value={latest?.vibration_rms}
            unit="mg"
            precision={0}
            hint="3-axis accelerometer"
          />
        </section>

        {/* 3D viewer + chart grid */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          minHeight: 520,
        }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <PCTwinViewer />
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
          }}>
            <TemperatureChart />
            <HumidityChart />
            <VibrationChart />
            <AirQualityChart />
          </div>
        </section>

        {/* Diagnostics */}
        <section>
          <DiagnosticsPanel />
        </section>
      </main>

      <StatusBar />
    </div>
  )
}

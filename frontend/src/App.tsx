import Header from './components/layout/Header'
import StatusBar from './components/layout/StatusBar'
import TemperatureChart from './components/charts/TemperatureChart'
import HumidityChart from './components/charts/HumidityChart'
import VibrationChart from './components/charts/VibrationChart'
import AirQualityChart from './components/charts/AirQualityChart'
import PCTwinViewer from './components/twin3d/PCTwinViewer'
import DiagnosticsPanel from './components/diagnostics/DiagnosticsPanel'

export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <Header />
      <main style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 16 }}>
        <section style={{ height: 480 }}>
          <PCTwinViewer />
        </section>
        <section style={{ display: 'grid', gap: 12 }}>
          <TemperatureChart />
          <HumidityChart />
          <VibrationChart />
          <AirQualityChart />
        </section>
        <section style={{ gridColumn: '1 / -1' }}>
          <DiagnosticsPanel />
        </section>
      </main>
      <StatusBar />
    </div>
  )
}

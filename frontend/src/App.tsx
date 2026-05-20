import Header from './components/layout/Header'
import StatusBar from './components/layout/StatusBar'
import Controls from './components/Controls'
import PCTwinViewer from './components/twin3d/PCTwinViewer'
import { SettingsProvider } from './settings/SettingsContext'

function Dashboard() {
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
        <Controls />

        {/* Full-width 3D viewer — sensor charts live in the marker popup */}
        <section
          className="card"
          style={{
            padding: 0,
            overflow: 'hidden',
            height: 'min(78vh, 820px)',
            display: 'flex',
          }}
        >
          <PCTwinViewer />
        </section>

      </main>

      <StatusBar />
    </div>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <Dashboard />
    </SettingsProvider>
  )
}

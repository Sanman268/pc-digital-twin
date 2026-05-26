import Header from './components/layout/Header'
import StatusBar from './components/layout/StatusBar'
import Controls from './components/Controls'
import PCTwinViewer from './components/twin3d/PCTwinViewer'
import ChatPanel from './components/chat/ChatPanel'
import SensorPanel from './components/SensorPanel'
import { SettingsProvider } from './settings/SettingsContext'

function Dashboard() {
  return (
    <div className="app-shell">
      <Header />

      <div className="dashboard-controls">
        <Controls />
      </div>

      <main className="dashboard-main">
        {/* Left: diagnostics chat */}
        <aside className="dashboard-col dashboard-left card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#00e5ff', boxShadow: '0 0 8px #00e5ff',
            }} />
            <span className="card-title">Diagnostics Chat</span>
          </div>
          <ChatPanel embedded />
        </aside>

        {/* Center: 3D PC case viewer — the main canvas */}
        <section className="dashboard-col dashboard-center">
          <div className="card twin-viewer" style={{ padding: 0, overflow: 'hidden', display: 'flex', flex: 1 }}>
            <PCTwinViewer />
          </div>
        </section>

        {/* Right: live sensor readings */}
        <aside className="dashboard-col dashboard-right">
          <SensorPanel />
        </aside>
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

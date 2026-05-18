import {
  useSettings,
  RANGE_OPTIONS,
  INTERVAL_OPTIONS,
  type HistoryRange,
} from '../settings/SettingsContext'

function formatInterval(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  if (ms < 60000) return `${ms / 1000} s`
  return `${ms / 60000} m`
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span className="dim" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      {children}
    </label>
  )
}

export default function Controls() {
  const {
    historyRange, setHistoryRange,
    pollIntervalMs, setPollIntervalMs,
    paused, togglePaused,
    refreshNow,
  } = useSettings()

  return (
    <div className="card" style={{
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      padding: '10px 16px',
      flexWrap: 'wrap',
    }}>
      <Field label="Range">
        <select
          value={historyRange}
          onChange={(e) => setHistoryRange(e.target.value as HistoryRange)}
        >
          {RANGE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>

      <Field label="Refresh">
        <select
          value={pollIntervalMs}
          onChange={(e) => setPollIntervalMs(Number(e.target.value))}
          disabled={paused}
          title={paused ? 'Resume live mode to change refresh rate' : ''}
          style={paused ? { opacity: 0.5 } : undefined}
        >
          {INTERVAL_OPTIONS.map(ms => (
            <option key={ms} value={ms}>{formatInterval(ms)}</option>
          ))}
        </select>
      </Field>

      <div style={{ flex: 1 }} />

      {paused ? (
        <span className="pill warn">
          <span className="dot" />
          PAUSED
        </span>
      ) : (
        <span className="dim mono" style={{ fontSize: 11 }}>
          live · polling every {formatInterval(pollIntervalMs)}
        </span>
      )}

      <button onClick={togglePaused} title={paused ? 'Resume live updates' : 'Stop polling'}>
        {paused ? '▶ Resume' : '⏸ Pause'}
      </button>

      <button onClick={refreshNow} title="Fetch latest data now">
        ↻ Refresh
      </button>
    </div>
  )
}

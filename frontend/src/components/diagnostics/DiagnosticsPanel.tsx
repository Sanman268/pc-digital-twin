import { useState } from 'react'
import { api } from '../../lib/api'
import AlertBadge from './AlertBadge'

interface DiagnosticsResult {
  summary: string
  issues: string[]
  recommendations: string[]
}

export default function DiagnosticsPanel() {
  const [result, setResult] = useState<DiagnosticsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ranAt, setRanAt] = useState<Date | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.post<DiagnosticsResult>('/diagnostics/analyze', { range: '1h' })
      setResult(res.data)
      setRanAt(new Date())
    } catch (e: any) {
      setError(e?.message ?? 'request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="card-title">Diagnostics</span>
          {result && result.issues.length > 0 && <AlertBadge count={result.issues.length} />}
          {ranAt && (
            <span className="dim" style={{ fontSize: 11 }}>
              ran {ranAt.toLocaleTimeString()}
            </span>
          )}
        </div>
        <button className="primary" onClick={run} disabled={loading}>
          {loading ? 'Analyzing…' : 'Run analysis'}
        </button>
      </div>

      {!result && !error && !loading && (
        <div className="dim" style={{ padding: '8px 2px', fontSize: 13 }}>
          Click <span className="muted">Run analysis</span> to summarize the last hour of
          telemetry through the diagnostics LLM. Results appear here.
        </div>
      )}

      {loading && (
        <div className="dim mono" style={{ padding: '8px 2px', fontSize: 13 }}>
          calling LLM, building prompt from the last hour of Influx data…
        </div>
      )}

      {error && (
        <div style={{
          padding: 10, fontSize: 13,
          background: 'rgba(255, 51, 51, 0.08)',
          border: '1px solid rgba(255, 51, 51, 0.3)',
          borderRadius: 6, color: '#ffb3b3',
        }}>
          <strong>Request failed.</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 4 }}>
          <pre style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            lineHeight: 1.55,
            margin: 0,
            color: 'var(--text)',
          }}>{result.summary}</pre>

          {result.issues.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="card-title" style={{ marginBottom: 6 }}>Issues</div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                {result.issues.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {result.recommendations.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="card-title" style={{ marginBottom: 6 }}>Recommendations</div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                {result.recommendations.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

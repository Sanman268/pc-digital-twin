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

  const run = async () => {
    setLoading(true)
    try {
      const res = await api.post<DiagnosticsResult>('/diagnostics/analyze', { range: '1h' })
      setResult(res.data)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 12, border: '1px solid #333', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h3 style={{ margin: 0 }}>Diagnostics</h3>
        {result && result.issues.length > 0 && <AlertBadge count={result.issues.length} />}
        <button onClick={run} disabled={loading} style={{ marginLeft: 'auto' }}>
          {loading ? 'Analyzing…' : 'Run analysis'}
        </button>
      </div>
      {result && (
        <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{result.summary}</pre>
      )}
    </div>
  )
}

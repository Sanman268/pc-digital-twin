import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface DataPoint {
  time: string
  value: number
}

interface ToolCallLog {
  name: string
  arguments: Record<string, unknown>
  result?: Record<string, unknown> | null
  error?: string | null
}

interface ChatResponse {
  answer: string
  tool_calls: ToolCallLog[]
  data_points: DataPoint[]
  latency_ms: number
}

interface Turn {
  user: string
  assistant: string
  tool_calls: ToolCallLog[]
  data_points: DataPoint[]
  latency_ms: number
  error?: string
}

const SUGGESTIONS = [
  'Average temperature in the last hour?',
  'Any vibration anomalies in the last 6 hours?',
  'When was the temperature highest tonight?',
]

const MAX_HISTORY = 10

export default function ChatPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [pending, setPending] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, pending])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || pending) return
    setPending(trimmed)
    setInput('')

    const history: ChatMessage[] = []
    for (const t of turns.slice(-MAX_HISTORY)) {
      history.push({ role: 'user', content: t.user })
      if (t.assistant) history.push({ role: 'assistant', content: t.assistant })
    }

    try {
      const res = await api.post<ChatResponse>(
        '/chat',
        { message: trimmed, history },
        { timeout: 120_000 },
      )
      const d = res.data
      setTurns(ts => [...ts, {
        user: trimmed,
        assistant: d.answer,
        tool_calls: d.tool_calls,
        data_points: d.data_points,
        latency_ms: d.latency_ms,
      }])
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? e?.message ?? 'request failed'
      setTurns(ts => [...ts, {
        user: trimmed,
        assistant: '',
        tool_calls: [],
        data_points: [],
        latency_ms: 0,
        error: String(msg),
      }])
    } finally {
      setPending(null)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const wrapperClass = embedded ? '' : 'card'
  const wrapperStyle: React.CSSProperties = embedded
    ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }
    : { display: 'flex', flexDirection: 'column', minHeight: 320 }

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      {!embedded && (
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="card-title">Diagnostics Chat</span>
            <span className="dim" style={{ fontSize: 11 }}>
              llama3.1 · tools: query_window, find_anomalies, compare_windows
            </span>
          </div>
          {turns.length > 0 && (
            <button onClick={() => { setTurns([]); setExpanded({}) }} disabled={!!pending}>
              Clear
            </button>
          )}
        </div>
      )}
      {embedded && turns.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <button
            onClick={() => { setTurns([]); setExpanded({}) }}
            disabled={!!pending}
            style={{ fontSize: 11, padding: '3px 8px' }}
          >
            Clear
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          maxHeight: embedded ? undefined : 420,
          overflowY: 'auto',
          padding: '4px 2px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {turns.length === 0 && !pending && (
          <div className="dim" style={{ fontSize: 13, padding: '8px 2px' }}>
            Ask about temperature, humidity, pressure, vibration, or light.
            The agent will call InfluxDB query tools and interpret the results for you.
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} style={{ fontSize: 12 }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Bubble role="user" text={t.user} />
            {t.error ? (
              <ErrorBubble text={t.error} />
            ) : (
              <Bubble role="assistant" text={t.assistant} />
            )}
            {(t.tool_calls.length > 0 || t.latency_ms > 0) && (
              <ToolCallSummary
                turn={t}
                open={!!expanded[i]}
                onToggle={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
              />
            )}
          </div>
        ))}

        {pending && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Bubble role="user" text={pending} />
            <Bubble role="assistant" text="…" pending />
          </div>
        )}
      </div>

      <div style={{
        display: 'flex',
        gap: 8,
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px solid var(--border)',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={pending ? 'Waiting for response…' : 'Ask a question (Enter to send, Shift+Enter for newline)…'}
          disabled={!!pending}
          rows={2}
          style={{
            flex: 1,
            resize: 'none',
            fontFamily: 'inherit',
            fontSize: 13,
            padding: 8,
            background: 'var(--bg-elevated)',
            color: 'var(--text)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-sm)',
            outline: 'none',
          }}
        />
        <button
          className="primary"
          onClick={() => send(input)}
          disabled={!!pending || !input.trim()}
          style={{ alignSelf: 'stretch' }}
        >
          {pending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}

function Bubble({ role, text, pending }: { role: 'user' | 'assistant'; text: string; pending?: boolean }) {
  const isUser = role === 'user'
  return (
    <div style={{
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '85%',
      background: isUser ? 'rgba(0, 255, 136, 0.10)' : 'var(--bg-elevated)',
      border: `1px solid ${isUser ? 'rgba(0, 255, 136, 0.25)' : 'var(--border)'}`,
      color: 'var(--text)',
      padding: '8px 12px',
      borderRadius: 10,
      fontSize: 13,
      lineHeight: 1.5,
      whiteSpace: 'pre-wrap',
      opacity: pending ? 0.6 : 1,
    }}>
      {text || (pending ? '…' : '')}
    </div>
  )
}

function ErrorBubble({ text }: { text: string }) {
  return (
    <div style={{
      alignSelf: 'flex-start',
      maxWidth: '85%',
      background: 'rgba(255, 51, 51, 0.08)',
      border: '1px solid rgba(255, 51, 51, 0.3)',
      color: '#ffb3b3',
      padding: '8px 12px',
      borderRadius: 10,
      fontSize: 13,
    }}>
      <strong>Error:</strong> {text}
    </div>
  )
}

function ToolCallSummary({ turn, open, onToggle }: { turn: Turn; open: boolean; onToggle: () => void }) {
  const calls = turn.tool_calls
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '85%', fontSize: 11, color: 'var(--text-dim)' }}>
      <button
        onClick={onToggle}
        style={{
          padding: '2px 8px',
          fontSize: 11,
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--text-dim)',
        }}
      >
        {open ? '▾' : '▸'} {calls.length} tool {calls.length === 1 ? 'call' : 'calls'} · {turn.latency_ms} ms
      </button>
      {open && (
        <div style={{
          marginTop: 6,
          padding: 8,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {calls.map((c, i) => (
            <div key={i} style={{ marginBottom: i === calls.length - 1 ? 0 : 8 }}>
              <div style={{ color: 'var(--accent-dim)' }}>
                {c.name}({JSON.stringify(c.arguments)})
              </div>
              {c.error ? (
                <div style={{ color: '#ffb3b3' }}>error: {c.error}</div>
              ) : (
                <div style={{ color: 'var(--text-dim)' }}>
                  → {JSON.stringify(c.result)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
const SUGGESTIONS = [
    'Nhiệt độ trung bình 1 giờ qua?',
    'Có rung động bất thường trong 6 giờ qua không?',
    'So sánh độ ẩm hôm nay với hôm qua',
];
const MAX_HISTORY = 10;
export default function ChatPanel({ embedded = false } = {}) {
    const [input, setInput] = useState('');
    const [turns, setTurns] = useState([]);
    const [pending, setPending] = useState(null);
    const [expanded, setExpanded] = useState({});
    const scrollRef = useRef(null);
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [turns, pending]);
    const send = async (text) => {
        const trimmed = text.trim();
        if (!trimmed || pending)
            return;
        setPending(trimmed);
        setInput('');
        const history = [];
        for (const t of turns.slice(-MAX_HISTORY)) {
            history.push({ role: 'user', content: t.user });
            if (t.assistant)
                history.push({ role: 'assistant', content: t.assistant });
        }
        try {
            const res = await api.post('/chat', { message: trimmed, history }, { timeout: 120_000 });
            const d = res.data;
            setTurns(ts => [...ts, {
                    user: trimmed,
                    assistant: d.answer,
                    tool_calls: d.tool_calls,
                    data_points: d.data_points,
                    latency_ms: d.latency_ms,
                }]);
        }
        catch (e) {
            const msg = e?.response?.data?.detail ?? e?.message ?? 'request failed';
            setTurns(ts => [...ts, {
                    user: trimmed,
                    assistant: '',
                    tool_calls: [],
                    data_points: [],
                    latency_ms: 0,
                    error: String(msg),
                }]);
        }
        finally {
            setPending(null);
        }
    };
    const onKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send(input);
        }
    };
    const wrapperClass = embedded ? '' : 'card';
    const wrapperStyle = embedded
        ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }
        : { display: 'flex', flexDirection: 'column', minHeight: 320 };
    return (_jsxs("div", { className: wrapperClass, style: wrapperStyle, children: [!embedded && (_jsxs("div", { className: "card-header", children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx("span", { className: "card-title", children: "Diagnostics Chat" }), _jsx("span", { className: "dim", style: { fontSize: 11 }, children: "llama3.1 \u00B7 tools: query_window, find_anomalies, compare_windows" })] }), turns.length > 0 && (_jsx("button", { onClick: () => { setTurns([]); setExpanded({}); }, disabled: !!pending, children: "Clear" }))] })), embedded && turns.length > 0 && (_jsx("div", { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }, children: _jsx("button", { onClick: () => { setTurns([]); setExpanded({}); }, disabled: !!pending, style: { fontSize: 11, padding: '3px 8px' }, children: "Clear" }) })), _jsxs("div", { ref: scrollRef, style: {
                    flex: 1,
                    minHeight: 0,
                    maxHeight: embedded ? undefined : 420,
                    overflowY: 'auto',
                    padding: '4px 2px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                }, children: [turns.length === 0 && !pending && (_jsxs("div", { className: "dim", style: { fontSize: 13, padding: '8px 2px' }, children: ["H\u1ECFi v\u1EC1 nhi\u1EC7t \u0111\u1ED9, \u0111\u1ED9 \u1EA9m, \u00E1p su\u1EA5t, rung \u0111\u1ED9ng ho\u1EB7c \u00E1nh s\u00E1ng. Agent s\u1EBD t\u1EF1 g\u1ECDi tool truy v\u1EA5n InfluxDB v\u00E0 di\u1EC5n gi\u1EA3i k\u1EBFt qu\u1EA3.", _jsx("div", { style: { marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }, children: SUGGESTIONS.map(s => (_jsx("button", { onClick: () => send(s), style: { fontSize: 12 }, children: s }, s))) })] })), turns.map((t, i) => (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: [_jsx(Bubble, { role: "user", text: t.user }), t.error ? (_jsx(ErrorBubble, { text: t.error })) : (_jsx(Bubble, { role: "assistant", text: t.assistant })), (t.tool_calls.length > 0 || t.latency_ms > 0) && (_jsx(ToolCallSummary, { turn: t, open: !!expanded[i], onToggle: () => setExpanded(e => ({ ...e, [i]: !e[i] })) }))] }, i))), pending && (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: [_jsx(Bubble, { role: "user", text: pending }), _jsx(Bubble, { role: "assistant", text: "\u2026", pending: true })] }))] }), _jsxs("div", { style: {
                    display: 'flex',
                    gap: 8,
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border)',
                }, children: [_jsx("textarea", { value: input, onChange: e => setInput(e.target.value), onKeyDown: onKeyDown, placeholder: pending ? 'Đang chờ phản hồi…' : 'Hỏi gì đó (Enter để gửi, Shift+Enter xuống dòng)…', disabled: !!pending, rows: 2, style: {
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
                        } }), _jsx("button", { className: "primary", onClick: () => send(input), disabled: !!pending || !input.trim(), style: { alignSelf: 'stretch' }, children: pending ? '…' : 'Gửi' })] })] }));
}
function Bubble({ role, text, pending }) {
    const isUser = role === 'user';
    return (_jsx("div", { style: {
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
        }, children: text || (pending ? '…' : '') }));
}
function ErrorBubble({ text }) {
    return (_jsxs("div", { style: {
            alignSelf: 'flex-start',
            maxWidth: '85%',
            background: 'rgba(255, 51, 51, 0.08)',
            border: '1px solid rgba(255, 51, 51, 0.3)',
            color: '#ffb3b3',
            padding: '8px 12px',
            borderRadius: 10,
            fontSize: 13,
        }, children: [_jsx("strong", { children: "L\u1ED7i:" }), " ", text] }));
}
function ToolCallSummary({ turn, open, onToggle }) {
    const calls = turn.tool_calls;
    return (_jsxs("div", { style: { alignSelf: 'flex-start', maxWidth: '85%', fontSize: 11, color: 'var(--text-dim)' }, children: [_jsxs("button", { onClick: onToggle, style: {
                    padding: '2px 8px',
                    fontSize: 11,
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--text-dim)',
                }, children: [open ? '▾' : '▸', " ", calls.length, " tool ", calls.length === 1 ? 'call' : 'calls', " \u00B7 ", turn.latency_ms, " ms"] }), open && (_jsx("div", { style: {
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
                }, children: calls.map((c, i) => (_jsxs("div", { style: { marginBottom: i === calls.length - 1 ? 0 : 8 }, children: [_jsxs("div", { style: { color: 'var(--accent-dim)' }, children: [c.name, "(", JSON.stringify(c.arguments), ")"] }), c.error ? (_jsxs("div", { style: { color: '#ffb3b3' }, children: ["error: ", c.error] })) : (_jsxs("div", { style: { color: 'var(--text-dim)' }, children: ["\u2192 ", JSON.stringify(c.result)] }))] }, i))) }))] }));
}

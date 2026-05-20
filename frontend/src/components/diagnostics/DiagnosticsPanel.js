import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { api } from '../../lib/api';
import AlertBadge from './AlertBadge';
export default function DiagnosticsPanel() {
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [ranAt, setRanAt] = useState(null);
    const run = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.post('/diagnostics/analyze', { range: '1h' });
            setResult(res.data);
            setRanAt(new Date());
        }
        catch (e) {
            setError(e?.message ?? 'request failed');
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "card-header", children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx("span", { className: "card-title", children: "Diagnostics" }), result && result.issues.length > 0 && _jsx(AlertBadge, { count: result.issues.length }), ranAt && (_jsxs("span", { className: "dim", style: { fontSize: 11 }, children: ["ran ", ranAt.toLocaleTimeString()] }))] }), _jsx("button", { className: "primary", onClick: run, disabled: loading, children: loading ? 'Analyzing…' : 'Run analysis' })] }), !result && !error && !loading && (_jsxs("div", { className: "dim", style: { padding: '8px 2px', fontSize: 13 }, children: ["Click ", _jsx("span", { className: "muted", children: "Run analysis" }), " to summarize the last hour of telemetry through the diagnostics LLM. Results appear here."] })), loading && (_jsx("div", { className: "dim mono", style: { padding: '8px 2px', fontSize: 13 }, children: "calling LLM, building prompt from the last hour of Influx data\u2026" })), error && (_jsxs("div", { style: {
                    padding: 10, fontSize: 13,
                    background: 'rgba(255, 51, 51, 0.08)',
                    border: '1px solid rgba(255, 51, 51, 0.3)',
                    borderRadius: 6, color: '#ffb3b3',
                }, children: [_jsx("strong", { children: "Request failed." }), " ", error] })), result && (_jsxs("div", { style: { marginTop: 4 }, children: [_jsx("pre", { style: {
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'var(--font-sans)',
                            fontSize: 13,
                            lineHeight: 1.55,
                            margin: 0,
                            color: 'var(--text)',
                        }, children: result.summary }), result.issues.length > 0 && (_jsxs("div", { style: { marginTop: 12 }, children: [_jsx("div", { className: "card-title", style: { marginBottom: 6 }, children: "Issues" }), _jsx("ul", { style: { margin: 0, paddingLeft: 20, fontSize: 13 }, children: result.issues.map((s, i) => _jsx("li", { children: s }, i)) })] })), result.recommendations.length > 0 && (_jsxs("div", { style: { marginTop: 12 }, children: [_jsx("div", { className: "card-title", style: { marginBottom: 6 }, children: "Recommendations" }), _jsx("ul", { style: { margin: 0, paddingLeft: 20, fontSize: 13 }, children: result.recommendations.map((s, i) => _jsx("li", { children: s }, i)) })] }))] }))] }));
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useSettings, RANGE_OPTIONS, INTERVAL_OPTIONS, } from '../settings/SettingsContext';
function formatInterval(ms) {
    if (ms < 1000)
        return `${ms} ms`;
    if (ms < 60000)
        return `${ms / 1000} s`;
    return `${ms / 60000} m`;
}
function Field({ label, children }) {
    return (_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }, children: [_jsx("span", { className: "dim", style: { textTransform: 'uppercase', letterSpacing: '0.06em' }, children: label }), children] }));
}
export default function Controls() {
    const { historyRange, setHistoryRange, pollIntervalMs, setPollIntervalMs, paused, togglePaused, refreshNow, } = useSettings();
    return (_jsxs("div", { className: "card", style: {
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            padding: '10px 16px',
            flexWrap: 'wrap',
        }, children: [_jsx(Field, { label: "Range", children: _jsx("select", { value: historyRange, onChange: (e) => setHistoryRange(e.target.value), children: RANGE_OPTIONS.map(r => _jsx("option", { value: r, children: r }, r)) }) }), _jsx(Field, { label: "Refresh", children: _jsx("select", { value: pollIntervalMs, onChange: (e) => setPollIntervalMs(Number(e.target.value)), disabled: paused, title: paused ? 'Resume live mode to change refresh rate' : '', style: paused ? { opacity: 0.5 } : undefined, children: INTERVAL_OPTIONS.map(ms => (_jsx("option", { value: ms, children: formatInterval(ms) }, ms))) }) }), _jsx("div", { style: { flex: 1 } }), paused ? (_jsxs("span", { className: "pill warn", children: [_jsx("span", { className: "dot" }), "PAUSED"] })) : (_jsxs("span", { className: "dim mono", style: { fontSize: 11 }, children: ["live \u00B7 polling every ", formatInterval(pollIntervalMs)] })), _jsx("button", { onClick: togglePaused, title: paused ? 'Resume live updates' : 'Stop polling', children: paused ? '▶ Resume' : '⏸ Pause' }), _jsx("button", { onClick: refreshNow, title: "Fetch latest data now", children: "\u21BB Refresh" })] }));
}

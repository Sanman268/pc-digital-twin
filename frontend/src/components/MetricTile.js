import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function MetricTile({ label, value, unit, precision = 1, accent, hint, }) {
    const formatted = value == null || Number.isNaN(value)
        ? '—'
        : value.toFixed(precision);
    return (_jsxs("div", { className: "card", style: { minHeight: 96 }, children: [_jsxs("div", { className: "card-header", style: { marginBottom: 8 }, children: [_jsx("span", { className: "card-title", children: label }), accent && _jsx("span", { className: "dot", style: {
                            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                            background: accent, boxShadow: `0 0 8px ${accent}`,
                        } })] }), _jsxs("div", { children: [_jsx("span", { className: "metric-value", children: formatted }), _jsx("span", { className: "metric-unit", children: unit })] }), hint && _jsx("div", { className: "metric-sub", children: hint })] }));
}

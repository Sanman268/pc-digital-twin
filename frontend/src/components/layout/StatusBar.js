import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useGatewayStatus } from '../../hooks/useGatewayStatus';
export default function StatusBar() {
    const status = useGatewayStatus();
    return (_jsxs("footer", { style: {
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            padding: '8px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-card)',
            fontSize: 11,
            color: 'var(--text-dim)',
        }, children: [_jsxs("span", { children: ["asset ", _jsx("span", { className: "mono muted", children: status?.node_id ?? 'PC_CASE_001' })] }), _jsx("span", { children: "\u00B7" }), _jsxs("span", { children: ["gateway ", _jsx("span", { className: "mono muted", children: "localhost:8000" })] }), _jsx("span", { children: "\u00B7" }), _jsxs("span", { children: ["influx ", _jsx("span", { className: "mono muted", children: "localhost:8086" })] }), _jsx("span", { style: { flex: 1 } }), _jsx("span", { className: "dim", children: "PC Digital Twin \u00B7 MIT" })] }));
}

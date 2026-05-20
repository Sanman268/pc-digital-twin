import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useGatewayStatus } from '../../hooks/useGatewayStatus';
function formatRelative(iso) {
    if (!iso)
        return '—';
    const t = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - t);
    if (diff < 5_000)
        return 'just now';
    if (diff < 60_000)
        return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000)
        return `${Math.floor(diff / 60_000)}m ago`;
    return `${Math.floor(diff / 3_600_000)}h ago`;
}
export default function Header() {
    const status = useGatewayStatus();
    const connected = status?.connected ?? false;
    const pillClass = connected ? 'pill ok' : 'pill';
    const stateText = connected ? 'BLE connected' : 'BLE disconnected';
    return (_jsxs("header", { style: {
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '14px 24px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-card)',
        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'baseline', gap: 10 }, children: [_jsx("h1", { children: "PC Digital Twin" }), _jsx("span", { className: "dim mono", style: { fontSize: 12 }, children: "v0.2.4" })] }), _jsx("div", { style: { flex: 1 } }), _jsxs("span", { className: pillClass, children: [_jsx("span", { className: "dot" }), stateText] }), status?.node_id && (_jsx("span", { className: "muted mono", style: { fontSize: 12 }, children: status.node_id })), _jsxs("span", { className: "dim", style: { fontSize: 12 }, children: ["last seen ", _jsx("span", { className: "mono", children: formatRelative(status?.last_seen ?? null) })] })] }));
}

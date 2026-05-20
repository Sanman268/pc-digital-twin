import { jsxs as _jsxs } from "react/jsx-runtime";
export default function AlertBadge({ count }) {
    return (_jsxs("span", { style: {
            background: 'rgba(255, 51, 51, 0.15)',
            color: '#ff7575',
            border: '1px solid rgba(255, 51, 51, 0.4)',
            borderRadius: 999,
            padding: '2px 10px',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'var(--font-mono)',
        }, children: [count, " issue", count === 1 ? '' : 's'] }));
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Header from './components/layout/Header';
import StatusBar from './components/layout/StatusBar';
import Controls from './components/Controls';
import PCTwinViewer from './components/twin3d/PCTwinViewer';
import { SettingsProvider } from './settings/SettingsContext';
function Dashboard() {
    return (_jsxs("div", { style: { minHeight: '100vh', display: 'flex', flexDirection: 'column' }, children: [_jsx(Header, {}), _jsxs("main", { style: {
                    flex: 1,
                    padding: 24,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 20,
                    maxWidth: 1600,
                    width: '100%',
                    margin: '0 auto',
                }, children: [_jsx(Controls, {}), _jsx("section", { className: "card", style: {
                            padding: 0,
                            overflow: 'hidden',
                            height: 'min(78vh, 820px)',
                            display: 'flex',
                        }, children: _jsx(PCTwinViewer, {}) })] }), _jsx(StatusBar, {})] }));
}
export default function App() {
    return (_jsx(SettingsProvider, { children: _jsx(Dashboard, {}) }));
}

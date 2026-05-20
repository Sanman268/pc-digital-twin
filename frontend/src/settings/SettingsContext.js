import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useState } from 'react';
export const RANGE_OPTIONS = ['5m', '15m', '1h', '6h', '24h'];
export const INTERVAL_OPTIONS = [1000, 2000, 5000, 10000, 30000];
const Ctx = createContext(null);
export function SettingsProvider({ children }) {
    const [pollIntervalMs, setPollIntervalMs] = useState(5000);
    const [historyRange, setHistoryRange] = useState('1h');
    const [paused, setPaused] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);
    const refreshNow = useCallback(() => setRefreshTick(t => t + 1), []);
    const togglePaused = useCallback(() => setPaused(p => !p), []);
    return (_jsx(Ctx.Provider, { value: {
            pollIntervalMs, historyRange, paused, refreshTick,
            setPollIntervalMs, setHistoryRange, setPaused,
            togglePaused, refreshNow,
        }, children: children }));
}
export function useSettings() {
    const ctx = useContext(Ctx);
    if (!ctx)
        throw new Error('useSettings must be used within <SettingsProvider>');
    return ctx;
}

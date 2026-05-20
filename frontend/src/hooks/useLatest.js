import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSettings } from '../settings/SettingsContext';
export function useLatest() {
    const { pollIntervalMs, paused, refreshTick } = useSettings();
    const [latest, setLatest] = useState(null);
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res = await api.get('/sensor/latest');
                if (!cancelled)
                    setLatest(res.data);
            }
            catch {
                if (!cancelled)
                    setLatest(null);
            }
        };
        load();
        if (paused)
            return () => { cancelled = true; };
        const id = setInterval(load, pollIntervalMs);
        return () => { cancelled = true; clearInterval(id); };
    }, [pollIntervalMs, paused, refreshTick]);
    return latest;
}

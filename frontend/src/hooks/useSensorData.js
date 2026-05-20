import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSettings } from '../settings/SettingsContext';
export function useSensorData(field) {
    const { pollIntervalMs, historyRange, paused, refreshTick } = useSettings();
    const [data, setData] = useState([]);
    const [error, setError] = useState(null);
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res = await api.get('/sensor/history', {
                    params: { field, range: historyRange },
                });
                if (!cancelled)
                    setData(res.data);
            }
            catch (e) {
                if (!cancelled)
                    setError(e);
            }
        };
        load();
        if (paused)
            return () => { cancelled = true; };
        const id = setInterval(load, pollIntervalMs);
        return () => { cancelled = true; clearInterval(id); };
    }, [field, historyRange, pollIntervalMs, paused, refreshTick]);
    return { data, error };
}

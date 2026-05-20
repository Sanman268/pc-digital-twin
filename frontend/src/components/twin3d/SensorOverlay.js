import * as THREE from 'three';
import { STATE_COLORS } from '../../types/sensor';
import { findMesh } from './ModelLoader';
export function deriveState(snap, connected) {
    if (!connected || !snap)
        return 'offline';
    const t = snap.temperature_c ?? 0;
    const v = snap.vibration_rms ?? 0;
    if (t > 70 || v > 50)
        return 'critical';
    if (t > 55 || v > 20)
        return 'warning';
    return 'normal';
}
export function colorMesh(root, name, color) {
    const m = findMesh(root, name);
    if (!m)
        return;
    const mat = m.material;
    if (mat && 'color' in mat) {
        mat.color = new THREE.Color(color);
        mat.emissive = new THREE.Color(color);
        mat.emissiveIntensity = 0.4;
    }
}
export function applySensorState(root, state) {
    colorMesh(root, 'sensor_node', STATE_COLORS[state]);
}

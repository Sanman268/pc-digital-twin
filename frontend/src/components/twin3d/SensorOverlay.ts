import * as THREE from 'three'
import { STATE_COLORS, type LatestSnapshot, type SensorState } from '../../types/sensor'
import { findMesh, type MeshName } from './ModelLoader'

export function deriveState(snap: LatestSnapshot | null, connected: boolean): SensorState {
  if (!connected || !snap) return 'offline'
  const t = snap.temperature_c ?? 0
  const v = snap.vibration_rms ?? 0
  if (t > 70 || v > 50) return 'critical'
  if (t > 55 || v > 20) return 'warning'
  return 'normal'
}

export function colorMesh(root: THREE.Object3D, name: MeshName, color: string) {
  const m = findMesh(root, name)
  if (!m) return
  const mat = m.material as THREE.MeshStandardMaterial
  if (mat && 'color' in mat) {
    mat.color = new THREE.Color(color)
    mat.emissive = new THREE.Color(color)
    mat.emissiveIntensity = 0.4
  }
}

export function applySensorState(root: THREE.Object3D, state: SensorState) {
  colorMesh(root, 'sensor_node', STATE_COLORS[state])
}

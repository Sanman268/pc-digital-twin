import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export const MESH_NAMES = [
  'case_body',
  'side_panel',
  'fan_front',
  'fan_rear',
  'gpu',
  'cpu_area',
  'psu',
  'sensor_node',
] as const

export type MeshName = typeof MESH_NAMES[number]

export async function loadPCCase(url = '/models/pc_case.glb'): Promise<THREE.Group> {
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync(url)
  return gltf.scene
}

export function findMesh(root: THREE.Object3D, name: MeshName): THREE.Mesh | null {
  const o = root.getObjectByName(name)
  return (o && (o as THREE.Mesh).isMesh) ? (o as THREE.Mesh) : null
}

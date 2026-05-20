import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export const MESH_NAMES = [
    'case_body',
    'side_panel',
    'fan_front',
    'fan_rear',
    'gpu',
    'cpu_area',
    'psu',
    'sensor_node',
];
export async function loadPCCase(url = '/models/pc_case.glb') {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    return gltf.scene;
}
export function findMesh(root, name) {
    const o = root.getObjectByName(name);
    return (o && o.isMesh) ? o : null;
}

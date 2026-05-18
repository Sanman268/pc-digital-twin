import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { api } from '../../lib/api'
import type { LatestSnapshot } from '../../types/sensor'
import { useGatewayStatus } from '../../hooks/useGatewayStatus'
import { applySensorState, deriveState } from './SensorOverlay'

function PCModel({ url, state }: { url: string; state: ReturnType<typeof deriveState> }) {
  const { scene } = useGLTF(url) as unknown as { scene: THREE.Group }
  const ref = useRef<THREE.Group>(null)

  useEffect(() => {
    if (ref.current) applySensorState(ref.current, state)
  }, [state])

  return <primitive ref={ref} object={scene} />
}

export default function PCTwinViewer() {
  const status = useGatewayStatus()
  const [latest, setLatest] = useState<LatestSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await api.get<LatestSnapshot>('/sensor/latest')
        if (!cancelled) setLatest(res.data)
      } catch {
        if (!cancelled) setLatest(null)
      }
    }
    load()
    const id = setInterval(load, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const state = deriveState(latest, status?.connected ?? false)

  return (
    <div style={{ width: '100%', height: '100%', background: '#101418', borderRadius: 8 }}>
      <Canvas camera={{ position: [2, 2, 3], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={0.8} />
        <Suspense fallback={null}>
          <PCModel url="/models/pc_case.glb" state={state} />
        </Suspense>
        <OrbitControls />
      </Canvas>
    </div>
  )
}

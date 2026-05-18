import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import {
  OrbitControls,
  useGLTF,
  Environment,
  ContactShadows,
  Bounds,
} from '@react-three/drei'
import * as THREE from 'three'
import { useGatewayStatus } from '../../hooks/useGatewayStatus'
import { useLatest } from '../../hooks/useLatest'
import { applySensorState, deriveState } from './SensorOverlay'

// Model authored lying on its side; rotate +90 deg around X to stand it up.
// Flip the sign if it tilts the wrong way for your GLB.
const MODEL_ROTATION: [number, number, number] = [Math.PI / 2, 0, 0]

function PCModel({ url, state }: { url: string; state: ReturnType<typeof deriveState> }) {
  const { scene } = useGLTF(url) as unknown as { scene: THREE.Group }
  const ref = useRef<THREE.Group>(null)

  useEffect(() => {
    if (ref.current) applySensorState(ref.current, state)
  }, [state])

  return (
    <group ref={ref} rotation={MODEL_ROTATION}>
      <primitive object={scene} />
    </group>
  )
}

export default function PCTwinViewer() {
  const status = useGatewayStatus()
  const latest = useLatest()
  const [autoRotate, setAutoRotate] = useState(false)

  const state = deriveState(latest, status?.connected ?? false)

  return (
    <div style={{
      width: '100%',
      height: '100%',
      minHeight: 520,
      position: 'relative',
    }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [2.5, 1.8, 3], fov: 45 }}
      >
        {/* Gradient-ish dark backdrop with depth fog */}
        <color attach="background" args={['#1a1f2a']} />
        <fog attach="fog" args={['#1a1f2a', 8, 20]} />

        {/* Direct lighting for shading */}
        <ambientLight intensity={0.25} />
        <directionalLight
          position={[6, 10, 5]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-3}
          shadow-camera-right={3}
          shadow-camera-top={3}
          shadow-camera-bottom={-3}
        />
        <directionalLight position={[-4, 2, -3]} intensity={0.35} color="#88aaff" />

        <Suspense fallback={null}>
          <Bounds fit clip margin={0.85} observe>
            <PCModel url="/models/pc_case.glb" state={state} />
          </Bounds>

          {/* Studio HDRI provides reflections + soft ambient; not shown as background. */}
          <Environment preset="studio" background={false} />

          {/* Soft grounding shadow under the case */}
          <ContactShadows
            position={[0, -1.0, 0]}
            opacity={0.55}
            scale={10}
            blur={2.5}
            far={3}
          />
        </Suspense>

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.8}
          zoomSpeed={0.7}
          panSpeed={0.6}
          minDistance={0.4}
          maxDistance={10}
          maxPolarAngle={Math.PI / 2 - 0.02}
          autoRotate={autoRotate}
          autoRotateSpeed={0.6}
          target={[0, 0, 0]}
        />
      </Canvas>

      {/* Overlay controls */}
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        display: 'flex',
        gap: 6,
      }}>
        <button
          onClick={() => setAutoRotate(v => !v)}
          style={{
            padding: '4px 10px',
            fontSize: 12,
            background: autoRotate ? '#00ff88' : 'rgba(255,255,255,0.08)',
            color: autoRotate ? '#000' : '#ccc',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
          title="Auto-rotate the model"
        >
          {autoRotate ? '⏸ stop' : '↻ rotate'}
        </button>
      </div>

      {/* Help hint */}
      <div style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        fontSize: 11,
        color: 'rgba(255,255,255,0.45)',
        pointerEvents: 'none',
      }}>
        drag · scroll to zoom · right-drag to pan
      </div>
    </div>
  )
}

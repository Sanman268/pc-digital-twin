import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
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

// Approximate sensor mount point, in the model's LOCAL frame (before MODEL_ROTATION).
// Local +Y maps to world +Y (up) after the +90° X rotation, so raise this to lift
// the marker higher inside the case.
const SENSOR_LOCAL_POS: [number, number, number] = [0.1, 0, -0.2]

// Marker sizes (world units). Tweak together so core < halo.
const MARKER_CORE_RADIUS = 0.025
const MARKER_HALO_RADIUS = 0.045

const CASE_OPACITY = 0.22

const HIGHLIGHT_COLOR = '#00e5ff'
const HIGHLIGHT_INTENSITY = 3.0
const HIGHLIGHT_OPACITY = 0.95

function applyHighlight(root: THREE.Object3D, selectedName: string | null) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const mat = mesh.material as THREE.MeshStandardMaterial
    if (!mat || !('emissive' in mat)) return

    const ud = mesh.userData as {
      _highlighted?: boolean
      _origEmissive?: THREE.Color
      _origEmissiveIntensity?: number
      _origColor?: THREE.Color
      _origOpacity?: number
      _origDepthWrite?: boolean
    }
    const isSelected = !!mesh.name && mesh.name === selectedName

    if (isSelected && !ud._highlighted) {
      ud._highlighted = true
      ud._origEmissive = mat.emissive.clone()
      ud._origEmissiveIntensity = mat.emissiveIntensity
      ud._origColor = mat.color.clone()
      ud._origOpacity = mat.opacity
      ud._origDepthWrite = mat.depthWrite
      mat.color = new THREE.Color(HIGHLIGHT_COLOR)
      mat.emissive = new THREE.Color(HIGHLIGHT_COLOR)
      mat.emissiveIntensity = HIGHLIGHT_INTENSITY
      mat.opacity = HIGHLIGHT_OPACITY
      mat.depthWrite = true
      mat.needsUpdate = true
    } else if (!isSelected && ud._highlighted) {
      ud._highlighted = false
      if (ud._origEmissive) mat.emissive = ud._origEmissive
      if (ud._origEmissiveIntensity !== undefined)
        mat.emissiveIntensity = ud._origEmissiveIntensity
      if (ud._origColor) mat.color = ud._origColor
      if (ud._origOpacity !== undefined) mat.opacity = ud._origOpacity
      if (ud._origDepthWrite !== undefined) mat.depthWrite = ud._origDepthWrite
      mat.needsUpdate = true
    }
  })
}

function clearHighlight(root: THREE.Object3D) {
  applyHighlight(root, null)
}

function applyVisibility(root: THREE.Object3D, hidden: Set<string>) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    if (!mesh.name) return
    mesh.visible = !hidden.has(mesh.name)
  })
}

function makeCaseTransparent(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    // Skip the sensor_node mesh if present so the indicator still reads as solid.
    if (mesh.name === 'sensor_node') return
    const apply = (m: THREE.Material) => {
      const std = m as THREE.MeshStandardMaterial
      std.transparent = true
      std.opacity = CASE_OPACITY
      std.depthWrite = false
      std.side = THREE.DoubleSide
      std.needsUpdate = true
    }
    if (Array.isArray(mesh.material)) mesh.material.forEach(apply)
    else if (mesh.material) apply(mesh.material)
  })
}

function SensorMarker({ position }: { position: [number, number, number] }) {
  const haloRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!haloRef.current) return
    const t = clock.getElapsedTime()
    const s = 1 + 0.18 * Math.sin(t * 2.4)
    haloRef.current.scale.setScalar(s)
    const mat = haloRef.current.material as THREE.MeshBasicMaterial
    mat.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2.4))
  })

  // Marker is purely indicative — no click handler, can't be hidden.
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[MARKER_CORE_RADIUS, 24, 24]} />
        <meshStandardMaterial
          color="#ff8a1a"
          emissive="#ff8a1a"
          emissiveIntensity={1.6}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={haloRef} raycast={() => null}>
        <sphereGeometry args={[MARKER_HALO_RADIUS, 24, 24]} />
        <meshBasicMaterial
          color="#ff8a1a"
          transparent
          opacity={0.4}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <pointLight color="#ff8a1a" intensity={0.5} distance={0.8} decay={2} />
    </group>
  )
}

function PCModel({
  url,
  state,
  selectedName,
  hidden,
  onSelect,
}: {
  url: string
  state: ReturnType<typeof deriveState>
  selectedName: string | null
  hidden: Set<string>
  onSelect: (name: string | null) => void
}) {
  const { scene } = useGLTF(url) as unknown as { scene: THREE.Group }
  const ref = useRef<THREE.Group>(null)

  useMemo(() => makeCaseTransparent(scene), [scene])

  // Run state color, visibility, and highlight together so they don't fight.
  useEffect(() => {
    if (!ref.current) return
    clearHighlight(ref.current)
    applySensorState(ref.current, state)
    applyVisibility(ref.current, hidden)
    applyHighlight(ref.current, selectedName)
  }, [state, hidden, selectedName])

  return (
    <group
      ref={ref}
      rotation={MODEL_ROTATION}
      onClick={(e) => {
        if (!e.object.name) return
        e.stopPropagation()
        onSelect(e.object.name)
      }}
      onPointerOver={(e) => {
        if (!e.object.name) return
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      <primitive object={scene} />
      <SensorMarker position={SENSOR_LOCAL_POS} />
    </group>
  )
}

export default function PCTwinViewer() {
  const status = useGatewayStatus()
  const latest = useLatest()
  const [autoRotate, setAutoRotate] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const state = deriveState(latest, status?.connected ?? false)

  const hideSelected = () => {
    if (!selectedName) return
    setHidden(prev => {
      const next = new Set(prev)
      next.add(selectedName)
      return next
    })
    setSelectedName(null)
  }

  const showAll = () => {
    setHidden(new Set())
    setSelectedName(null)
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: 520,
        position: 'relative',
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [2.5, 1.8, 3], fov: 45 }}
        onPointerMissed={() => { setSelectedName(null); setMenu(null) }}
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
            <PCModel
              url="/models/pc_case.glb"
              state={state}
              selectedName={selectedName}
              hidden={hidden}
              onSelect={setSelectedName}
            />
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
        click to select · right-click for menu · drag · scroll to zoom
      </div>

      {/* Selection + hidden-count pills */}
      <div style={{
        position: 'absolute',
        bottom: 8,
        right: 8,
        display: 'flex',
        gap: 6,
      }}>
        {selectedName && (
          <div style={{
            fontSize: 11,
            padding: '4px 8px',
            background: 'rgba(0, 229, 255, 0.12)',
            color: '#00e5ff',
            border: '1px solid rgba(0, 229, 255, 0.4)',
            borderRadius: 4,
            fontFamily: 'JetBrains Mono, Consolas, monospace',
          }}>
            {selectedName}
          </div>
        )}
        {hidden.size > 0 && (
          <div style={{
            fontSize: 11,
            padding: '4px 8px',
            background: 'rgba(255, 138, 26, 0.12)',
            color: '#ff8a1a',
            border: '1px solid rgba(255, 138, 26, 0.4)',
            borderRadius: 4,
            fontFamily: 'JetBrains Mono, Consolas, monospace',
          }}>
            {hidden.size} hidden
          </div>
        )}
      </div>

      {/* Context menu */}
      {menu && (
        <>
          <div
            onClick={() => setMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setMenu(null) }}
            style={{ position: 'fixed', inset: 0, zIndex: 50 }}
          />
          <div
            style={{
              position: 'fixed',
              top: menu.y,
              left: menu.x,
              zIndex: 51,
              minWidth: 160,
              background: '#1a1f2a',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              padding: 4,
              fontFamily: 'Inter, Segoe UI, sans-serif',
            }}
          >
            {selectedName && (
              <div style={{
                padding: '6px 10px',
                color: '#888',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                fontFamily: 'JetBrains Mono, Consolas, monospace',
                fontSize: 11,
              }}>
                {selectedName}
              </div>
            )}
            <MenuItem
              label="Hide"
              disabled={!selectedName}
              hint={!selectedName ? 'click an object first' : undefined}
              onClick={() => { hideSelected(); setMenu(null) }}
            />
            <MenuItem
              label="Show all"
              disabled={hidden.size === 0}
              onClick={() => { showAll(); setMenu(null) }}
            />
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({
  label,
  onClick,
  disabled,
  hint,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  hint?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '6px 10px',
        background: 'transparent',
        border: 'none',
        color: disabled ? '#555' : '#ddd',
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: 4,
        fontSize: 12,
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
    >
      {label}
    </button>
  )
}

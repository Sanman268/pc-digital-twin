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
import { getAssetProperties, type AssetStatus } from './assetProperties'
import TemperatureChart from '../charts/TemperatureChart'
import HumidityChart from '../charts/HumidityChart'
import VibrationChart from '../charts/VibrationChart'
import AirQualityChart from '../charts/AirQualityChart'

// Model authored lying on its side; rotate +90 deg around X to stand it up.
// Flip the sign if it tilts the wrong way for your GLB.
const MODEL_ROTATION: [number, number, number] = [Math.PI / 2, 0, 0]

// Approximate sensor mount point, in the model's LOCAL frame (before MODEL_ROTATION).
// Local +Y maps to world +Y (up) after the +90° X rotation, so raise this to lift
// the marker higher inside the case.
const SENSOR_LOCAL_POS: [number, number, number] = [0.1, 0, -0.2]

// Marker sizes (world units). Tweak together so core < halo.
const MARKER_CORE_RADIUS = 0.035
const MARKER_HALO_RADIUS = 0.065

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

const MARKER_USERDATA_KEY = 'isSensorMarker'

function SensorMarker({
  position,
  active,
}: {
  position: [number, number, number]
  active: boolean
}) {
  const haloRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!haloRef.current) return
    const t = clock.getElapsedTime()
    const s = 1 + 0.18 * Math.sin(t * 2.4)
    haloRef.current.scale.setScalar(s)
    const mat = haloRef.current.material as THREE.MeshBasicMaterial
    mat.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2.4))
  })

  // Bright cyan when popup is open, warm orange when closed.
  const color = active ? '#00e5ff' : '#ff8a1a'
  const coreIntensity = active ? 3.0 : 1.6

  return (
    <group position={position}>
      {/* Visible core. depthTest off so it always renders on top of the case. */}
      <mesh
        userData={{ [MARKER_USERDATA_KEY]: true }}
        renderOrder={999}
      >
        <sphereGeometry args={[MARKER_CORE_RADIUS, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={coreIntensity}
          toneMapped={false}
          depthTest={false}
          transparent
        />
      </mesh>
      {/* Halo — visual only, not interactive */}
      <mesh ref={haloRef} raycast={() => null} renderOrder={999}>
        <sphereGeometry args={[MARKER_HALO_RADIUS, 24, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <pointLight color={color} intensity={active ? 1.2 : 0.5} distance={1.2} decay={2} />
    </group>
  )
}

function PCModel({
  url,
  state,
  selectedName,
  hidden,
  markerActive,
  onSelect,
  onMarkerClick,
}: {
  url: string
  state: ReturnType<typeof deriveState>
  selectedName: string | null
  hidden: Set<string>
  markerActive: boolean
  onSelect: (name: string | null) => void
  onMarkerClick: () => void
}) {
  const { scene } = useGLTF(url) as unknown as { scene: THREE.Group }
  const ref = useRef<THREE.Group>(null)

  useMemo(() => makeCaseTransparent(scene), [scene])

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
        // Prefer the sensor marker even when a transparent case panel is
        // intersected first along the ray.
        const markerHit = e.intersections.find(
          i => i.object.userData?.[MARKER_USERDATA_KEY],
        )
        if (markerHit) {
          e.stopPropagation()
          onMarkerClick()
          return
        }
        if (!e.object.name) return
        e.stopPropagation()
        onSelect(e.object.name)
      }}
      onPointerOver={(e) => {
        const overMarker = e.intersections.some(
          i => i.object.userData?.[MARKER_USERDATA_KEY],
        )
        if (overMarker || e.object.name) {
          e.stopPropagation()
          document.body.style.cursor = 'pointer'
        }
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      <primitive object={scene} />
      <SensorMarker position={SENSOR_LOCAL_POS} active={markerActive} />
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
  const [propsFor, setPropsFor] = useState<string | null>(null)
  const [metricsOpen, setMetricsOpen] = useState(false)

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
        flex: 1,
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
          <Bounds fit clip margin={0.55} observe>
            <PCModel
              url="/models/pc_case.glb"
              state={state}
              selectedName={selectedName}
              hidden={hidden}
              markerActive={metricsOpen}
              onSelect={setSelectedName}
              onMarkerClick={() => setMetricsOpen(o => !o)}
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
        click part to select · click orange marker for readings · right-click for menu
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

      {/* Properties panel */}
      {propsFor && (
        <PropertiesPanel name={propsFor} onClose={() => setPropsFor(null)} />
      )}

      {/* Live charts popup (triggered by sensor marker click) */}
      {metricsOpen && (
        <ChartsPopup onClose={() => setMetricsOpen(false)} />
      )}

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
              label="Properties"
              disabled={!selectedName}
              hint={!selectedName ? 'click an object first' : undefined}
              onClick={() => { if (selectedName) setPropsFor(selectedName); setMenu(null) }}
            />
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

const STATUS_COLORS: Record<AssetStatus, string> = {
  operational: '#00d36b',
  warning: '#ffb020',
  fault: '#ff4d4d',
  unknown: '#888',
}

function ChartsPopup({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        bottom: 12,
        zIndex: 40,
        width: 'min(54%, 620px)',
        background: '#0f131c',
        border: '1px solid rgba(255, 138, 26, 0.4)',
        borderRadius: 10,
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 138, 26, 0.18)',
        fontFamily: 'Inter, Segoe UI, sans-serif',
        color: '#ddd',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        background: 'rgba(255, 138, 26, 0.08)',
        borderBottom: '1px solid rgba(255, 138, 26, 0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#ff8a1a', boxShadow: '0 0 8px #ff8a1a',
        }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
          Sensor Live Readings
        </span>
        <button
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            color: '#aaa',
            border: 'none',
            cursor: 'pointer',
            fontSize: 20,
            lineHeight: 1,
            padding: 0,
          }}
          title="Close"
        >×</button>
      </div>

      {/* 2×2 chart grid */}
      <div style={{
        flex: 1,
        padding: 10,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 10,
        minHeight: 0,
      }}>
        <TemperatureChart />
        <HumidityChart />
        <VibrationChart />
        <AirQualityChart />
      </div>
    </div>
  )
}

function PropertiesPanel({ name, onClose }: { name: string; onClose: () => void }) {
  const p = getAssetProperties(name)
  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 40,
        width: 300,
        background: '#141923',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
        fontFamily: 'Inter, Segoe UI, sans-serif',
        color: '#ddd',
        fontSize: 12,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
            {p.displayName}
          </div>
          <div style={{
            fontSize: 10,
            color: '#888',
            fontFamily: 'JetBrains Mono, Consolas, monospace',
            marginTop: 2,
          }}>
            mesh: {name}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            color: '#888',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: 0,
          }}
          title="Close"
        >×</button>
      </div>

      {/* Status badge */}
      <div style={{
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: STATUS_COLORS[p.status],
          boxShadow: `0 0 6px ${STATUS_COLORS[p.status]}`,
        }} />
        <span style={{ color: STATUS_COLORS[p.status], fontWeight: 500 }}>
          {p.status.toUpperCase()}
        </span>
        <span style={{ color: '#666', fontSize: 11, marginLeft: 'auto' }}>
          {p.category}
        </span>
      </div>

      {/* Sections */}
      <Section title="Identification">
        <Row k="Manufacturer" v={p.manufacturer} />
        <Row k="Model" v={p.model} />
        <Row k="Part #" v={p.partNumber} mono />
        <Row k="Serial #" v={p.serialNumber} mono />
      </Section>

      {(p.powerW !== undefined || p.rpm !== undefined) && (
        <Section title="Specs">
          {p.powerW !== undefined && <Row k="Power" v={`${p.powerW} W`} mono />}
          {p.rpm !== undefined && <Row k="Max RPM" v={`${p.rpm}`} mono />}
        </Section>
      )}

      <Section title="Lifecycle">
        <Row k="Installed" v={p.installDate} mono />
        <Row k="Warranty" v={p.warrantyEnd} mono />
      </Section>

      {p.notes && (
        <Section title="Notes">
          <div style={{ color: '#aaa', fontSize: 11, lineHeight: 1.5 }}>
            {p.notes}
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        color: '#666',
        marginBottom: 6,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 8,
      padding: '3px 0',
    }}>
      <span style={{ color: '#888' }}>{k}</span>
      <span style={{
        color: '#ddd',
        textAlign: 'right',
        fontFamily: mono ? 'JetBrains Mono, Consolas, monospace' : undefined,
        wordBreak: 'break-all',
      }}>{v}</span>
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

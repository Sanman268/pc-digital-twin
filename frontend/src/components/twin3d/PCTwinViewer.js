import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, ContactShadows, Bounds, } from '@react-three/drei';
import * as THREE from 'three';
import { useGatewayStatus } from '../../hooks/useGatewayStatus';
import { useLatest } from '../../hooks/useLatest';
import { applySensorState, deriveState } from './SensorOverlay';
import { getAssetProperties } from './assetProperties';
import TemperatureChart from '../charts/TemperatureChart';
import HumidityChart from '../charts/HumidityChart';
import VibrationChart from '../charts/VibrationChart';
import AirQualityChart from '../charts/AirQualityChart';
import ChatPanel from '../chat/ChatPanel';
// Model authored lying on its side; rotate +90 deg around X to stand it up.
// Flip the sign if it tilts the wrong way for your GLB.
const MODEL_ROTATION = [Math.PI / 2, 0, 0];
// Approximate sensor mount point, in the model's LOCAL frame (before MODEL_ROTATION).
// Local +Y maps to world +Y (up) after the +90° X rotation, so raise this to lift
// the marker higher inside the case.
const SENSOR_LOCAL_POS = [0.1, 0, -0.2];
// Marker sizes (world units). Tweak together so core < halo.
const MARKER_CORE_RADIUS = 0.035;
const MARKER_HALO_RADIUS = 0.065;
const CASE_OPACITY = 0.22;
const HIGHLIGHT_COLOR = '#00e5ff';
const HIGHLIGHT_INTENSITY = 3.0;
const HIGHLIGHT_OPACITY = 0.95;
function applyHighlight(root, selectedName) {
    root.traverse((obj) => {
        const mesh = obj;
        if (!mesh.isMesh)
            return;
        const mat = mesh.material;
        if (!mat || !('emissive' in mat))
            return;
        const ud = mesh.userData;
        const isSelected = !!mesh.name && mesh.name === selectedName;
        if (isSelected && !ud._highlighted) {
            ud._highlighted = true;
            ud._origEmissive = mat.emissive.clone();
            ud._origEmissiveIntensity = mat.emissiveIntensity;
            ud._origColor = mat.color.clone();
            ud._origOpacity = mat.opacity;
            ud._origDepthWrite = mat.depthWrite;
            mat.color = new THREE.Color(HIGHLIGHT_COLOR);
            mat.emissive = new THREE.Color(HIGHLIGHT_COLOR);
            mat.emissiveIntensity = HIGHLIGHT_INTENSITY;
            mat.opacity = HIGHLIGHT_OPACITY;
            mat.depthWrite = true;
            mat.needsUpdate = true;
        }
        else if (!isSelected && ud._highlighted) {
            ud._highlighted = false;
            if (ud._origEmissive)
                mat.emissive = ud._origEmissive;
            if (ud._origEmissiveIntensity !== undefined)
                mat.emissiveIntensity = ud._origEmissiveIntensity;
            if (ud._origColor)
                mat.color = ud._origColor;
            if (ud._origOpacity !== undefined)
                mat.opacity = ud._origOpacity;
            if (ud._origDepthWrite !== undefined)
                mat.depthWrite = ud._origDepthWrite;
            mat.needsUpdate = true;
        }
    });
}
function clearHighlight(root) {
    applyHighlight(root, null);
}
function applyVisibility(root, hidden) {
    root.traverse((obj) => {
        const mesh = obj;
        if (!mesh.isMesh)
            return;
        if (!mesh.name)
            return;
        mesh.visible = !hidden.has(mesh.name);
    });
}
function makeCaseTransparent(root) {
    root.traverse((obj) => {
        const mesh = obj;
        if (!mesh.isMesh)
            return;
        // Skip the sensor_node mesh if present so the indicator still reads as solid.
        if (mesh.name === 'sensor_node')
            return;
        const apply = (m) => {
            const std = m;
            std.transparent = true;
            std.opacity = CASE_OPACITY;
            std.depthWrite = false;
            std.side = THREE.DoubleSide;
            std.needsUpdate = true;
        };
        if (Array.isArray(mesh.material))
            mesh.material.forEach(apply);
        else if (mesh.material)
            apply(mesh.material);
    });
}
const MARKER_USERDATA_KEY = 'isSensorMarker';
function SensorMarker({ position, active, }) {
    const haloRef = useRef(null);
    useFrame(({ clock }) => {
        if (!haloRef.current)
            return;
        const t = clock.getElapsedTime();
        const s = 1 + 0.18 * Math.sin(t * 2.4);
        haloRef.current.scale.setScalar(s);
        const mat = haloRef.current.material;
        mat.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2.4));
    });
    // Bright cyan when popup is open, warm orange when closed.
    const color = active ? '#00e5ff' : '#ff8a1a';
    const coreIntensity = active ? 3.0 : 1.6;
    return (_jsxs("group", { position: position, children: [_jsxs("mesh", { userData: { [MARKER_USERDATA_KEY]: true }, renderOrder: 999, children: [_jsx("sphereGeometry", { args: [MARKER_CORE_RADIUS, 24, 24] }), _jsx("meshStandardMaterial", { color: color, emissive: color, emissiveIntensity: coreIntensity, toneMapped: false, depthTest: false, transparent: true })] }), _jsxs("mesh", { ref: haloRef, raycast: () => null, renderOrder: 999, children: [_jsx("sphereGeometry", { args: [MARKER_HALO_RADIUS, 24, 24] }), _jsx("meshBasicMaterial", { color: color, transparent: true, opacity: 0.4, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false })] }), _jsx("pointLight", { color: color, intensity: active ? 1.2 : 0.5, distance: 1.2, decay: 2 })] }));
}
function PCModel({ url, state, selectedName, hidden, markerActive, onSelect, onMarkerClick, }) {
    const { scene } = useGLTF(url);
    const ref = useRef(null);
    useMemo(() => makeCaseTransparent(scene), [scene]);
    useEffect(() => {
        if (!ref.current)
            return;
        clearHighlight(ref.current);
        applySensorState(ref.current, state);
        applyVisibility(ref.current, hidden);
        applyHighlight(ref.current, selectedName);
    }, [state, hidden, selectedName]);
    return (_jsxs("group", { ref: ref, rotation: MODEL_ROTATION, onClick: (e) => {
            // Prefer the sensor marker even when a transparent case panel is
            // intersected first along the ray.
            const markerHit = e.intersections.find(i => i.object.userData?.[MARKER_USERDATA_KEY]);
            if (markerHit) {
                e.stopPropagation();
                onMarkerClick();
                return;
            }
            if (!e.object.name)
                return;
            e.stopPropagation();
            onSelect(e.object.name);
        }, onPointerOver: (e) => {
            const overMarker = e.intersections.some(i => i.object.userData?.[MARKER_USERDATA_KEY]);
            if (overMarker || e.object.name) {
                e.stopPropagation();
                document.body.style.cursor = 'pointer';
            }
        }, onPointerOut: () => {
            document.body.style.cursor = 'default';
        }, children: [_jsx("primitive", { object: scene }), _jsx(SensorMarker, { position: SENSOR_LOCAL_POS, active: markerActive })] }));
}
export default function PCTwinViewer() {
    const status = useGatewayStatus();
    const latest = useLatest();
    const [selectedName, setSelectedName] = useState(null);
    const [hidden, setHidden] = useState(() => new Set());
    const [menu, setMenu] = useState(null);
    const [propsFor, setPropsFor] = useState(null);
    const [metricsOpen, setMetricsOpen] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [activated, setActivated] = useState(false);
    const wrapperRef = useRef(null);
    // Click outside the viewer deactivates wheel zoom so page scroll wins again.
    useEffect(() => {
        if (!activated)
            return;
        const onDown = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setActivated(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [activated]);
    const state = deriveState(latest, status?.connected ?? false);
    const hideSelected = () => {
        if (!selectedName)
            return;
        setHidden(prev => {
            const next = new Set(prev);
            next.add(selectedName);
            return next;
        });
        setSelectedName(null);
    };
    const showAll = () => {
        setHidden(new Set());
        setSelectedName(null);
    };
    return (_jsxs("div", { ref: wrapperRef, style: {
            width: '100%',
            height: '100%',
            flex: 1,
            minHeight: 520,
            position: 'relative',
        }, onContextMenu: (e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
        }, onMouseDown: () => setActivated(true), children: [_jsxs(Canvas, { shadows: true, dpr: [1, 2], camera: { position: [2.5, 1.8, 3], fov: 45 }, onPointerMissed: () => { setSelectedName(null); setMenu(null); }, children: [_jsx("color", { attach: "background", args: ['#1a1f2a'] }), _jsx("fog", { attach: "fog", args: ['#1a1f2a', 8, 20] }), _jsx("ambientLight", { intensity: 0.25 }), _jsx("directionalLight", { position: [6, 10, 5], intensity: 1.2, castShadow: true, "shadow-mapSize-width": 1024, "shadow-mapSize-height": 1024, "shadow-camera-left": -3, "shadow-camera-right": 3, "shadow-camera-top": 3, "shadow-camera-bottom": -3 }), _jsx("directionalLight", { position: [-4, 2, -3], intensity: 0.35, color: "#88aaff" }), _jsxs(Suspense, { fallback: null, children: [_jsx(Bounds, { fit: true, clip: true, margin: 0.55, observe: true, children: _jsx(PCModel, { url: "/models/pc_case.glb", state: state, selectedName: selectedName, hidden: hidden, markerActive: metricsOpen, onSelect: setSelectedName, onMarkerClick: () => setMetricsOpen(o => !o) }) }), _jsx(Environment, { preset: "studio", background: false }), _jsx(ContactShadows, { position: [0, -1.0, 0], opacity: 0.55, scale: 10, blur: 2.5, far: 3 })] }), _jsx(OrbitControls, { makeDefault: true, enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.8, zoomSpeed: 0.7, panSpeed: 0.6, enableZoom: activated, enableRotate: activated, enablePan: activated, minDistance: 0.4, maxDistance: 10, maxPolarAngle: Math.PI / 2 - 0.02, target: [0, 0, 0] })] }), _jsx("div", { style: {
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    fontSize: 11,
                    color: activated ? 'rgba(0, 229, 255, 0.7)' : 'rgba(255,255,255,0.45)',
                    pointerEvents: 'none',
                }, children: activated
                    ? 'viewer active · scroll to zoom · click outside to release'
                    : 'click viewer to activate · right-click for menu' }), _jsx(ViewerToolbar, { chatOpen: chatOpen, metricsOpen: metricsOpen, onToggleChat: () => setChatOpen(v => !v), onToggleMetrics: () => setMetricsOpen(v => !v) }), _jsxs("div", { style: {
                    position: 'absolute',
                    bottom: 8,
                    right: 8,
                    display: 'flex',
                    gap: 6,
                }, children: [selectedName && (_jsx("div", { style: {
                            fontSize: 11,
                            padding: '4px 8px',
                            background: 'rgba(0, 229, 255, 0.12)',
                            color: '#00e5ff',
                            border: '1px solid rgba(0, 229, 255, 0.4)',
                            borderRadius: 4,
                            fontFamily: 'JetBrains Mono, Consolas, monospace',
                        }, children: selectedName })), hidden.size > 0 && (_jsxs("div", { style: {
                            fontSize: 11,
                            padding: '4px 8px',
                            background: 'rgba(255, 138, 26, 0.12)',
                            color: '#ff8a1a',
                            border: '1px solid rgba(255, 138, 26, 0.4)',
                            borderRadius: 4,
                            fontFamily: 'JetBrains Mono, Consolas, monospace',
                        }, children: [hidden.size, " hidden"] }))] }), propsFor && (_jsx(PropertiesPanel, { name: propsFor, onClose: () => setPropsFor(null) })), metricsOpen && (_jsx(ChartsPopup, { onClose: () => setMetricsOpen(false) })), chatOpen && (_jsx(ChatPopup, { onClose: () => setChatOpen(false) })), menu && (_jsxs(_Fragment, { children: [_jsx("div", { onClick: () => setMenu(null), onContextMenu: (e) => { e.preventDefault(); setMenu(null); }, style: { position: 'fixed', inset: 0, zIndex: 50 } }), _jsxs("div", { style: {
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
                        }, children: [selectedName && (_jsx("div", { style: {
                                    padding: '6px 10px',
                                    color: '#888',
                                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                                    fontFamily: 'JetBrains Mono, Consolas, monospace',
                                    fontSize: 11,
                                }, children: selectedName })), _jsx(MenuItem, { label: "Properties", disabled: !selectedName, hint: !selectedName ? 'click an object first' : undefined, onClick: () => { if (selectedName)
                                    setPropsFor(selectedName); setMenu(null); } }), _jsx(MenuItem, { label: "Hide", disabled: !selectedName, hint: !selectedName ? 'click an object first' : undefined, onClick: () => { hideSelected(); setMenu(null); } }), _jsx(MenuItem, { label: "Show all", disabled: hidden.size === 0, onClick: () => { showAll(); setMenu(null); } })] })] }))] }));
}
const STATUS_COLORS = {
    operational: '#00d36b',
    warning: '#ffb020',
    fault: '#ff4d4d',
    unknown: '#888',
};
function ChartsPopup({ onClose }) {
    return (_jsxs("div", { style: {
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
        }, children: [_jsxs("div", { style: {
                    padding: '10px 14px',
                    background: 'rgba(255, 138, 26, 0.08)',
                    borderBottom: '1px solid rgba(255, 138, 26, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }, children: [_jsx("span", { style: {
                            width: 8, height: 8, borderRadius: '50%',
                            background: '#ff8a1a', boxShadow: '0 0 8px #ff8a1a',
                        } }), _jsx("span", { style: { fontSize: 13, fontWeight: 600, color: '#fff' }, children: "Sensor Live Readings" }), _jsx("button", { onClick: onClose, style: {
                            marginLeft: 'auto',
                            background: 'transparent',
                            color: '#aaa',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 20,
                            lineHeight: 1,
                            padding: 0,
                        }, title: "Close", children: "\u00D7" })] }), _jsxs("div", { style: {
                    flex: 1,
                    padding: 10,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gridTemplateRows: '1fr 1fr',
                    gap: 10,
                    minHeight: 0,
                }, children: [_jsx(TemperatureChart, {}), _jsx(HumidityChart, {}), _jsx(VibrationChart, {}), _jsx(AirQualityChart, {})] })] }));
}
function PropertiesPanel({ name, onClose }) {
    const p = getAssetProperties(name);
    return (_jsxs("div", { style: {
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
        }, children: [_jsxs("div", { style: {
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.04)',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                }, children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, color: '#fff' }, children: p.displayName }), _jsxs("div", { style: {
                                    fontSize: 10,
                                    color: '#888',
                                    fontFamily: 'JetBrains Mono, Consolas, monospace',
                                    marginTop: 2,
                                }, children: ["mesh: ", name] })] }), _jsx("button", { onClick: onClose, style: {
                            background: 'transparent',
                            color: '#888',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 18,
                            lineHeight: 1,
                            padding: 0,
                        }, title: "Close", children: "\u00D7" })] }), _jsxs("div", { style: {
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                }, children: [_jsx("span", { style: {
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: STATUS_COLORS[p.status],
                            boxShadow: `0 0 6px ${STATUS_COLORS[p.status]}`,
                        } }), _jsx("span", { style: { color: STATUS_COLORS[p.status], fontWeight: 500 }, children: p.status.toUpperCase() }), _jsx("span", { style: { color: '#666', fontSize: 11, marginLeft: 'auto' }, children: p.category })] }), _jsxs(Section, { title: "Identification", children: [_jsx(Row, { k: "Manufacturer", v: p.manufacturer }), _jsx(Row, { k: "Model", v: p.model }), _jsx(Row, { k: "Part #", v: p.partNumber, mono: true }), _jsx(Row, { k: "Serial #", v: p.serialNumber, mono: true })] }), (p.powerW !== undefined || p.rpm !== undefined) && (_jsxs(Section, { title: "Specs", children: [p.powerW !== undefined && _jsx(Row, { k: "Power", v: `${p.powerW} W`, mono: true }), p.rpm !== undefined && _jsx(Row, { k: "Max RPM", v: `${p.rpm}`, mono: true })] })), _jsxs(Section, { title: "Lifecycle", children: [_jsx(Row, { k: "Installed", v: p.installDate, mono: true }), _jsx(Row, { k: "Warranty", v: p.warrantyEnd, mono: true })] }), p.notes && (_jsx(Section, { title: "Notes", children: _jsx("div", { style: { color: '#aaa', fontSize: 11, lineHeight: 1.5 }, children: p.notes }) }))] }));
}
function Section({ title, children }) {
    return (_jsxs("div", { style: { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }, children: [_jsx("div", { style: {
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                    color: '#666',
                    marginBottom: 6,
                }, children: title }), children] }));
}
function Row({ k, v, mono }) {
    return (_jsxs("div", { style: {
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            padding: '3px 0',
        }, children: [_jsx("span", { style: { color: '#888' }, children: k }), _jsx("span", { style: {
                    color: '#ddd',
                    textAlign: 'right',
                    fontFamily: mono ? 'JetBrains Mono, Consolas, monospace' : undefined,
                    wordBreak: 'break-all',
                }, children: v })] }));
}
function ViewerToolbar({ chatOpen, metricsOpen, onToggleChat, onToggleMetrics, }) {
    return (_jsxs("div", { style: {
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            display: 'flex',
            gap: 4,
            padding: 6,
            background: 'rgba(15, 19, 28, 0.72)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 999,
            boxShadow: '0 8px 28px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255,255,255,0.05)',
            backdropFilter: 'blur(12px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
            fontFamily: 'Inter, Segoe UI, sans-serif',
        }, children: [_jsx(ToolbarButton, { active: metricsOpen, onClick: onToggleMetrics, title: "Live sensor charts", accent: "#ff8a1a", icon: _jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M3 3v18h18" }), _jsx("path", { d: "M7 14l4-4 3 3 5-6" })] }), label: "Charts" }), _jsx(ToolbarButton, { active: chatOpen, onClick: onToggleChat, title: "Diagnostics chat", accent: "#00e5ff", icon: _jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M21 12a8 8 0 1 1-3-6.24L21 4l-1.05 3.43A7.96 7.96 0 0 1 21 12z" }), _jsx("path", { d: "M8 11h.01M12 11h.01M16 11h.01" })] }), label: "Chat" })] }));
}
function ToolbarButton({ active, onClick, icon, label, title, accent, }) {
    return (_jsxs("button", { onClick: onClick, title: title, style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            fontSize: 12,
            fontWeight: 500,
            background: active ? `${accent}22` : 'transparent',
            color: active ? accent : '#cfd6e1',
            border: `1px solid ${active ? `${accent}66` : 'transparent'}`,
            borderRadius: 999,
            cursor: 'pointer',
            transition: 'background 120ms, color 120ms, border-color 120ms',
        }, onMouseEnter: (e) => {
            if (!active)
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
        }, onMouseLeave: (e) => {
            if (!active)
                e.currentTarget.style.background = 'transparent';
        }, children: [icon, _jsx("span", { children: label })] }));
}
function ChatPopup({ onClose }) {
    return (_jsxs("div", { style: {
            position: 'absolute',
            left: 12,
            top: 12,
            bottom: 76,
            zIndex: 40,
            width: 'min(42%, 460px)',
            background: '#0f131c',
            border: '1px solid rgba(0, 229, 255, 0.35)',
            borderRadius: 10,
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 229, 255, 0.15)',
            fontFamily: 'Inter, Segoe UI, sans-serif',
            color: '#ddd',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
        }, children: [_jsxs("div", { style: {
                    padding: '10px 14px',
                    background: 'rgba(0, 229, 255, 0.07)',
                    borderBottom: '1px solid rgba(0, 229, 255, 0.22)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }, children: [_jsx("span", { style: {
                            width: 8, height: 8, borderRadius: '50%',
                            background: '#00e5ff', boxShadow: '0 0 8px #00e5ff',
                        } }), _jsx("span", { style: { fontSize: 13, fontWeight: 600, color: '#fff' }, children: "Diagnostics Chat" }), _jsx("button", { onClick: onClose, style: {
                            marginLeft: 'auto',
                            background: 'transparent',
                            color: '#aaa',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 20,
                            lineHeight: 1,
                            padding: 0,
                        }, title: "Close", children: "\u00D7" })] }), _jsx("div", { style: { flex: 1, minHeight: 0, padding: 10, display: 'flex' }, children: _jsx(ChatPanel, { embedded: true }) })] }));
}
function MenuItem({ label, onClick, disabled, hint, }) {
    return (_jsx("button", { onClick: onClick, disabled: disabled, title: hint, style: {
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
        }, onMouseEnter: (e) => {
            if (!disabled)
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
        }, onMouseLeave: (e) => {
            e.currentTarget.style.background = 'transparent';
        }, children: label }));
}

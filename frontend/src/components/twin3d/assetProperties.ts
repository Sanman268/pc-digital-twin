// Fake "asset register" data for each named mesh in the PC case GLB.
// These are placeholders that look like real CMDB / inventory entries; swap in
// real values when the bill of materials is finalized.

export type AssetStatus = 'operational' | 'warning' | 'fault' | 'unknown'

export interface AssetProperties {
  displayName: string
  category: string
  manufacturer: string
  model: string
  partNumber: string
  serialNumber: string
  installDate: string
  warrantyEnd: string
  powerW?: number
  rpm?: number
  status: AssetStatus
  notes?: string
}

const REGISTRY: Record<string, AssetProperties> = {
  case_body: {
    displayName: 'Mid-Tower Chassis',
    category: 'Chassis',
    manufacturer: 'Fractal Design',
    model: 'Define 7 Compact',
    partNumber: 'FD-C-DEF7C-01',
    serialNumber: 'FD7C-2024-0381',
    installDate: '2024-08-12',
    warrantyEnd: '2029-08-12',
    status: 'operational',
    notes: 'Sound-dampened side panels; ATX form factor.',
  },
  side_panel: {
    displayName: 'Tempered Glass Side Panel',
    category: 'Chassis Panel',
    manufacturer: 'Fractal Design',
    model: 'TGS-DEF7C',
    partNumber: 'FD-A-TGS-001',
    serialNumber: 'TGS-7741',
    installDate: '2024-08-12',
    warrantyEnd: '2029-08-12',
    status: 'operational',
    notes: '4 mm tempered glass, captive thumbscrews.',
  },
  fan_front: {
    displayName: 'Front Intake Fan',
    category: 'Cooling',
    manufacturer: 'Noctua',
    model: 'NF-A14 PWM',
    partNumber: 'NF-A14-PWM',
    serialNumber: 'NCT-A14-118203',
    installDate: '2024-08-12',
    warrantyEnd: '2030-08-12',
    powerW: 1.56,
    rpm: 1500,
    status: 'operational',
    notes: '140 mm intake, anti-vibration mounts.',
  },
  fan_rear: {
    displayName: 'Rear Exhaust Fan',
    category: 'Cooling',
    manufacturer: 'Noctua',
    model: 'NF-A12x25 PWM',
    partNumber: 'NF-A12X25-PWM',
    serialNumber: 'NCT-A12-228871',
    installDate: '2024-08-12',
    warrantyEnd: '2030-08-12',
    powerW: 1.68,
    rpm: 2000,
    status: 'operational',
    notes: '120 mm exhaust above I/O shield.',
  },
  gpu: {
    displayName: 'Graphics Card',
    category: 'GPU',
    manufacturer: 'NVIDIA',
    model: 'GeForce RTX 4070 Super',
    partNumber: 'PG141-SKU331',
    serialNumber: 'GPU-4070S-9C2A1F',
    installDate: '2024-09-02',
    warrantyEnd: '2027-09-02',
    powerW: 220,
    status: 'operational',
    notes: 'PCIe 4.0 x16, 12 GB GDDR6X.',
  },
  cpu_area: {
    displayName: 'CPU + Cooler Assembly',
    category: 'CPU',
    manufacturer: 'AMD',
    model: 'Ryzen 7 7800X3D',
    partNumber: '100-100000910WOF',
    serialNumber: 'CPU-7800X3D-2K48',
    installDate: '2024-08-15',
    warrantyEnd: '2027-08-15',
    powerW: 120,
    status: 'operational',
    notes: 'AM5 socket; Noctua NH-D15 cooler.',
  },
  psu: {
    displayName: 'Power Supply Unit',
    category: 'Power',
    manufacturer: 'Seasonic',
    model: 'Focus GX-850',
    partNumber: 'SSR-850FX',
    serialNumber: 'PSU-GX850-44210',
    installDate: '2024-08-12',
    warrantyEnd: '2034-08-12',
    powerW: 850,
    status: 'operational',
    notes: '80+ Gold, fully modular.',
  },
  sensor_node: {
    displayName: 'Thunderboard Sense Node',
    category: 'Sensor / IoT',
    manufacturer: 'Silicon Labs',
    model: 'Thunderboard Sense (BRD4160A)',
    partNumber: 'SLTB001A',
    serialNumber: 'TB-SENSE-A14C9',
    installDate: '2026-04-30',
    warrantyEnd: '2028-04-30',
    powerW: 0.05,
    status: 'operational',
    notes: 'BLE 4.2; Si7021 / BMP280 / ICM-20648 / Si1133.',
  },
}

// Stable deterministic hash for fallback fakes (so the same mesh name always
// gets the same fake serial / dates across reloads).
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]
}

function fakeForUnknown(name: string): AssetProperties {
  const h = hashStr(name)
  const categories = ['Chassis Part', 'Cooling', 'I/O', 'Cable', 'Mount', 'Drive Bay']
  const vendors = ['Corsair', 'be quiet!', 'Lian Li', 'Phanteks', 'Cooler Master', 'NZXT']
  const year = 2023 + (h % 3)
  const month = String(1 + (h % 12)).padStart(2, '0')
  const day = String(1 + (h % 28)).padStart(2, '0')

  return {
    displayName: name.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    category: pick(categories, h),
    manufacturer: pick(vendors, h >>> 3),
    model: `GEN-${(h % 9000) + 1000}`,
    partNumber: `PN-${name.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${(h % 900) + 100}`,
    serialNumber: `SN-${(h % 0xffffff).toString(16).toUpperCase().padStart(6, '0')}`,
    installDate: `${year}-${month}-${day}`,
    warrantyEnd: `${year + 3}-${month}-${day}`,
    status: 'operational',
    notes: 'Auto-generated entry — not in registry.',
  }
}

export function getAssetProperties(name: string): AssetProperties {
  return REGISTRY[name] ?? fakeForUnknown(name)
}

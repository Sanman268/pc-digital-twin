# PC Digital Twin – Project Init Document

**Project:** `pc-digital-twin`  
**Version:** 0.1.0  
**Stack:** Python FastAPI · React + Vite · Three.js · InfluxDB  
**Hardware:** Silicon Labs Thunderboard Sense 2 · PC Case

---

## 1. Project Overview

A Digital Twin simulation for a PC case using a Thunderboard Sense 2 mounted inside the case. Sensor data is collected over BLE, stored in InfluxDB, visualized on an interactive 3D dashboard, and analyzed by an LLM diagnostic agent.

### Three Development Stages

| Stage | Goal | Output |
|---|---|---|
| Stage 1 | Data collection | BLE → Gateway → InfluxDB |
| Stage 2 | Visualization | Sensor charts + 3D PC model (Three.js) |
| Stage 3 | Diagnostics | LLM-based analysis and recommendations |

---

## 2. Repo Structure

```
pc-digital-twin/
│
├── firmware/                        # Simplicity Studio – Thunderboard Sense 2
│   ├── src/
│   │   ├── app.c                    # Main loop
│   │   ├── sensors.c / sensors.h    # Read all sensors
│   │   ├── ble_service.c            # BLE GATT service
│   │   └── config.h                 # node_id, asset_id, intervals
│   └── README.md
│
├── gateway/                         # Python – FastAPI service
│   ├── ble/
│   │   ├── scanner.py               # bleak – scan & connect TBS2
│   │   └── parser.py                # Parse BLE payload → SensorReading
│   ├── influx/
│   │   └── writer.py                # Write points to InfluxDB
│   ├── api/
│   │   ├── routes_sensor.py         # GET /api/sensor/history
│   │   ├── routes_events.py         # GET /api/events/boot
│   │   ├── routes_status.py         # GET /api/status/gateway
│   │   └── chat.py                  # POST /api/chat (tool-using LLM agent)
│   ├── llm/
│   │   ├── llama_client.py          # AsyncOpenAI client → Ollama
│   │   ├── prompts.py               # System prompt
│   │   ├── tools.py                 # OpenAI-style tool schemas
│   │   └── executor.py              # Tool dispatch + Influx queries
│   ├── models/
│   │   └── schemas.py               # Pydantic models
│   ├── main.py                      # FastAPI app + background BLE task
│   ├── config.py                    # .env loader
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/                        # React + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── charts/
│   │   │   │   ├── TemperatureChart.tsx
│   │   │   │   ├── HumidityChart.tsx
│   │   │   │   ├── VibrationChart.tsx
│   │   │   │   └── AirQualityChart.tsx
│   │   │   ├── twin3d/
│   │   │   │   ├── PCTwinViewer.tsx  # Three.js canvas wrapper
│   │   │   │   ├── ModelLoader.ts    # Load .glb, map mesh names
│   │   │   │   └── SensorOverlay.ts  # Highlight mesh by sensor state
│   │   │   ├── chat/
│   │   │   │   └── ChatPanel.tsx
│   │   │   └── layout/
│   │   │       ├── Header.tsx
│   │   │       └── StatusBar.tsx
│   │   ├── hooks/
│   │   │   ├── useSensorData.ts      # Polling /api/sensor/history
│   │   │   └── useGatewayStatus.ts
│   │   ├── lib/
│   │   │   └── api.ts                # Axios base config
│   │   ├── types/
│   │   │   └── sensor.ts             # TypeScript interfaces
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   │   └── models/
│   │       └── pc_case.glb           # ← export from Blender, place here
│   ├── package.json
│   └── vite.config.ts
│
├── infra/
│   └── docker-compose.yml            # InfluxDB 2.x
│
├── docs/
│   ├── sensor_placement.md           # Board placement inside the case
│   └── ble_protocol.md               # BLE GATT UUID map
│
├── .gitignore
└── README.md
```

---

## 3. Tech Stack

### Backend – Gateway

| Package | Version | Purpose |
|---|---|---|
| `fastapi` | latest | REST API framework |
| `uvicorn` | latest | ASGI server |
| `bleak` | latest | Async BLE client (Python) |
| `influxdb-client` | latest | Write/query InfluxDB |
| `pydantic` | v2 | Data validation / schemas |
| `httpx` | latest | Async LLM API calls |
| `python-dotenv` | latest | Load .env |

### Frontend

| Package | Version | Purpose |
|---|---|---|
| `react` + `vite` | latest | UI framework |
| `three` | latest | 3D rendering |
| `@react-three/fiber` | latest | React wrapper for Three.js |
| `@react-three/drei` | latest | Helpers: OrbitControls, useGLTF, etc. |
| `recharts` | latest | Sensor data line charts |
| `axios` | latest | HTTP client |
| `typescript` | latest | Type safety |

### Infrastructure

| Service | Version | Port |
|---|---|---|
| InfluxDB | 2.x | 8086 |
| FastAPI gateway | - | 8000 |
| Vite dev server | - | 5173 |

---

## 4. InfluxDB Schema

**Bucket:** `fm_simulation`  
**Organization:** `home_lab`

### Measurement: `case_sensor_data`

| Field | Type | Description |
|---|---|---|
| `temperature_c` | float | Internal case temperature (°C) |
| `humidity_pct` | float | Relative humidity (%) |
| `pressure_hpa` | float | Barometric pressure (hPa) |
| `light_lux` | float | Ambient light – detects case opening |
| `air_quality_index` | int | Air quality / VOC index |
| `co2_ppm` | int | CO₂ concentration (ppm) |
| `vibration_rms` | float | Acceleration RMS (mg) |
| `accel_x/y/z` | float | 3-axis acceleration |
| `rssi` | int | BLE signal strength (dBm) |

**Tags:** `node_id`, `asset_id`, `location`

### Measurement: `case_boot_event`

| Field | Type | Description |
|---|---|---|
| `boot_counter` | int | Number of times the board has booted |
| `firmware_version` | string | Running firmware version |
| `power_source` | string | `usb` |

### Measurement: `case_gateway_status`

| Field | Type | Description |
|---|---|---|
| `connected` | bool | BLE connected / disconnected |
| `last_seen` | string | Timestamp of last received packet |

---

## 5. API Endpoints (FastAPI)

### Sensor Data
```
GET  /api/sensor/history?range=1h&field=temperature_c
     → [{ time, value }]

GET  /api/sensor/latest
     → { temperature_c, humidity_pct, vibration_rms, light_lux, ... }
```

### Events
```
GET  /api/events/boot?limit=10
     → [{ time, boot_counter, firmware_version }]
```

### Gateway Status
```
GET  /api/status/gateway
     → { connected: bool, last_seen: str, node_id: str }
```

### Diagnostics Chat
```
POST /api/chat
     body: { message: str, history: [{ role, content }] }
     → { answer: str, tool_calls: [...], data_points: [...], latency_ms: int }
```
Conversational tool-using agent. The planner pass picks from `query_window`,
`find_anomalies`, and `compare_windows` (see `gateway/llm/tools.py`); the
narrator pass turns the tool results into a natural-language answer.

---

## 6. BLE Protocol

The Thunderboard Sense 2 communicates via GATT notifications.

### GATT Service UUIDs (custom)
```
Service:    xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  (defined in firmware)
Char Data:  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  (sensor payload)
Char Event: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  (boot / heartbeat)
```

> Specific UUIDs are defined in `firmware/src/ble_service.c` and mirrored in `gateway/ble/scanner.py`.

### Payload Format (JSON over BLE notify)

```json
{
  "t":   38.5,
  "h":   45.2,
  "p":   1013.1,
  "l":   12,
  "aq":  1,
  "co2": 820,
  "vx":  0.01,
  "vy":  -0.02,
  "vz":  9.80,
  "up":  3600
}
```

> Short keys minimise BLE payload size. The gateway parser expands them to full field names before writing to InfluxDB.

---

## 7. Three.js Model Integration

### Blender Mesh Naming Convention (before GLB export)

Name each mesh as follows so the renderer can reference them via `getObjectByName()`:

| Mesh Name | Description |
|---|---|
| `case_body` | Main case chassis |
| `side_panel` | Side panel |
| `fan_front` | Front intake fan |
| `fan_rear` | Rear exhaust fan |
| `gpu` | Graphics card |
| `cpu_area` | CPU / heatsink region |
| `psu` | Power supply unit |
| `sensor_node` | Thunderboard Sense 2 mounting location |

### Sensor State → Mesh Color Mapping

```typescript
const STATE_COLORS = {
  normal:   '#00ff88',  // green
  warning:  '#ffaa00',  // amber
  critical: '#ff3333',  // red
  offline:  '#666666',  // grey
}
```

The `sensor_node` mesh changes color in real time based on connection status and live sensor values.

---

## 8. Stage 3 – Diagnostics Chat Agent

Tool-using conversational agent backed by Ollama (Llama 3.1 8B by default,
served over Tailscale from a workstation). See `docs/STAGE3.md` for the
architecture writeup and `gateway/llm/prompts.py` for the live system prompt.

Two-pass pipeline per `POST /api/chat` call:

1. **Planner pass** — Llama decides whether to call a tool. Available tools
   (`gateway/llm/tools.py`):
   - `query_window(metric, window, aggregation)` — min/max/mean/std over a window
   - `find_anomalies(metric, window, threshold_sigma)` — z-score outliers
   - `compare_windows(metric, window_a, window_b, aggregation)` — delta between two windows
2. **Narrator pass** — Llama turns the tool results into a natural-language reply.

Tool arguments are validated with Pydantic; results are capped and
timestamp-localised before being fed back to the model.

---

## 9. Environment Variables

### `gateway/.env.example`

```env
# InfluxDB
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=your-token-here
INFLUXDB_ORG=home_lab
INFLUXDB_BUCKET=fm_simulation

# BLE
BLE_DEVICE_NAME=Thunderboard Sense 2
BLE_SCAN_TIMEOUT=10
BLE_RETRY_INTERVAL=5

# Asset
NODE_ID=TBS2_001
ASSET_ID=PC_CASE_001

# Ollama (Stage 3 chat agent)
OLLAMA_BASE_URL=http://desktop-3dvru40:11434/v1
OLLAMA_MODEL=llama3.1:8b
LOCAL_TZ=Asia/Ho_Chi_Minh

# API
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:5173
```

---

## 10. docker-compose.yml (InfluxDB)

```yaml
version: '3.8'
services:
  influxdb:
    image: influxdb:2.7
    ports:
      - "8086:8086"
    volumes:
      - influxdb_data:/var/lib/influxdb2
    environment:
      - DOCKER_INFLUXDB_INIT_MODE=setup
      - DOCKER_INFLUXDB_INIT_USERNAME=admin
      - DOCKER_INFLUXDB_INIT_PASSWORD=adminpassword
      - DOCKER_INFLUXDB_INIT_ORG=home_lab
      - DOCKER_INFLUXDB_INIT_BUCKET=fm_simulation
      - DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=my-super-secret-token

volumes:
  influxdb_data:
```

---

## 11. Development Setup

### Step 1 – Clone the repo

```bash
git clone https://github.com/yourname/pc-digital-twin.git
cd pc-digital-twin
```

### Step 2 – Start InfluxDB

```bash
cd infra
docker compose up -d
# Dashboard at http://localhost:8086
```

### Step 3 – Set up the Gateway

```bash
cd gateway
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env       # Fill in your InfluxDB token
python main.py
# API at http://localhost:8000
```

### Step 4 – Set up the Frontend

```bash
cd frontend
npm install
# Place your exported GLB at public/models/pc_case.glb
npm run dev
# UI at http://localhost:5173
```

### Step 5 – Firmware

Open Simplicity Studio, import the project from `firmware/`, build, and flash to the Thunderboard Sense 2.

---

## 12. MVP Checklist

### Stage 1 – Data Collection
- [ ] Firmware reads sensors and sends BLE notifications
- [ ] Gateway connects via BLE and receives data
- [ ] Data is written to InfluxDB
- [ ] Boot event is recorded on every board power-on
- [ ] Gateway connection status is logged
- [ ] `GET /api/sensor/latest` returns live data

### Stage 2 – Visualization
- [ ] Line charts display temperature, humidity, and vibration
- [ ] PC case GLB loads correctly in Three.js
- [ ] `sensor_node` mesh changes color by state
- [ ] Dashboard auto-refreshes every 5 seconds

### Stage 3 – Diagnostics
- [ ] `POST /api/chat` reaches the Ollama endpoint over Tailscale
- [ ] Planner pass emits at least one tool call for "how warm was it overnight?"
- [ ] Tool results are queried from InfluxDB and timestamps are localised
- [ ] Narrator pass renders a natural-language answer in the Chat panel

---

## 13. Known Constraints

**BLE shielding:** A metal case attenuates BLE signals. Mount the board near a mesh or glass panel. If RSSI stays below −80 dBm, use a USB extension cable to move the board closer to the BLE adapter.

**Timestamps:** The board only transmits uptime — it has no RTC. The PC Gateway assigns a wall-clock timestamp on receipt. Document this assumption when analysing historical data.

**Sensor placement:** Measured temperature depends on where the board is mounted. Record the exact location in `docs/sensor_placement.md`.

**Vibration noise:** The IMU reacts to minor disturbances such as desk movement or accidental contact. Use rolling RMS rather than instantaneous samples.

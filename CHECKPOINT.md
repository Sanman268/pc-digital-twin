# PC Digital Twin — Checkpoint

**Last updated:** 2026-05-26
**Phase:** Stage 4 — predictive dashboard: linear-fit forecasting + chat forecast tools on a three-column desktop layout
**Version:** 0.5.1 — three-column dashboard refactor (see `docs/results/v0.5.1-dashboard.png`)

---

## Status Summary

| Area | Status | Notes |
|---|---|---|
| Repo structure | Done | All directories created per `docs/SPEC.md` |
| Gateway (Python) | **Running** | Connects to Thunderboard, reads SIG ENV service, writes to Influx |
| Frontend (React) | **Running** | Vite dev server on :5173; live charts + 3D viewer rendering |
| Firmware (C) | Stubbed (not flashed) | Using stock SiLabs demo firmware on the board for now |
| InfluxDB | **Running** | Docker container up; `case_sensor_data` measurement receiving writes |
| Docs | Drafted | Sensor placement + BLE protocol templates |
| IDE configs | Done | PyCharm `.idea/`, VS 2022 `.sln` |

### Live data verified at v0.1.0

- Temperature: 36 → 38 °C (Si7021 self-heating, real)
- Humidity: 62 → 58 % (anti-correlated with temp, correct)
- Vibration RMS: ~1040 mg at rest (= 1 g), captured a real bump spike to 1234 mg
- CO₂: flat 0 (no CCS811 on Thunderboard Sense v1)
- BLE status: connected, fresh `last_seen` timestamps
- GLB model loads in Three.js viewer

---

## Files Created

### Root
- [x] `README.md`
- [x] `.gitignore`
- [x] `pc_digital_twin.sln` (Visual Studio 2022)
- [x] `.idea/` (PyCharm project config)

### Gateway (`gateway/`)
- [x] `main.py` — FastAPI app, CORS, lifespan BLE task
- [x] `config.py` — pydantic-settings `.env` loader
- [x] `requirements.txt` — fastapi, uvicorn, bleak, influxdb-client, pydantic-settings, httpx, python-dotenv
- [x] `.env.example`
- [x] `ble/scanner.py` — bleak scan/connect/notify loop
- [x] `ble/parser.py` — JSON short-key payload → SensorReading
- [x] `influx/writer.py` — write points + query_history
- [x] `api/routes_sensor.py` — `/history`, `/latest`
- [x] `api/routes_events.py` — `/boot`
- [x] `api/routes_status.py` — `/gateway`
- [x] `api/chat.py` — `/api/chat` tool-using LLM agent
- [x] `llm/llama_client.py` — AsyncOpenAI client → Ollama
- [x] `llm/prompts.py` — system prompt
- [x] `llm/tools.py` — OpenAI-style tool schemas
- [x] `llm/executor.py` — tool dispatch + Influx queries
- [x] `models/schemas.py` — pydantic v2 models

### Frontend (`frontend/`)
- [x] `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- [x] `src/main.tsx`, `src/App.tsx`
- [x] `src/lib/api.ts` — axios instance, `/api` proxy
- [x] `src/types/sensor.ts` — interfaces + STATE_COLORS
- [x] `src/hooks/useSensorData.ts`, `useGatewayStatus.ts`
- [x] `src/components/charts/` — Temperature, Humidity, Vibration, AirQuality (recharts)
- [x] `src/components/twin3d/PCTwinViewer.tsx` — @react-three/fiber + drei
- [x] `src/components/twin3d/ModelLoader.ts` — GLTF loader, mesh name registry
- [x] `src/components/twin3d/SensorOverlay.ts` — state derivation, mesh recolor
- [x] `src/components/chat/ChatPanel.tsx` — diagnostics chat UI
- [x] `src/components/layout/` — Header, StatusBar
- [x] `public/models/README.md`

### Firmware (`firmware/`)
- [x] `src/app.c` — main loop skeleton
- [x] `src/sensors.c` / `src/sensors.h` — sensor_sample_t struct, init/read stubs
- [x] `src/ble_service.c` — JSON payload formatter, GATT TODOs
- [x] `src/config.h` — NODE_ID, ASSET_ID, intervals
- [x] `README.md`

### Infra & Docs
- [x] `infra/docker-compose.yml` — InfluxDB 2.7
- [x] `docs/sensor_placement.md`
- [x] `docs/ble_protocol.md`

---

## Blockers / To Fill In

| # | Item | Where | Required for |
|---|---|---|---|
| 1 | Generate real BLE GATT UUIDs | `firmware/src/ble_service.c` + `gateway/ble/scanner.py` | Stage 1 |
| 2 | Set `INFLUXDB_TOKEN` | `gateway/.env` | Stage 1 |
| 3 | Run Ollama with `llama3.1:8b` reachable over Tailscale | `OLLAMA_BASE_URL` in `gateway/.env` | Stage 3 |
| 4 | Export `pc_case.glb` from Blender with named meshes | `frontend/public/models/` | Stage 2 |
| 5 | Wire SiLabs sensor drivers (Si7021, BMP280, Si1133, ICM-20648, CCS811) | `firmware/src/sensors.c` | Stage 1 |
| 6 | Persist `boot_counter` to NVM | `firmware/src/app.c` | Stage 1 |
| 7 | Resolve `sl_sleeptimer` ms tick | `firmware/src/app.c` | Stage 1 |

---

## Next Actions

### Immediate (to get Stage 1 running on the bench)

1. **Bring up InfluxDB**
   ```powershell
   cd infra
   docker compose up -d
   ```
   Verify dashboard at http://localhost:8086 (admin / adminpassword).

2. **Install gateway deps & run**
   ```powershell
   cd gateway
   python -m venv venv
   .\venv\Scripts\Activate
   pip install -r requirements.txt
   copy .env.example .env
   # edit .env: paste the Influx token; point OLLAMA_BASE_URL at your Ollama host
   python main.py
   ```
   Hit http://localhost:8000/docs to confirm the API loaded.

3. **Install frontend deps**
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
   Open http://localhost:5173. Charts and 3D viewer will render but show no data
   until the gateway is receiving BLE.

4. **Flash firmware**
   - Open Simplicity Studio, import the *SoC – Empty* example for `BRD4166A`.
   - Copy `firmware/src/*` into the project's `app/` folder.
   - Generate real UUIDs (e.g. `New-Guid` in PowerShell) and paste them into
     `ble_service.c` AND `gateway/ble/scanner.py`.
   - Add sensor components in the Component Editor.
   - Build and flash.

### Stage 1 — Data Collection MVP
- [x] ~~Firmware reads sensors and sends BLE notifications~~ — using stock SiLabs demo firmware
- [x] Gateway connects via BLE and receives data
- [x] Data is written to InfluxDB
- [ ] Boot event is recorded on every board power-on (deferred: stock fw doesn't emit it)
- [x] Gateway connection status is logged
- [x] `GET /api/sensor/latest` returns live data

### Stage 2 — Visualization
- [x] Line charts display temperature, humidity, vibration
- [x] PC case GLB loads correctly in Three.js
- [ ] `sensor_node` mesh changes color by state (needs named mesh in the GLB)
- [x] Dashboard auto-refreshes every 5 seconds

### Stage 3 — Diagnostics
- [x] `POST /api/chat` reaches Ollama (Llama 3.1 8B) over Tailscale
- [x] Planner pass emits tool calls (`query_window`, `find_anomalies`, `compare_windows`)
- [x] Tool results pull live data from InfluxDB with localised timestamps
- [x] Narrator pass renders a natural-language answer in the Chat panel

---

## IDE Setup Reminder

- **PyCharm:** Open the project root. The `.idea/` config marks `gateway/`
  as Sources Root. After creating the venv, point the interpreter at
  `gateway/venv/Scripts/python.exe`.
- **Visual Studio 2022:** Open `pc_digital_twin.sln`, or use *File → Open
  → Folder* on `frontend/` for TypeScript or `firmware/` for C. Full
  firmware build still requires Simplicity Studio.

---

## Change Log

- **2026-05-19** — Initial scaffold of all three stages per spec. No
  business logic yet; every external integration (BLE UUIDs, Influx token,
  LLM key, GLB model, SiLabs sensor drivers) is a TODO.
- **2026-05-19 (v0.1.0)** — First end-to-end light. Pivoted the BLE
  scanner from custom-JSON-over-notify to the stock SiLabs Thunderboard
  demo firmware: standard SIG Environmental Sensing service for
  temp/humidity/pressure/UV/light + custom Acceleration notify. Connected
  to "Thunder Sense #16453" (BRD4160A — the v1 board, not Sense 2; no
  CCS811 so CO₂/AQI are always zero). Live data confirmed in dashboard:
  thermal self-heating curve, anti-correlated humidity, vibration spike
  on physical bump. `INFLUXDB_TOKEN` set; gateway running; Influx + Vite
  + GLB model all green. Screenshot:
  `docs/results/v0.1.0-dashboard.png`.
- **2026-05-19 (v0.2.0)** — Dashboard polish pass. 3D viewer: case
  rotated upright (+90° X), drei `Environment` for studio IBL,
  `ContactShadows` for grounding, `Bounds` auto-framing, smoothed
  OrbitControls with damping + bounded zoom, auto-rotate overlay
  button. Frontend redesign: dark theme via CSS variables in
  `styles.css`, dedicated `MetricTile` KPI strip (Temp/Humidity/Pressure
  /Vibration) sharing a `useLatest` poll hook, card-based layout,
  gradient-filled area charts with proper tooltips/units, refined
  Header with live status pill + relative `last_seen`, polished
  Diagnostics panel with empty/loading/error states. No backend
  changes.
- **2026-05-19 (v0.2.1)** — Dashboard interactivity. Added a global
  `SettingsContext` and a new `Controls` bar with: history range
  selector (5m / 15m / 1h / 6h / 24h), refresh-interval selector
  (1s–30s), Pause/Resume toggle, and a manual ↻ Refresh button. All
  data-fetching hooks (`useSensorData`, `useLatest`) now read from
  the context, so changing range or pausing freezes all KPI tiles,
  charts, AND the 3D viewer's sensor-state color in sync.
  `refreshTick` counter triggers atomic re-fetch across hooks. 3D
  viewer migrated from its own polling loop to the shared
  `useLatest` hook. Frontend-only — no backend changes. Screenshot:
  `docs/results/v0.2.1-dashboard.png`.
- **2026-05-19 (v0.2.2)** — Viewer interaction: click-to-select a mesh,
  hide/show, and a right-click context menu in `PCTwinViewer`.
- **2026-05-19 (v0.2.3)** — Asset properties panel: per-mesh CMDB-style
  metadata (`assetProperties.ts`) surfaced in a side panel on selection.
- **2026-05-19 (v0.2.4)** — Dashboard rework: hero 3D viewer with the
  sensor charts moved into a marker-triggered popup over the canvas.
- **2026-05-21 (v0.3.0)** — Chore: drop committed `tsc` emit artifacts,
  bump version.
- **2026-05-21 (v0.3.1)** — Align the in-app version header with the
  package version.
- **2026-05-21 (v0.3.2)** — Stage 3 done. Chat agent answers in English
  with robust timezone handling; planner/narrator passes over the
  `query_window` / `find_anomalies` / `compare_windows` tools. See
  `docs/STAGE3.md`. Screenshot: `docs/results/v0.3.2-dashboard.png`.
- **2026-05-26 (v0.4.0)** — Stage 4 forecasting tools (chat agent only):
  added `forecast_window`, `time_to_threshold`, and `forecast_accuracy`
  on top of a current-session linear fit (`llm/forecast.py`). A forecast
  is refused (`ok=false`) unless the current contiguous session is at
  least 2× the requested horizon.
- **2026-05-26 (v0.5.0)** — Stage 4 predictive UI. Surfaced the forecast
  in the charts: dashed projection line past a "now" marker, ±1 RMSE
  shaded band, threshold badges, and a `/api/forecast` + `/api/threshold`
  endpoint pair. Default chart horizon set to 15m.
- **2026-05-26 (v0.5.1)** — Three-column desktop dashboard refactor.
  Replaced the floating overlay panels with a docked layout: Diagnostics
  Chat in a left sidebar (340–380px), the 3D PC case viewer as the center
  canvas, and Sensor Live Readings in a right sidebar (420–500px) stacking
  Temperature, Humidity, and Vibration RMS. Removed the CO₂ chart card
  (the Thunderboard stock firmware does not report CO₂) in favour of a
  short footer note, and deleted the floating Charts/Chat toggle plus the
  chart/chat popups. Columns stack vertically below 1100px for
  tablet/mobile. Forecast overlay, RMSE band, now marker, threshold
  badges, and chat forecast tools are unchanged; no backend or
  forecast-math changes. Screenshot: `docs/results/v0.5.1-dashboard.png`.

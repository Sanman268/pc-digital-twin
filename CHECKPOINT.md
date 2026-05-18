# PC Digital Twin — Checkpoint

**Last updated:** 2026-05-19
**Phase:** Stage 2 — Live BLE → Influx → 3D dashboard running on stock SiLabs demo firmware
**Version:** 0.1.0 — first end-to-end light (see `docs/results/v0.1.0-dashboard.png`)

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
- [x] `api/routes_diagnostics.py` — `/analyze`
- [x] `llm/agent.py` — Claude + Gemma adapters, prompt builder
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
- [x] `src/components/diagnostics/` — DiagnosticsPanel, AlertBadge
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
| 3 | Set `ANTHROPIC_API_KEY` | `gateway/.env` | Stage 3 |
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
   # edit .env: paste the Influx token, set ANTHROPIC_API_KEY (or switch LLM_PROVIDER=gemma)
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
- [ ] `POST /api/diagnostics/analyze` successfully calls the LLM
- [ ] Prompt is populated with real data from InfluxDB
- [ ] Diagnostic result is rendered in the Diagnostics Panel
- [ ] Alert badge appears when an anomaly is detected

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

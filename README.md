# PC Digital Twin

> A digital twin of a PC case: a Silicon Labs Thunderboard sensor node streams
> environmental data over BLE to a Python gateway, which persists to InfluxDB
> and serves an interactive React + Three.js dashboard. An LLM diagnostic
> agent analyzes recent telemetry on demand.

![Dashboard at v0.3.2 — live temperature, humidity, vibration with a real bump spike captured at 19:05:33](docs/results/v0.3.2-dashboard.png)

## What it does

A Thunderboard Sense board sits inside the case. Every two seconds the
gateway reads temperature, humidity, pressure, ambient light, and 3-axis
acceleration over Bluetooth Low Energy, writes them to a time-series
database, and exposes a REST API. A web dashboard renders the data as live
charts alongside a 3D model of the case. A diagnostics endpoint summarizes
recent history through an LLM (Claude or local Gemma).

The screenshot above is real telemetry from a Thunderboard sitting on the
desk — note the steady self-heating curve, the anti-correlated humidity, and
the **vibration spike at 19:05:33** captured when the board was bumped.

## What this demonstrates

- **IoT / BLE stack** — discovering, connecting, subscribing to GATT
  characteristics (both standard SIG Environmental Sensing and Silicon Labs
  custom services) with `bleak`, including graceful reconnect on Windows
  BLE quirks.
- **Async Python service design** — FastAPI with a background BLE task in
  the app lifespan, pydantic v2 schemas, layered modules
  (`ble`, `influx`, `api`, `llm`, `models`).
- **Time-series ingestion** — InfluxDB 2.x with Flux queries for history
  endpoints; bucketed measurements `case_sensor_data`, `case_boot_event`,
  `case_gateway_status`.
- **3D web visualization** — Three.js via `@react-three/fiber` and `drei`,
  with a sensor-state → mesh-color overlay system.
- **LLM-backed diagnostics** — provider-agnostic agent that builds a prompt
  from rolling Influx aggregates and calls either Claude API or a local
  Ollama/Gemma endpoint.
- **Hardware adaptation** — the spec assumed a Thunderboard Sense 2 with
  custom firmware emitting JSON-over-notify; the actual hardware was a
  Sense v1 (BRD4160A) running stock SiLabs demo firmware. The gateway was
  rewritten to talk to the stock GATT services without firmware reflash —
  see [`docs/results/v0.1.0-ble-probe.txt`](docs/results/v0.1.0-ble-probe.txt)
  and the change log in [`CHECKPOINT.md`](CHECKPOINT.md).
- **Infra as code** — InfluxDB via `docker compose`, reproducible
  `.env.example`, `requirements.txt`, `package.json` with lockfile.

## Architecture

```
 ┌─────────────────────┐       BLE (GATT)        ┌──────────────────────────┐
 │  Thunderboard Sense │ ─────────────────────►  │  Gateway (FastAPI)       │
 │  (Si7021, BMP280,   │                         │  ble/   scanner+parser   │
 │   ICM-20648, Si1133)│                         │  influx writer           │
 └─────────────────────┘                         │  api/   /sensor /status  │
                                                 │         /events /diag    │
                                                 │  llm/   Claude · Gemma   │
                                                 └────────────┬─────────────┘
                                                              │ writes
                                                              ▼
                                                   ┌────────────────────┐
                                                   │  InfluxDB 2.x      │
                                                   │  case_sensor_data  │
                                                   └─────────┬──────────┘
                                                             │ Flux query
                                                             ▼
                                                   ┌────────────────────┐
                                                   │  Frontend (Vite +  │
                                                   │  React + Three.js) │
                                                   │  charts + 3D twin  │
                                                   └────────────────────┘
```

## Stack

| Layer | Technologies |
|---|---|
| Hardware | Silicon Labs Thunderboard (BRD4160A); BLE 4.2 GATT |
| Gateway | Python 3.11, FastAPI, Uvicorn, `bleak`, `influxdb-client`, pydantic-settings, httpx |
| Storage | InfluxDB 2.7 (Docker) |
| Frontend | React 18, TypeScript, Vite, `three`, `@react-three/fiber`, `@react-three/drei`, `recharts`, axios |
| LLM | Anthropic Claude API · Ollama / Gemma (local) |
| Firmware | C, Silicon Labs Simplicity Studio (stubbed — using stock demo firmware) |

## Status

| Stage | Goal | Status |
|---|---|---|
| 1 — Data Collection | BLE → Gateway → InfluxDB | ✅ Done |
| 2 — Visualization | Charts + 3D model | ✅ Done (named-mesh color overlay pending Blender re-export) |
| 3 — Diagnostics | LLM analysis endpoint | 🚧 Wired, not yet tested with a key |

See [`CHECKPOINT.md`](CHECKPOINT.md) for the iterative development journal
and [`docs/SPEC.md`](docs/SPEC.md) for the original project specification.

## Repo layout

```
firmware/   Custom firmware scaffold (C, Simplicity Studio — not yet flashed)
gateway/    Python FastAPI service: BLE → Influx + REST API
frontend/   React + Vite + Three.js dashboard
infra/      docker-compose for InfluxDB
docs/       Project spec, BLE protocol, sensor placement, results
```

## Quick start

Prereqs: Docker Desktop, Python 3.11+, Node 18+, a BLE-capable PC, a
Silicon Labs Thunderboard within ~5 m.

```powershell
# 1. InfluxDB
cd infra
docker compose up -d
# UI at http://localhost:8086 — log in (admin / adminpassword),
# copy the admin API token.

# 2. Gateway
cd ..\gateway
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# Edit .env: paste INFLUXDB_TOKEN, optionally BLE_DEVICE_ADDRESS
python main.py
# API at http://localhost:8000/docs

# 3. Frontend
cd ..\frontend
npm install
npm run dev
# Open http://localhost:5173
```

`gateway/ble_scan.py` lists nearby BLE devices.
`gateway/ble_probe.py <MAC>` dumps the GATT tree of a target device — useful
when adapting to different firmware.

## License

MIT — see [LICENSE](LICENSE).

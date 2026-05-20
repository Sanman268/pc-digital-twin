# Stage 3 — LLM Diagnostics Chat Agent

**Status:** shipped at `v0.3.2`
**Branch / tag:** `LLM_Llama3.18b` → tag `v0.3.2`

This checkpoint documents what landed in Stage 3 so we have a stable
reference before iterating toward a deeper LLM for FM (facility / asset
management) use cases.

---

## 1. What shipped

A conversational diagnostics agent reachable at `POST /api/chat` and
embedded in the dashboard as a popup inside the 3D viewer.

```
user ──► gateway /api/chat ──► [planner] ──► tools ──► InfluxDB
                                  │              │
                                  ▼              ▼
                              llama3.1:8b    sensor data
                                  │
                                  ▼
                             [narrator] ──► answer + tool_calls + data_points
```

- **Planner pass** — `temperature=0.1`, sees the system prompt and the
  three tools, decides whether to call one and with what arguments.
- **Tool execution** — Pydantic validates args, dispatches to one of
  the three Influx-backed tools, attaches result to history.
- **Narrator pass** — `temperature=0.2`, no tools, synthesises a 1–3
  sentence English answer from the tool result.
- **Retry loop** — `MAX_RETRIES=2` per chat call; recovers from invalid
  tool args or a model that emits inline JSON instead of a real tool
  call (see "salvage" below).

### Tools

| Tool | Purpose | Returns |
|---|---|---|
| `query_window(metric, window, aggregation)` | min/max/mean/std over a window | `value`, `unit`, and `time` for min/max |
| `find_anomalies(metric, window, threshold_sigma=2.5)` | σ-cutoff anomalies in a window | mean, stddev, anomaly count + list |
| `compare_windows(metric, window_a, window_b, aggregation)` | mean/max delta across two windows | `value_a`, `value_b`, `delta` |

Metric enum: `temperature`, `humidity`, `pressure`, `vibration`, `light`.
Window enum: `1h`, `6h`, `24h`, `7d`.

### Backend layout

```
gateway/
├── api/chat.py            # /api/chat endpoint + planner-retry-narrator loop
├── llm/
│   ├── prompts.py         # SYSTEM_PROMPT — front-loads "Always answer in English"
│   ├── tools.py           # OpenAI-format function definitions
│   ├── executor.py        # Pydantic validation + Flux queries + tz conversion
│   └── llama_client.py    # AsyncOpenAI client pointed at Ollama's /v1
└── models/chat.py         # ChatRequest, ChatResponse, ToolCallLog, DataPoint
```

### Frontend layout

- `frontend/src/components/chat/ChatPanel.tsx` — message bubbles,
  suggestion chips, expandable tool-call summary, 120s axios timeout.
- Embedded inside `PCTwinViewer` as a floating popup, toggled by the
  glassy bottom toolbar (Charts · Chat).

---

## 2. Configuration

Env vars (see `gateway/.env.example`):

| Key | Default | Notes |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://desktop-3dvru40:11434/v1` | OpenAI-compatible endpoint |
| `OLLAMA_MODEL` | `llama3.1:8b` | Must support tool calling |
| `LOCAL_TZ` | `Asia/Ho_Chi_Minh` | IANA tz — applied to tool-result timestamps |

Windows note: `tzdata` is in `requirements.txt` because Windows Python's
`zoneinfo` has no IANA database otherwise.

---

## 3. Known limitations (carry forward to Stage 4)

1. **8B model is fragile.** llama3.1:8b sometimes emits a tool call as
   inline JSON text instead of via the function-call channel. We
   salvage these in `chat.py:_extract_inline_calls`, but a 70B or a
   Claude-class model would not need that workaround.
2. **Language steering is positional.** "Always answer in English" only
   works when it's the **first** line of the system prompt; buried,
   the model defaults to whatever language the question hints at. Same
   class of model fragility.
3. **No persistent session memory.** Each `/api/chat` request is
   stateless; the frontend sends the last 10 turns as `history` but
   nothing is stored server-side. No conversation IDs, no recall.
4. **No multi-tool plans.** Each planner pass is single-shot — no
   chain-of-thought reasoning across multiple Influx queries (e.g. "is
   today hotter than the last 7 days *and* did vibration spike at the
   same time?").
5. **No asset / CMDB awareness.** Tools query a single asset
   (`PC_CASE_001`). Hard-coded — no concept of "which case" or "which
   sensor in which case".
6. **No alerting hooks.** Diagnostics are pull-only (user asks). The
   agent does not push insights when it would matter (e.g. sustained
   vibration spike for the last hour).
7. **No knowledge of historical incidents.** The model can describe
   *current* anomalies but has no record of past faults / RCAs to
   compare against.
8. **Tool result is JSON, not natural language.** The narrator has to
   re-interpret raw `{value, time, unit}` every turn. A richer pre-
   summary layer would let the planner reason about *patterns* not
   just samples.

---

## 4. Direction for Stage 4 — "Deeper FM LLM"

Sketch only — not committed work. Update this section when we pick up
the thread.

- **Model upgrade**: try `llama3.1:70b` or a hosted model (Claude
  Sonnet, GPT-4-class). Goal: drop the inline-JSON salvage, remove the
  positional-prompt fragility, enable multi-step planning.
- **CMDB / asset graph**: introduce a small SQLite or JSON asset
  catalogue (mirroring `frontend/src/components/twin3d/assetProperties.ts`)
  so the agent can answer "what's the warranty status of the front
  fan" alongside sensor questions.
- **Incident memory**: persist past Q&A turns and any flagged
  anomalies to a `chat_history` measurement in Influx (or a separate
  store). Add a `recall_incidents(metric, window)` tool.
- **Pre-summarisation**: add a periodic job that condenses the last 24h
  of sensor data into a short "state of the case" digest, then inject
  that digest into the system prompt. Cuts planner load and gives the
  narrator more to work with.
- **Push-mode**: a watchdog process that runs `find_anomalies` on a
  schedule and pings the chat with proactive observations.
- **Tool expansion**: `query_extreme` (returns both `min` and `max`
  with timestamps in one call), `correlate(metric_a, metric_b, window)`,
  `summarise(window)` (LLM-side natural-language summary of a window).
- **Multi-asset**: parametrise `node_id` / `asset_id` through the API
  so the same gateway can serve multiple monitored devices.

---

## 5. Reproducing the v0.3.2 setup

```powershell
# Backend
gateway\venv\Scripts\python.exe -m pip install -r gateway\requirements.txt
# (requires tzdata on Windows — already in requirements.txt)
gateway\venv\Scripts\python.exe gateway\main.py

# Ollama (on the model host)
ollama pull llama3.1:8b
ollama serve

# Frontend
cd frontend
npm install
npm run dev
```

`.env` must set `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, and `LOCAL_TZ`.

Smoke test from CLI:

```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"When was the case temperature highest tonight?"}'
```

Expected: an English answer of the form *"The case temperature was
highest tonight at HH:MM on Month Dth, reaching V °C."* with one
`query_window` call in `tool_calls`.

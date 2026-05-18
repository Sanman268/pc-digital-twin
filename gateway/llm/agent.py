import logging
from statistics import mean

import httpx

from config import get_settings
from influx.writer import query_history
from models.schemas import DiagnosticsResponse

log = logging.getLogger(__name__)

BASELINE_TEMP = 32.0
BASELINE_VIBRATION = 5.0

PROMPT_TEMPLATE = """You are an FM diagnostic assistant for a monitored PC case asset.

Asset: {asset_id}
Sensor location: inside case, near front panel

Recent data (last {range}):
- Average temperature : {avg_temp:.1f}C  (baseline: {baseline_temp}C)
- Peak temperature    : {max_temp:.1f}C
- Average humidity    : {avg_humidity:.1f}%
- Vibration RMS       : {avg_vibration:.2f} mg  (baseline: {baseline_vibration} mg)
- Case opening events : {open_events}
- BLE disconnections  : {disconnections}

Identify any anomalies, explain the likely cause, and provide
maintenance recommendations. Be concise.
"""


def _stats(field: str, range_: str) -> tuple[float, float]:
    pts = query_history(field=field, range_=range_)
    if not pts:
        return 0.0, 0.0
    values = [p["value"] for p in pts]
    return mean(values), max(values)


def _build_prompt(range_: str) -> str:
    s = get_settings()
    avg_temp, max_temp = _stats("temperature_c", range_)
    avg_humidity, _ = _stats("humidity_pct", range_)
    avg_vibration, _ = _stats("vibration_rms", range_)
    return PROMPT_TEMPLATE.format(
        asset_id=s.asset_id,
        range=range_,
        avg_temp=avg_temp,
        max_temp=max_temp,
        avg_humidity=avg_humidity,
        avg_vibration=avg_vibration,
        baseline_temp=BASELINE_TEMP,
        baseline_vibration=BASELINE_VIBRATION,
        open_events=0,
        disconnections=0,
    )


async def _call_claude(prompt: str) -> str:
    s = get_settings()
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": s.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-opus-4-7",
                "max_tokens": 800,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return "".join(b.get("text", "") for b in data.get("content", []))


async def _call_gemma(prompt: str) -> str:
    s = get_settings()
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            s.gemma_api_url,
            json={"model": "gemma:7b", "prompt": prompt, "stream": False},
        )
        resp.raise_for_status()
        return resp.json().get("response", "")


async def analyze(range_: str) -> DiagnosticsResponse:
    s = get_settings()
    prompt = _build_prompt(range_)
    try:
        if s.llm_provider == "gemma":
            text = await _call_gemma(prompt)
        else:
            text = await _call_claude(prompt)
    except Exception as e:
        log.exception("LLM call failed")
        return DiagnosticsResponse(summary=f"LLM call failed: {e}", issues=[], recommendations=[])
    return DiagnosticsResponse(summary=text.strip(), issues=[], recommendations=[])

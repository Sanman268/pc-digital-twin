import json
import logging
import time
from typing import Any

from fastapi import APIRouter

from llm.executor import TOOL_DISPATCH, execute_tool
from llm.llama_client import narrator_pass, planner_pass
from llm.prompts import SYSTEM_PROMPT
from llm.tools import TOOLS
from models.chat import ChatRequest, ChatResponse, DataPoint, ToolCallLog

log = logging.getLogger(__name__)

router = APIRouter()

MAX_RETRIES = 2
MAX_HISTORY = 10


def _initial_messages(req: ChatRequest) -> list[dict]:
    msgs: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in req.history[-MAX_HISTORY:]:
        msgs.append({"role": m.role, "content": m.content})
    msgs.append({"role": "user", "content": req.message})
    return msgs


_VALID_TOOL_NAMES = set(TOOL_DISPATCH.keys())


def _extract_inline_calls(content: str) -> list[tuple[str, dict]]:
    """Salvage tool calls that small models emit as inline text JSON like
    {"name": "query_window", "parameters": {...}} instead of via the
    function-call channel. Returns a list of (tool_name, args_dict).
    """
    if not content or "{" not in content:
        return []
    out: list[tuple[str, dict]] = []
    i = 0
    n = len(content)
    while i < n:
        if content[i] != "{":
            i += 1
            continue
        depth = 0
        end = -1
        for j in range(i, n):
            c = content[j]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    end = j
                    break
        if end == -1:
            break
        block = content[i : end + 1]
        try:
            obj = json.loads(block)
        except json.JSONDecodeError:
            i = end + 1
            continue
        if isinstance(obj, dict):
            name = obj.get("name")
            args = obj.get("parameters")
            if args is None:
                args = obj.get("arguments", {})
            if (
                isinstance(name, str)
                and name in _VALID_TOOL_NAMES
                and isinstance(args, dict)
            ):
                out.append((name, args))
        i = end + 1
    return out


def _extract_data_points(result: dict[str, Any] | None) -> list[DataPoint]:
    if not result:
        return []
    anomalies = result.get("anomalies") or []
    out: list[DataPoint] = []
    for p in anomalies:
        try:
            out.append(DataPoint(time=p["time"], value=float(p["value"])))
        except (KeyError, ValueError, TypeError):
            continue
    return out


@router.post("", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest) -> ChatResponse:
    t0 = time.perf_counter()
    messages = _initial_messages(req)
    tool_logs: list[ToolCallLog] = []
    data_points: list[DataPoint] = []

    retry_hint = (
        " Retry the tool via the function-calling channel "
        "(do NOT write JSON into text content)."
    )

    for attempt in range(MAX_RETRIES + 1):
        planner_resp = await planner_pass(messages, TOOLS)
        msg = planner_resp.choices[0].message

        # Normalize: prefer the real tool_calls channel; fall back to scanning
        # text content for inline JSON tool calls that small models emit when
        # they get confused.
        calls: list[tuple[str, str, str]] = []  # (id, name, arguments_json)
        if msg.tool_calls:
            for tc in msg.tool_calls:
                calls.append((tc.id, tc.function.name, tc.function.arguments or "{}"))
        else:
            inline = _extract_inline_calls(msg.content or "")
            for idx, (name, args) in enumerate(inline):
                calls.append((f"inline_{attempt}_{idx}", name, json.dumps(args)))
            if inline:
                log.info(
                    "Salvaged %d inline tool call(s) from text content", len(inline)
                )

        if not calls:
            answer = (msg.content or "").strip()
            return ChatResponse(
                answer=answer,
                tool_calls=tool_logs,
                data_points=data_points,
                latency_ms=int((time.perf_counter() - t0) * 1000),
            )

        # Keep the assistant content only if the real channel was used; otherwise
        # drop it so the salvaged JSON does not pollute history.
        assistant_content = msg.content or "" if msg.tool_calls else ""
        messages.append(
            {
                "role": "assistant",
                "content": assistant_content,
                "tool_calls": [
                    {
                        "id": cid,
                        "type": "function",
                        "function": {"name": name, "arguments": args},
                    }
                    for cid, name, args in calls
                ],
            }
        )

        any_error = False
        for cid, name, args_str in calls:
            try:
                raw_args = json.loads(args_str or "{}")
            except json.JSONDecodeError as e:
                err = f"Invalid JSON arguments: {e}"
                tool_logs.append(ToolCallLog(name=name, arguments={}, error=err))
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": cid,
                        "content": f"Error: {err}.{retry_hint}",
                    }
                )
                any_error = True
                continue

            result, error = execute_tool(name, raw_args)
            tool_logs.append(
                ToolCallLog(name=name, arguments=raw_args, result=result, error=error)
            )

            if error:
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": cid,
                        "content": f"Error: {error}.{retry_hint}",
                    }
                )
                any_error = True
                continue

            data_points.extend(_extract_data_points(result))
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": cid,
                    "content": json.dumps(result, default=str, ensure_ascii=False),
                }
            )

        if not any_error:
            break

    narrator_resp = await narrator_pass(messages)
    answer = (narrator_resp.choices[0].message.content or "").strip()

    return ChatResponse(
        answer=answer,
        tool_calls=tool_logs,
        data_points=data_points,
        latency_ms=int((time.perf_counter() - t0) * 1000),
    )

from functools import lru_cache

from openai import AsyncOpenAI

from config import get_settings


@lru_cache
def _client() -> AsyncOpenAI:
    s = get_settings()
    return AsyncOpenAI(
        base_url=s.ollama_base_url,
        api_key="ollama",  # SDK requires non-empty; Ollama ignores it
    )


async def planner_pass(messages: list[dict], tools: list[dict]):
    s = get_settings()
    return await _client().chat.completions.create(
        model=s.ollama_model,
        messages=messages,
        tools=tools,
        tool_choice="auto",
        temperature=0.1,
        max_tokens=512,
    )


async def narrator_pass(messages: list[dict]):
    s = get_settings()
    return await _client().chat.completions.create(
        model=s.ollama_model,
        messages=messages,
        temperature=0.6,
        max_tokens=300,
    )

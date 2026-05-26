"""SYSTEM_PROMPT content guards.

These are not prompt-quality tests — the prompt's *content* is judged by
the chat agent's behaviour in manual testing. What this file guards
against is *accidental deletion*: if someone trims the prompt and removes
the forecasting guidance the agent will silently stop calling the
predictive tools, which is hard to spot. A few cheap assertions catch
that regression at CI time.
"""

from llm.executor import TOOL_DISPATCH
from llm.prompts import SYSTEM_PROMPT


# Forecasting tools added in Stage 4 phases 1 / 2 / 5. The prompt has to
# at least name them so the planner has a hint about when to use them.
FORECAST_TOOLS = ("forecast_window", "time_to_threshold", "forecast_accuracy")


def test_system_prompt_mentions_each_forecast_tool():
    missing = [name for name in FORECAST_TOOLS if name not in SYSTEM_PROMPT]
    assert not missing, (
        f"SYSTEM_PROMPT no longer mentions these forecasting tools by name: {missing}"
    )


def test_forecast_tools_are_registered_in_dispatch():
    """Lock-step with the prompt: if the prompt names a tool, that tool
    must still exist in TOOL_DISPATCH."""
    missing = [name for name in FORECAST_TOOLS if name not in TOOL_DISPATCH]
    assert not missing, (
        f"Prompt mentions tools that are no longer dispatched: {missing}"
    )


def test_system_prompt_carries_insufficient_data_guidance():
    """Narrator must be told not to fabricate when a forecast tool refuses."""
    assert "ok=false" in SYSTEM_PROMPT.lower() or "ok=False" in SYSTEM_PROMPT, (
        "SYSTEM_PROMPT no longer warns the narrator about ok=false results; "
        "without this the agent will invent ETAs from refused forecasts."
    )


def test_system_prompt_covers_each_supported_horizon():
    """The horizon vocabulary section should map natural language to each
    supported horizon literal so the planner picks a valid value."""
    from llm.executor import HORIZON_TO_TIMEDELTA

    missing = [h for h in HORIZON_TO_TIMEDELTA if h not in SYSTEM_PROMPT]
    assert not missing, f"SYSTEM_PROMPT no longer mentions these horizons: {missing}"


def test_forecast_accuracy_narration_quotes_parameters():
    """The narrator must quote n_anchors / history_window / horizon
    alongside MAE/RMSE so the user can tell whether two accuracy
    figures (e.g. README vs live chat) are actually comparable."""
    required = ("n_anchors", "history_window", "horizon")
    missing = [t for t in required if t not in SYSTEM_PROMPT]
    assert not missing, (
        "SYSTEM_PROMPT no longer instructs the narrator to quote "
        f"{missing} alongside MAE/RMSE; without it users can't tell "
        "whether two accuracy numbers are directly comparable."
    )

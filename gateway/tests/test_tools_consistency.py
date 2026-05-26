"""Schema-vs-Pydantic consistency for the LLM tool layer.

Each tool exposes a JSON schema to the model (``llm/tools.py::TOOLS``) and a
matching Pydantic params class to validate the model's reply
(``llm/executor.py::TOOL_DISPATCH``). The enums in the JSON schema and the
``Literal`` values in the Pydantic class must agree — if they drift, the model
will see one set of allowed strings while the validator enforces a different
set, and we get a confusing tool-call rejection at runtime.

This is a pure structural test — no InfluxDB, no Ollama.
"""

from typing import Literal, get_args, get_origin

from llm.executor import TOOL_DISPATCH
from llm.tools import TOOLS


def _tool_by_name() -> dict[str, dict]:
    return {t["function"]["name"]: t for t in TOOLS}


def test_every_dispatched_tool_has_a_schema():
    schemas = _tool_by_name()
    missing = [name for name in TOOL_DISPATCH if name not in schemas]
    assert not missing, f"tools missing from TOOLS list: {missing}"


def test_every_schema_has_a_dispatch_entry():
    schemas = _tool_by_name()
    missing = [name for name in schemas if name not in TOOL_DISPATCH]
    assert not missing, f"tools missing from TOOL_DISPATCH: {missing}"


def test_literal_fields_match_json_enums():
    """For every Pydantic field typed as ``Literal[...]``, the corresponding
    JSON-schema ``enum`` must list the same values in the same order."""
    schemas = _tool_by_name()
    mismatches: list[str] = []

    for name, (schema_cls, _) in TOOL_DISPATCH.items():
        json_props = schemas[name]["function"]["parameters"]["properties"]
        for field_name, field_info in schema_cls.model_fields.items():
            ann = field_info.annotation
            if get_origin(ann) is not Literal:
                continue
            literal_values = list(get_args(ann))
            json_enum = json_props.get(field_name, {}).get("enum")
            if json_enum != literal_values:
                mismatches.append(
                    f"{name}.{field_name}: Literal={literal_values} "
                    f"JSON enum={json_enum}"
                )

    assert not mismatches, "schema/Literal drift:\n  " + "\n  ".join(mismatches)


def test_required_fields_cover_every_required_pydantic_field():
    """Anything without a default in Pydantic must be ``required`` in the JSON
    schema, otherwise the model can omit it and the validator will raise."""
    schemas = _tool_by_name()
    mismatches: list[str] = []

    for name, (schema_cls, _) in TOOL_DISPATCH.items():
        params = schemas[name]["function"]["parameters"]
        required = set(params.get("required", []))
        for field_name, field_info in schema_cls.model_fields.items():
            if field_info.is_required() and field_name not in required:
                mismatches.append(
                    f"{name}.{field_name} required in Pydantic but not JSON schema"
                )

    assert not mismatches, "required-field drift:\n  " + "\n  ".join(mismatches)


def test_forecast_window_specific_enums():
    """Explicit check for the Phase 1 tool, on top of the generic checks."""
    schemas = _tool_by_name()
    assert "forecast_window" in schemas
    props = schemas["forecast_window"]["function"]["parameters"]["properties"]
    assert props["metric"]["enum"] == [
        "temperature",
        "humidity",
        "pressure",
        "vibration",
        "light",
    ]
    assert props["history_window"]["enum"] == ["1h", "6h", "24h", "7d"]
    assert props["horizon"]["enum"] == ["15m", "1h", "6h"]


def test_time_to_threshold_specific_enums():
    """Explicit check for the Phase 2 tool, on top of the generic checks."""
    schemas = _tool_by_name()
    assert "time_to_threshold" in schemas
    params = schemas["time_to_threshold"]["function"]["parameters"]
    props = params["properties"]
    assert props["metric"]["enum"] == [
        "temperature",
        "humidity",
        "pressure",
        "vibration",
        "light",
    ]
    assert props["history_window"]["enum"] == ["1h", "6h", "24h", "7d"]
    assert props["direction"]["enum"] == ["above", "below"]
    # threshold is a number, not an enum — but must still be required.
    assert props["threshold"]["type"] == "number"
    assert set(params["required"]) == {
        "metric",
        "history_window",
        "threshold",
        "direction",
    }


def test_forecast_accuracy_specific_enums():
    """Explicit check for the Phase 5 tool, on top of the generic checks."""
    schemas = _tool_by_name()
    assert "forecast_accuracy" in schemas
    props = schemas["forecast_accuracy"]["function"]["parameters"]["properties"]
    assert props["metric"]["enum"] == [
        "temperature",
        "humidity",
        "pressure",
        "vibration",
        "light",
    ]
    assert props["history_window"]["enum"] == ["1h", "6h", "24h", "7d"]
    assert props["horizon"]["enum"] == ["15m", "1h", "6h"]

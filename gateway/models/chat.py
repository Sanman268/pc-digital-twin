from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    history: list[ChatMessage] = []


class DataPoint(BaseModel):
    time: datetime
    value: float


class ToolCallLog(BaseModel):
    name: str
    arguments: dict[str, Any] = {}
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    tool_calls: list[ToolCallLog] = []
    data_points: list[DataPoint] = []
    latency_ms: int

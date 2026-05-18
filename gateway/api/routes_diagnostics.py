from fastapi import APIRouter

from models.schemas import DiagnosticsRequest, DiagnosticsResponse
from llm.agent import analyze

router = APIRouter()


@router.post("/analyze", response_model=DiagnosticsResponse)
async def analyze_endpoint(req: DiagnosticsRequest):
    return await analyze(req.range)

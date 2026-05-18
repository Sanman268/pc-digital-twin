from fastapi import APIRouter

from config import get_settings
from ble.scanner import get_status

router = APIRouter()


@router.get("/gateway")
def gateway_status():
    connected, last_seen = get_status()
    s = get_settings()
    return {
        "connected": connected,
        "last_seen": last_seen.isoformat() if last_seen else None,
        "node_id": s.node_id,
    }

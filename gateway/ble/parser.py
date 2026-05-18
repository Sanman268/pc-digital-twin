import json
import logging
import math
from typing import Optional

from models.schemas import SensorReading

log = logging.getLogger(__name__)


def parse_payload(payload: bytes, *, node_id: str, asset_id: str) -> Optional[SensorReading]:
    try:
        raw = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        log.warning("Unparseable BLE payload (%d bytes)", len(payload))
        return None

    vx, vy, vz = float(raw.get("vx", 0)), float(raw.get("vy", 0)), float(raw.get("vz", 0))
    vibration_rms = math.sqrt(vx * vx + vy * vy + vz * vz)

    return SensorReading(
        temperature_c=float(raw.get("t", 0.0)),
        humidity_pct=float(raw.get("h", 0.0)),
        pressure_hpa=float(raw.get("p", 0.0)),
        light_lux=float(raw.get("l", 0.0)),
        air_quality_index=int(raw.get("aq", 0)),
        co2_ppm=int(raw.get("co2", 0)),
        vibration_rms=vibration_rms,
        accel_x=vx,
        accel_y=vy,
        accel_z=vz,
        node_id=node_id,
        asset_id=asset_id,
    )

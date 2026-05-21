from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class SensorReading(BaseModel):
    temperature_c: float
    humidity_pct: float
    pressure_hpa: float
    light_lux: float
    air_quality_index: int
    co2_ppm: int
    vibration_rms: float
    accel_x: float
    accel_y: float
    accel_z: float
    rssi: Optional[int] = None
    node_id: str
    asset_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class BootEvent(BaseModel):
    boot_counter: int
    firmware_version: str
    power_source: str = "usb"
    node_id: str
    asset_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class GatewayStatus(BaseModel):
    connected: bool
    last_seen: Optional[datetime] = None
    node_id: str


class HistoryPoint(BaseModel):
    time: datetime
    value: float

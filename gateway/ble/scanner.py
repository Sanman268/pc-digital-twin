"""BLE scanner for the Silicon Labs Thunderboard (Sense / Sense 2) demo firmware.

Reads the standard SIG Environmental Sensing service (0x181A) by polling, and
subscribes to the SiLabs custom Acceleration notify characteristic.

If you flash custom firmware later that speaks the JSON-over-notify protocol
from `firmware/src/ble_service.c`, swap this file for the JSON-parser version
(kept in `parser.py`).
"""

from __future__ import annotations

import asyncio
import logging
import math
import struct
from datetime import datetime
from typing import Optional

from bleak import BleakClient, BleakScanner

from config import get_settings
from influx.writer import write_sensor_reading
from models.schemas import SensorReading

log = logging.getLogger(__name__)

# Standard Bluetooth SIG Environmental Sensing characteristics
UUID_TEMPERATURE = "00002a6e-0000-1000-8000-00805f9b34fb"  # sint16 LE, 0.01 C
UUID_HUMIDITY = "00002a6f-0000-1000-8000-00805f9b34fb"  # uint16 LE, 0.01 %
UUID_PRESSURE = "00002a6d-0000-1000-8000-00805f9b34fb"  # uint32 LE, 0.1 Pa
UUID_UV_INDEX = "00002a76-0000-1000-8000-00805f9b34fb"  # uint8

# Silicon Labs custom characteristic on the same service (Ambient Light)
UUID_AMBIENT_LIGHT = "c8546913-bfd9-45eb-8dde-9f8754f4a32e"  # uint32 LE, 0.01 lux

# Battery
UUID_BATTERY_LEVEL = "00002a19-0000-1000-8000-00805f9b34fb"  # uint8 %

# Silicon Labs Acceleration & Orientation service (notify-only)
UUID_ACCELERATION = "c4c1f6e2-4be5-11e5-885d-feff819cdc9f"  # 3x sint16 LE, mg


_last_seen: Optional[datetime] = None
_connected: bool = False
_accel_g: tuple[float, float, float] = (0.0, 0.0, 0.0)


def get_status() -> tuple[bool, Optional[datetime]]:
    return _connected, _last_seen


def _decode_accel_mg(data: bytes) -> tuple[float, float, float]:
    if len(data) < 6:
        return 0.0, 0.0, 0.0
    x, y, z = struct.unpack_from("<hhh", data, 0)
    return x / 1000.0, y / 1000.0, z / 1000.0


async def _on_accel_notify(_sender, data: bytearray) -> None:
    global _accel_g
    _accel_g = _decode_accel_mg(bytes(data))


async def _read_sensors(client: BleakClient) -> SensorReading:
    s = get_settings()

    t_raw = await client.read_gatt_char(UUID_TEMPERATURE)
    h_raw = await client.read_gatt_char(UUID_HUMIDITY)
    p_raw = await client.read_gatt_char(UUID_PRESSURE)

    temperature_c = struct.unpack("<h", t_raw)[0] / 100.0
    humidity_pct = struct.unpack("<H", h_raw)[0] / 100.0
    pressure_hpa = (struct.unpack("<I", p_raw)[0] / 10.0) / 100.0  # 0.1 Pa -> hPa

    light_lux = 0.0
    try:
        l_raw = await client.read_gatt_char(UUID_AMBIENT_LIGHT)
        light_lux = struct.unpack("<I", l_raw)[0] / 100.0
    except Exception:
        pass

    ax, ay, az = _accel_g
    vibration_rms_mg = math.sqrt(ax * ax + ay * ay + az * az) * 1000.0

    return SensorReading(
        temperature_c=temperature_c,
        humidity_pct=humidity_pct,
        pressure_hpa=pressure_hpa,
        light_lux=light_lux,
        air_quality_index=0,  # not present on Thunderboard Sense v1
        co2_ppm=0,  # not present on Thunderboard Sense v1
        vibration_rms=vibration_rms_mg,
        accel_x=ax,
        accel_y=ay,
        accel_z=az,
        node_id=s.node_id,
        asset_id=s.asset_id,
    )


async def _connect_and_poll(address: str) -> None:
    global _connected, _last_seen
    s = get_settings()
    async with BleakClient(address, timeout=20.0) as client:
        _connected = True
        log.info("Connected to %s (MTU=%s)", address, client.mtu_size)

        try:
            await client.start_notify(UUID_ACCELERATION, _on_accel_notify)
            log.info("Subscribed to acceleration notifications")
        except Exception as e:
            log.warning("Accel notify unavailable: %s", e)

        try:
            while client.is_connected:
                try:
                    reading = await _read_sensors(client)
                    _last_seen = datetime.utcnow()
                    await write_sensor_reading(reading)
                    log.debug(
                        "T=%.2fC H=%.2f%% P=%.1fhPa L=%.1flx |a|=%.0fmg",
                        reading.temperature_c,
                        reading.humidity_pct,
                        reading.pressure_hpa,
                        reading.light_lux,
                        reading.vibration_rms,
                    )
                except Exception as e:
                    log.warning("Sensor read failed: %s", e)
                await asyncio.sleep(s.ble_sample_interval)
        finally:
            _connected = False
            log.info("Disconnected from %s", address)


async def _discover_device(name_substr: str, timeout: float):
    devices = await BleakScanner.discover(timeout=timeout, return_adv=True)
    needle = name_substr.lower()
    for _addr, (dev, adv) in devices.items():
        n = dev.name or adv.local_name or ""
        if needle in n.lower():
            log.info(
                "Matched '%s' -> %s @ %s (RSSI %s)",
                name_substr,
                n,
                dev.address,
                adv.rssi,
            )
            return dev
    return None


async def run_ble_loop() -> None:
    s = get_settings()
    while True:
        try:
            if s.ble_device_address:
                address = s.ble_device_address
                log.info("Using fixed address %s", address)
            else:
                log.info("Scanning for '%s' ...", s.ble_device_name)
                dev = await _discover_device(s.ble_device_name, s.ble_scan_timeout)
                if dev is None:
                    log.warning(
                        "Device not found, retrying in %ss", s.ble_retry_interval
                    )
                    await asyncio.sleep(s.ble_retry_interval)
                    continue
                address = dev.address
            await _connect_and_poll(address)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.exception("BLE loop error: %s", e)
            await asyncio.sleep(s.ble_retry_interval)

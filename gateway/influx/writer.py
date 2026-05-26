import logging
from functools import lru_cache

from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import ASYNCHRONOUS

from config import get_settings
from models.schemas import SensorReading, BootEvent

log = logging.getLogger(__name__)


@lru_cache
def _client() -> InfluxDBClient:
    s = get_settings()
    return InfluxDBClient(
        url=s.influxdb_url, token=s.influxdb_token, org=s.influxdb_org
    )


def _write_api():
    return _client().write_api(write_options=ASYNCHRONOUS)


def query_api():
    return _client().query_api()


async def write_sensor_reading(r: SensorReading) -> None:
    s = get_settings()
    p = (
        Point("case_sensor_data")
        .tag("node_id", r.node_id)
        .tag("asset_id", r.asset_id)
        .field("temperature_c", float(r.temperature_c))
        .field("humidity_pct", float(r.humidity_pct))
        .field("pressure_hpa", float(r.pressure_hpa))
        .field("light_lux", float(r.light_lux))
        .field("air_quality_index", int(r.air_quality_index))
        .field("co2_ppm", int(r.co2_ppm))
        .field("vibration_rms", float(r.vibration_rms))
        .field("accel_x", float(r.accel_x))
        .field("accel_y", float(r.accel_y))
        .field("accel_z", float(r.accel_z))
        .time(r.timestamp, WritePrecision.NS)
    )
    if r.rssi is not None:
        p = p.field("rssi", int(r.rssi))
    _write_api().write(bucket=s.influxdb_bucket, org=s.influxdb_org, record=p)


async def write_boot_event(e: BootEvent) -> None:
    s = get_settings()
    p = (
        Point("case_boot_event")
        .tag("node_id", e.node_id)
        .tag("asset_id", e.asset_id)
        .field("boot_counter", int(e.boot_counter))
        .field("firmware_version", e.firmware_version)
        .field("power_source", e.power_source)
        .time(e.timestamp, WritePrecision.NS)
    )
    _write_api().write(bucket=s.influxdb_bucket, org=s.influxdb_org, record=p)


def query_history(field: str, range_: str = "1h") -> list[dict]:
    s = get_settings()
    flux = f'''
    from(bucket: "{s.influxdb_bucket}")
      |> range(start: -{range_})
      |> filter(fn: (r) => r._measurement == "case_sensor_data")
      |> filter(fn: (r) => r._field == "{field}")
      |> keep(columns: ["_time", "_value"])
    '''
    tables = query_api().query(flux, org=s.influxdb_org)
    return [
        {"time": rec.get_time(), "value": rec.get_value()}
        for table in tables
        for rec in table.records
    ]

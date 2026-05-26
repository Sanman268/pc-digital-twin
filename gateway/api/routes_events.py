from fastapi import APIRouter, Query

from config import get_settings
from influx.writer import query_api

router = APIRouter()


@router.get("/boot")
def boot_events(limit: int = Query(10, ge=1, le=500)):
    s = get_settings()
    flux = f'''
    from(bucket: "{s.influxdb_bucket}")
      |> range(start: -30d)
      |> filter(fn: (r) => r._measurement == "case_boot_event")
      |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
      |> sort(columns:["_time"], desc:true)
      |> limit(n:{limit})
    '''
    tables = query_api().query(flux, org=s.influxdb_org)
    out = []
    for table in tables:
        for rec in table.records:
            v = rec.values
            out.append(
                {
                    "time": rec.get_time(),
                    "boot_counter": v.get("boot_counter"),
                    "firmware_version": v.get("firmware_version"),
                    "power_source": v.get("power_source"),
                }
            )
    return out

from fastapi import APIRouter, Query

from influx.writer import query_history

router = APIRouter()


@router.get("/history")
def history(range: str = Query("1h"), field: str = Query("temperature_c")):
    return query_history(field=field, range_=range)


@router.get("/latest")
def latest():
    fields = [
        "temperature_c", "humidity_pct", "pressure_hpa", "light_lux",
        "air_quality_index", "co2_ppm", "vibration_rms",
    ]
    result: dict = {}
    for f in fields:
        points = query_history(field=f, range_="5m")
        if points:
            result[f] = points[-1]["value"]
    return result

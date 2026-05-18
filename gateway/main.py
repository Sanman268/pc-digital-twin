import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from api import routes_sensor, routes_events, routes_status, routes_diagnostics
from ble.scanner import run_ble_loop

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("gateway")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    log.info("Starting BLE scanner for %s", settings.ble_device_name)
    ble_task = asyncio.create_task(run_ble_loop())
    try:
        yield
    finally:
        ble_task.cancel()
        try:
            await ble_task
        except asyncio.CancelledError:
            pass


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="PC Digital Twin Gateway", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(routes_sensor.router, prefix="/api/sensor", tags=["sensor"])
    app.include_router(routes_events.router, prefix="/api/events", tags=["events"])
    app.include_router(routes_status.router, prefix="/api/status", tags=["status"])
    app.include_router(routes_diagnostics.router, prefix="/api/diagnostics", tags=["diagnostics"])
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    s = get_settings()
    uvicorn.run("main:app", host=s.api_host, port=s.api_port, reload=True)

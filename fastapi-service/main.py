from dotenv import load_dotenv
load_dotenv()  # must run before app.mqtt is imported (reads env vars at module level)

from app.config import validate_env
validate_env()  # fail fast on missing config before app.mqtt connects

import logging
import time

from fastapi import FastAPI, Request

from app.logging_config import configure_logging
from app.routers import fleet, ingest, oee, robots, system

configure_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title="AMR Integration API")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 1)
    logger.info(
        "request",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


app.include_router(robots.router)
app.include_router(fleet.router)
app.include_router(system.router)
app.include_router(oee.router)
app.include_router(ingest.router)

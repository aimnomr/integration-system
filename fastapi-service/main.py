from dotenv import load_dotenv
load_dotenv()  # must run before app.mqtt is imported (reads env vars at module level)

from app.config import validate_env
validate_env()  # fail fast on missing config before app.mqtt connects

import asyncio
import logging
import os
import time

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app import db
from app.auth import require_api_key
from app.logging_config import configure_logging
from app.ratelimit import rate_limit_middleware
from app.routers import fleet, ingest, locations, maps, oee, orders, robots, system

configure_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title="AMR Integration API")

# G18 — CORS for the browser frontend. Origins are read from CORS_ORIGINS
# (comma-separated). Default allows the Vite dev server on :5173.
_cors_origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# G11 — per-client rate limiting (opt-in via RATE_LIMIT_PER_MINUTE).
app.middleware("http")(rate_limit_middleware)


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


# G19 — telemetry retention. A background task prunes state_snapshots and
# connection_log older than TELEMETRY_RETENTION_DAYS (0 disables it). The
# interval is fixed; the window is the policy knob.
RETENTION_DAYS = int(os.getenv("TELEMETRY_RETENTION_DAYS", "30"))
_RETENTION_INTERVAL_S = 6 * 3600


async def _retention_loop():
    while True:
        try:
            deleted = await asyncio.to_thread(db.prune_telemetry, RETENTION_DAYS)
            logger.info("telemetry pruned", extra={"deleted": deleted})
        except db.DatabaseUnavailable:
            pass  # DB down — try again next cycle
        except Exception as exc:  # never let the loop die
            logger.warning("telemetry prune failed", extra={"error": str(exc)})
        await asyncio.sleep(_RETENTION_INTERVAL_S)


@app.on_event("startup")
async def _start_retention():
    if RETENTION_DAYS > 0:
        asyncio.create_task(_retention_loop())
        logger.info("telemetry retention enabled", extra={"days": RETENTION_DAYS})


# G10 — API-key auth guards the client-facing API. /ingest is left unguarded:
# it is the internal Node-RED → DB telemetry boundary (see app/auth.py).
_auth = [Depends(require_api_key)]
app.include_router(robots.router, dependencies=_auth)
app.include_router(fleet.router, dependencies=_auth)
app.include_router(system.router, dependencies=_auth)
app.include_router(oee.router, dependencies=_auth)
app.include_router(maps.router, dependencies=_auth)
app.include_router(locations.router, dependencies=_auth)
app.include_router(orders.router, dependencies=_auth)
app.include_router(ingest.router)

"""In-memory rate limiting (G11).

A fixed-list sliding-window limiter on the FastAPI gateway, per client IP. The
documented risk is robot command thrashing — a buggy client looping order/cancel
preempts the navigation stack — plus flooding the MQTT pipeline.

RATE_LIMIT_PER_MINUTE caps requests per client per 60 s window; set it to 0 to
disable the limiter. `/ingest/*` and the docs routes are exempt: `/ingest` is
internal, high-volume telemetry from Node-RED (not client commands), and the docs
routes are harmless to leave open.

In-memory means per-process: the counters reset on restart and are not shared
across replicas. That is sufficient for the FYP's single-instance gateway.
"""
import os
import time
from collections import defaultdict
from threading import Lock

from fastapi import Request
from fastapi.responses import JSONResponse

_WINDOW_S = 60.0
_EXEMPT_PREFIXES = ("/ingest", "/docs", "/redoc", "/openapi.json")

_lock = Lock()
_hits: dict[str, list[float]] = defaultdict(list)


def _limit() -> int:
    """Requests allowed per client per minute. Falls back to 120 on a bad value."""
    try:
        return int(os.getenv("RATE_LIMIT_PER_MINUTE", "120"))
    except ValueError:
        return 120


async def rate_limit_middleware(request: Request, call_next):
    limit = _limit()
    path = request.url.path
    if limit <= 0 or path.startswith(_EXEMPT_PREFIXES):
        return await call_next(request)

    client = request.client.host if request.client else "unknown"
    now = time.monotonic()
    cutoff = now - _WINDOW_S
    with _lock:
        hits = _hits[client]
        hits[:] = [t for t in hits if t > cutoff]
        if len(hits) >= limit:
            retry_after = int(_WINDOW_S - (now - hits[0])) + 1
            return JSONResponse(
                status_code=429,
                content={
                    "status": "error",
                    "message": f"Rate limit exceeded ({limit} requests/minute).",
                },
                headers={"Retry-After": str(retry_after)},
            )
        hits.append(now)
    return await call_next(request)

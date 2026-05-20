"""API-key authentication (G10).

Opt-in and disabled by default. If the API_KEY environment variable is unset the
dependency is a no-op — the API is open, which is the local-development default.
If API_KEY is set, every guarded request must carry a matching `X-API-Key` header
or it is rejected with 401.

Guarded: the client-facing command / query API (robots, oee, system, fleet).
Not guarded: `/ingest/*`. That router is the internal telemetry-persistence
boundary, called only by Node-RED on the same host (parallel to the command path);
it is exempt for the same reason it is exempt from rate limiting. See
docs/schema/REST_ENDPOINTS.md.

Internal caller note: when API_KEY is set, the ROS Bridge Service must also send
the key on its GET /fleet call — set API_KEY in ros-bridge-service/.env too.
"""
import os

from fastapi import Header, HTTPException, status


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """FastAPI dependency. No-op when API_KEY is unset; otherwise enforces the
    `X-API-Key` request header."""
    expected = os.getenv("API_KEY")
    if not expected:
        return  # authentication disabled — local-development default
    if x_api_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key (send it in the X-API-Key header).",
        )

"""Telemetry ingestion routes.

Node-RED subscribes the VDA5050 topics and POSTs each message here; this layer
writes it to PostgreSQL. Keeping the SQL in FastAPI's db module (rather than in
Node-RED) centralises persistence in one place.

The endpoints are typed with Pydantic models that pin the required top-level
keys (G20) — a malformed payload now returns a 422 naming the missing field
instead of an opaque 500. The variable-length VDA5050 arrays pass through via
`extra="allow"` (see app/schemas.py).
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import db
from ..db import DatabaseUnavailable
from ..schemas import (
    IngestCommand,
    IngestConnectionMessage,
    IngestOeeCycle,
    IngestStateMessage,
)

router = APIRouter(prefix="/ingest")


def _unavailable(exc: DatabaseUnavailable) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"status": "error", "message": f"Database unavailable: {exc}"},
    )


@router.post("/state")
def ingest_state(message: IngestStateMessage):
    try:
        db.insert_state(message.model_dump())
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}


@router.post("/connection")
def ingest_connection(message: IngestConnectionMessage):
    try:
        db.insert_connection(message.model_dump())
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}


@router.post("/command")
def ingest_command(body: IngestCommand):
    """Body: {"kind": "order" | "instantActions", "message": <VDA5050 message>}."""
    try:
        db.insert_command(body.kind, body.message.model_dump())
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}


@router.post("/oee-cycle")
def ingest_oee_cycle(cycle: IngestOeeCycle):
    try:
        db.insert_oee_cycle(cycle.model_dump())
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}

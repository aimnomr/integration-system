"""Telemetry ingestion routes.

Node-RED subscribes the VDA5050 topics and POSTs each message here; this layer
writes it to PostgreSQL. Keeping the SQL in FastAPI's db module (rather than in
Node-RED) centralises persistence in one place.

The endpoints are typed with Pydantic models that pin the required top-level
keys (G20) — a malformed payload now returns a 422 naming the missing field
instead of an opaque 500. The variable-length VDA5050 arrays pass through via
`extra="allow"` (see app/schemas.py).

Archived robots are rejected with 410 at ingest. Operators chose Option 2
("hard cutoff") for archive semantics, so even if a bridge is still publishing
for an archived serial, those messages do not reach the DB. The check is an
O(1) in-memory lookup against `registry._archived_serials`, so the hot path
stays fast.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from .. import db
from ..db import DatabaseUnavailable
from ..robots import registry
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


def _reject_if_archived(serial: str) -> None:
    """410 Gone if the serial is archived. Unknown serials are NOT rejected
    here — they're still persisted (an unknown-serial state message will fail
    later at the FK constraint, which is the existing behaviour). The check
    intentionally fires only for the soft-delete case."""
    if registry.is_archived(serial):
        raise HTTPException(
            status_code=410,
            detail=f"Robot '{serial}' is archived; ingest is rejected. "
                   "Restore the robot or stop its bridge service.",
        )


@router.post("/state")
def ingest_state(message: IngestStateMessage):
    _reject_if_archived(message.serialNumber)
    try:
        db.insert_state(message.model_dump())
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}


@router.post("/connection")
def ingest_connection(message: IngestConnectionMessage):
    _reject_if_archived(message.serialNumber)
    try:
        db.insert_connection(message.model_dump())
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}


@router.post("/command")
def ingest_command(body: IngestCommand):
    """Body: {"kind": "order" | "instantActions", "message": <VDA5050 message>}."""
    _reject_if_archived(body.message.serialNumber)
    try:
        db.insert_command(body.kind, body.message.model_dump())
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}


@router.post("/oee-cycle")
def ingest_oee_cycle(cycle: IngestOeeCycle):
    _reject_if_archived(cycle.serialNumber)
    try:
        db.insert_oee_cycle(cycle.model_dump())
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}

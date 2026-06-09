"""Telemetry ingestion routes (HTTP).

These endpoints are now a **secondary** path: in normal operation FastAPI ingests
telemetry by subscribing the MQTT topics directly (see app/mqtt.py +
app/ingest_service.py), so Node-RED no longer POSTs here. They are kept for manual
injection, the Node-RED Test Harness tab, and the Newman smoke suite.

The endpoints are typed with Pydantic models that pin the required top-level keys
(G20) — a malformed payload returns a 422 naming the missing field instead of an
opaque 500. The variable-length VDA5050 arrays pass through via `extra="allow"`
(see app/schemas.py). The actual persistence + archive-cutoff + OEE derivation all
live in app/ingest_service.py, shared with the MQTT path.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from ..db import DatabaseUnavailable
from ..ingest_service import (
    ArchivedRobot,
    persist_command,
    persist_connection,
    persist_oee_cycle,
    persist_state,
)
from ..schemas import (
    IngestCommand,
    IngestConnectionMessage,
    IngestOeeCycle,
    IngestStateMessage,
)

router = APIRouter(prefix="/ingest", tags=["ingest"])


def _unavailable(exc: DatabaseUnavailable) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"status": "error", "message": f"Database unavailable: {exc}"},
    )


def _archived(exc: ArchivedRobot) -> HTTPException:
    return HTTPException(
        status_code=410,
        detail=f"Robot '{exc}' is archived; ingest is rejected. "
               "Restore the robot or stop its bridge service.",
    )


@router.post("/state")
def ingest_state(message: IngestStateMessage):
    try:
        persist_state(message.model_dump())
    except ArchivedRobot as exc:
        raise _archived(exc)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}


@router.post("/connection")
def ingest_connection(message: IngestConnectionMessage):
    try:
        persist_connection(message.model_dump())
    except ArchivedRobot as exc:
        raise _archived(exc)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}


@router.post("/command")
def ingest_command(body: IngestCommand):
    """Body: {"kind": "order" | "instantActions", "message": <VDA5050 message>}."""
    try:
        persist_command(body.kind, body.message.model_dump())
    except ArchivedRobot as exc:
        raise _archived(exc)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}


@router.post("/oee-cycle")
def ingest_oee_cycle(cycle: IngestOeeCycle):
    try:
        persist_oee_cycle(cycle.model_dump())
    except ArchivedRobot as exc:
        raise _archived(exc)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}

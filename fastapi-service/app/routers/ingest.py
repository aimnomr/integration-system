"""Telemetry ingestion routes.

Node-RED subscribes the VDA5050 topics and POSTs each message here; this layer
writes it to PostgreSQL. Keeping the SQL in FastAPI's db module (rather than in
Node-RED) centralises persistence in one place. The endpoints accept the raw
VDA5050 messages — they are already validated upstream by Node-RED.
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import db
from ..db import DatabaseUnavailable

router = APIRouter(prefix="/ingest")


def _unavailable(exc: DatabaseUnavailable) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"status": "error", "message": f"Database unavailable: {exc}"},
    )


@router.post("/state")
def ingest_state(message: dict):
    try:
        db.insert_state(message)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}


@router.post("/connection")
def ingest_connection(message: dict):
    try:
        db.insert_connection(message)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}


@router.post("/command")
def ingest_command(body: dict):
    """Body: {"kind": "order" | "instantActions", "message": <VDA5050 message>}."""
    try:
        db.insert_command(body["kind"], body["message"])
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}


@router.post("/oee-cycle")
def ingest_oee_cycle(cycle: dict):
    try:
        db.insert_oee_cycle(cycle)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    return {"status": "ok"}

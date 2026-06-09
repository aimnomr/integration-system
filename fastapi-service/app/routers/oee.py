"""OEE routes — robot-scoped, PostgreSQL-backed.

OEE cycle data is derived by Node-RED from order-completion transitions in the
VDA5050 `state` stream and stored in oee_cycles.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from ..db import (
    DatabaseUnavailable,
    fetch_oee_availability,
    fetch_oee_cycles,
    fetch_oee_summary,
)
from ..robots import registry

router = APIRouter(prefix="/robots/{serial}/oee", tags=["oee"])


def _require_robot(serial: str) -> None:
    if not registry.exists(serial):
        raise HTTPException(status_code=404, detail=f"Robot '{serial}' not registered")


def _db_unavailable(exc: DatabaseUnavailable) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"status": "error", "message": f"Database unavailable: {exc}"},
    )


@router.get("/summary")
def get_oee_summary(serial: str):
    _require_robot(serial)
    try:
        return fetch_oee_summary(serial)
    except DatabaseUnavailable as exc:
        return _db_unavailable(exc)


@router.get("/cycles")
def get_oee_cycles(serial: str, limit: int = 50):
    _require_robot(serial)
    try:
        return {"cycles": fetch_oee_cycles(serial, limit)}
    except DatabaseUnavailable as exc:
        return _db_unavailable(exc)


@router.get("/availability")
def get_oee_availability(serial: str):
    _require_robot(serial)
    try:
        return fetch_oee_availability(serial)
    except DatabaseUnavailable as exc:
        return _db_unavailable(exc)

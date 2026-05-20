"""Maps CRUD — reference-data management (G15).

Per-row create / update / delete for the `maps` table, so editing maps no
longer means re-applying schema.sql (which drops every table and wipes
telemetry). A DELETE that would orphan robots / named locations is rejected
with 409 — the FK is never cascaded.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from .. import db
from ..db import DatabaseUnavailable, IntegrityConflict
from ..schemas import MapIn, MapUpdate

router = APIRouter(prefix="/maps")


def _unavailable(exc: DatabaseUnavailable) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"status": "error", "message": f"Database unavailable: {exc}"},
    )


@router.get("")
def list_maps():
    try:
        return {"maps": db.fetch_maps()}
    except DatabaseUnavailable as exc:
        return _unavailable(exc)


@router.get("/{map_id}")
def get_map(map_id: str):
    try:
        row = db.fetch_map(map_id)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Map '{map_id}' not found")
    return row


@router.post("", status_code=201)
def create_map(body: MapIn):
    try:
        return db.insert_map(body.map_id, body.label)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    except IntegrityConflict:
        raise HTTPException(
            status_code=409, detail=f"Map '{body.map_id}' already exists"
        )


@router.put("/{map_id}")
def update_map(map_id: str, body: MapUpdate):
    try:
        row = db.update_map(map_id, body.label)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Map '{map_id}' not found")
    return row


@router.delete("/{map_id}")
def delete_map(map_id: str):
    try:
        deleted = db.delete_map(map_id)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    except IntegrityConflict:
        raise HTTPException(
            status_code=409,
            detail=f"Map '{map_id}' is still referenced by robots or named locations",
        )
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Map '{map_id}' not found")
    return {"status": "ok", "deleted": map_id}

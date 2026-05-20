"""Named-locations CRUD — reference-data management (G15).

Per-row create / update / delete for the `named_locations` table. A location's
`map_id` must reference an existing map; the API checks this up front so a bad
reference returns a clear 422 rather than a raw FK error.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from .. import db
from ..db import DatabaseUnavailable, IntegrityConflict
from ..schemas import NamedLocationIn, NamedLocationUpdate

router = APIRouter(prefix="/locations")


def _unavailable(exc: DatabaseUnavailable) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"status": "error", "message": f"Database unavailable: {exc}"},
    )


def _require_map(map_id: str) -> None:
    if db.fetch_map(map_id) is None:
        raise HTTPException(
            status_code=422, detail=f"Map '{map_id}' does not exist"
        )


@router.get("")
def list_locations():
    try:
        return {"locations": list(db.fetch_named_locations().values())}
    except DatabaseUnavailable as exc:
        return _unavailable(exc)


@router.get("/{loc_id}")
def get_location(loc_id: int):
    try:
        row = db.fetch_named_location(loc_id)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Location {loc_id} not found")
    return row


@router.post("", status_code=201)
def create_location(body: NamedLocationIn):
    try:
        _require_map(body.map_id)
        return db.insert_named_location(
            body.id, body.map_id, body.label, body.x, body.y, body.theta
        )
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    except IntegrityConflict:
        raise HTTPException(
            status_code=409, detail=f"Location {body.id} already exists"
        )


@router.put("/{loc_id}")
def update_location(loc_id: int, body: NamedLocationUpdate):
    try:
        _require_map(body.map_id)
        row = db.update_named_location(
            loc_id, body.map_id, body.label, body.x, body.y, body.theta
        )
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Location {loc_id} not found")
    return row


@router.delete("/{loc_id}")
def delete_location(loc_id: int):
    try:
        deleted = db.delete_named_location(loc_id)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Location {loc_id} not found")
    return {"status": "ok", "deleted": loc_id}

"""Robot-scoped routes — the FMS gateway.

Replaces the former flat /amr/* routes. FastAPI publishes VDA5050 `order` and
`instantActions` directly to the per-robot MQTT topics.
"""
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from .. import db
from ..db import (
    DatabaseUnavailable,
    IntegrityConflict,
    fetch_latest_state,
    fetch_named_locations,
)
from ..mqtt import publish_instant_actions, publish_order
from ..robots import registry
from ..schemas import (
    InstantActionRequest,
    NamedOrderRequest,
    OrderRequest,
    RobotIn,
    RobotUpdate,
)
from ..vda5050 import build_instant_actions, build_order

router = APIRouter(prefix="/robots")


def _require_robot(serial: str) -> dict:
    robot = registry.get(serial)
    if robot is None:
        raise HTTPException(status_code=404, detail=f"Robot '{serial}' not registered")
    return robot


def _unavailable(exc: DatabaseUnavailable) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"status": "error", "message": f"Database unavailable: {exc}"},
    )


@router.get("")
def list_robots():
    return {"robots": registry.list()}


def _to_camel(row: dict) -> dict:
    """db.fetch_robot/insert/update return raw snake_case rows. The list
    endpoint (and the rest of the API) speak camelCase, so single-row
    responses must match. Mapped here at the router boundary so db.py stays
    SQL-shaped."""
    return {
        "serialNumber": row["serial_number"],
        "rosbridgeUrl": row["rosbridge_url"],
        "mapId":        row["map_id"],
    }


# --- Robot CRUD (G15) ---
#
# The DB is the single source of truth for the fleet; after any write the
# in-memory registry is reloaded so the change is visible without a restart.
# (The ROS Bridge still needs a restart to start/stop a robot's process — it
# instantiates one Robot per GET /fleet entry at boot.)

@router.get("/{serial}")
def get_robot(serial: str):
    try:
        row = db.fetch_robot(serial)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Robot '{serial}' not found")
    return _to_camel(row)


@router.post("", status_code=201)
def create_robot(body: RobotIn):
    try:
        if db.fetch_map(body.map_id) is None:
            raise HTTPException(
                status_code=422, detail=f"Map '{body.map_id}' does not exist"
            )
        row = db.insert_robot(body.serial_number, body.rosbridge_url, body.map_id)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    except IntegrityConflict:
        raise HTTPException(
            status_code=409, detail=f"Robot '{body.serial_number}' already exists"
        )
    registry.reload()
    return _to_camel(row)


@router.put("/{serial}")
def update_robot(serial: str, body: RobotUpdate):
    try:
        if db.fetch_map(body.map_id) is None:
            raise HTTPException(
                status_code=422, detail=f"Map '{body.map_id}' does not exist"
            )
        row = db.update_robot(serial, body.rosbridge_url, body.map_id)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Robot '{serial}' not found")
    registry.reload()
    return _to_camel(row)


@router.delete("/{serial}")
def delete_robot(serial: str):
    try:
        deleted = db.delete_robot(serial)
    except DatabaseUnavailable as exc:
        return _unavailable(exc)
    except IntegrityConflict:
        raise HTTPException(
            status_code=409,
            detail=f"Robot '{serial}' still has telemetry / order history",
        )
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Robot '{serial}' not found")
    registry.reload()
    return {"status": "ok", "deleted": serial}


# --- Orders ---

@router.post("/{serial}/order")
def submit_order(serial: str, req: OrderRequest):
    robot = _require_robot(serial)
    if not req.nodes:
        raise HTTPException(status_code=422, detail="Order must have at least one node")
    nodes = [{"x": n.x, "y": n.y, "theta": n.theta} for n in req.nodes]
    order = build_order(serial, nodes, robot["mapId"])
    publish_order(serial, order)
    return {"status": "ok", "orderId": order["orderId"], "nodeCount": len(nodes)}


@router.post("/{serial}/order/named")
def submit_named_order(serial: str, req: NamedOrderRequest):
    robot = _require_robot(serial)
    if not req.location_ids:
        raise HTTPException(status_code=422, detail="Order must have at least one location")
    try:
        locations = fetch_named_locations()
    except DatabaseUnavailable as exc:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "message": f"Database unavailable: {exc}"},
        )
    nodes = []
    for location_id in req.location_ids:
        location = locations.get(location_id)
        if location is None:
            raise HTTPException(status_code=404, detail=f"Location ID {location_id} not found")
        # named_locations.theta is already radians (map frame).
        nodes.append({
            "x": location["x"],
            "y": location["y"],
            "theta": location["theta"],
        })
    order = build_order(serial, nodes, robot["mapId"])
    publish_order(serial, order)
    return {"status": "ok", "orderId": order["orderId"], "nodeCount": len(nodes)}


# --- Instant actions (cancel / retry / skip) ---

@router.post("/{serial}/instant-actions")
def submit_instant_action(serial: str, req: InstantActionRequest):
    _require_robot(serial)
    action = {
        "actionId": str(uuid.uuid4()),
        "actionType": req.action_type,
        "blockingType": "HARD" if req.action_type == "cancelOrder" else "NONE",
        "actionParameters": [],
    }
    message = build_instant_actions(serial, [action])
    publish_instant_actions(serial, message)
    return {"status": "ok", "actionType": req.action_type, "actionId": action["actionId"]}


# --- State query (PostgreSQL-backed) ---

@router.get("/{serial}/state")
def get_robot_state(serial: str):
    _require_robot(serial)
    try:
        state = fetch_latest_state(serial)
    except DatabaseUnavailable as exc:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "message": f"Database unavailable: {exc}"},
        )
    if state is None:
        raise HTTPException(status_code=404, detail="No state recorded for this robot")
    return state

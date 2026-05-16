from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from ..mqtt import publish_raw, mqtt_client
from ..schemas import GoalRequest, NamedGoalRequest, WaypointsRequest
from ..data import NAMED_LOCATIONS

router = APIRouter(prefix="/amr")


def _db_unavailable() -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"status": "error", "message": "Database not yet integrated"}
    )


# --- Navigation commands ---

@router.post("/goal")
def send_goal(req: GoalRequest):
    publish_raw("goal", {"x": req.x, "y": req.y, "angle": req.angle.model_dump()})
    return {"status": "ok", "message": "Navigation goal sent"}


@router.post("/goal/named")
def send_named_goal(req: NamedGoalRequest):
    location = NAMED_LOCATIONS.get(req.location_id)
    if not location:
        raise HTTPException(status_code=404, detail=f"Location ID {req.location_id} not found")
    publish_raw("goal", {"x": location["x"], "y": location["y"], "angle": location["angle"]})
    return {"status": "ok", "location": location["label"], "message": "Named goal sent"}


@router.post("/waypoints/start")
def start_waypoints(req: WaypointsRequest):
    publish_raw("waypoints", {"waypoints": [w.model_dump() for w in req.waypoints]})
    return {"status": "ok", "waypoint_count": len(req.waypoints), "message": "Waypoint sequence started"}


@router.post("/waypoints/stop")
def stop_waypoints():
    publish_raw("cancel", {})
    return {"status": "ok", "message": "Waypoint sequence stopped"}


@router.post("/waypoints/retry")
def retry_waypoint():
    mqtt_client.publish("amr/cmd/waypoints/retry", "{}", qos=1)
    return {"status": "ok", "message": "Current waypoint retrying"}


@router.post("/waypoints/skip")
def skip_waypoint():
    mqtt_client.publish("amr/cmd/waypoints/skip", "{}", qos=1)
    return {"status": "ok", "message": "Current waypoint skipped"}


@router.post("/cancel")
def cancel_goal():
    publish_raw("cancel", {})
    return {"status": "ok", "message": "All goals cancelled"}


# --- State queries (require DB) ---

@router.get("/state")
def get_amr_state():
    return _db_unavailable()


@router.get("/health")
def get_amr_health():
    return _db_unavailable()


@router.get("/nav/status")
def get_nav_status():
    return _db_unavailable()

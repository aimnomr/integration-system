from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import paho.mqtt.client as mqtt
import json
import os
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AMR Integration API")

# --- MQTT ---
mqtt_client = mqtt.Client()
mqtt_client.connect(os.getenv("MQTT_BROKER"), int(os.getenv("MQTT_PORT")))
mqtt_client.loop_start()

# --- Named locations (hardcoded until DB is integrated) ---
NAMED_LOCATIONS: dict[int, dict] = {
    1: {"label": "Home",      "x": 0.0, "y": 0.0, "angle": {"x": 0.0, "y": 0.0, "z": 0.0}},
    2: {"label": "Station A", "x": 2.0, "y": 1.5, "angle": {"x": 0.0, "y": 0.0, "z": 0.0}},
    3: {"label": "Station B", "x": 4.0, "y": 0.0, "angle": {"x": 0.0, "y": 0.0, "z": 1.57}},
}

# =============================================================
# Schemas
# =============================================================

class Angle(BaseModel):
    x: float
    y: float
    z: float

class GoalRequest(BaseModel):
    x: float
    y: float
    angle: Angle

class NamedGoalRequest(BaseModel):
    location_id: int

class Waypoint(BaseModel):
    id: int
    label: str
    x: float
    y: float
    angle: Angle

class WaypointsRequest(BaseModel):
    waypoints: list[Waypoint]

class ConnectRequest(BaseModel):
    url: str

# =============================================================
# Helpers
# =============================================================

def publish_raw(command: str, payload: dict) -> None:
    msg = {"command": command, "payload": payload}
    mqtt_client.publish("amr/cmd/raw", json.dumps(msg), qos=2)

def db_unavailable() -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"status": "error", "message": "Database not yet integrated"}
    )

# =============================================================
# POST /amr  —  navigation commands
# =============================================================

@app.post("/amr/goal")
def send_goal(req: GoalRequest):
    payload = {"x": req.x, "y": req.y, "angle": req.angle.model_dump()}
    publish_raw("goal", payload)
    return {"status": "ok", "message": "Navigation goal sent"}


@app.post("/amr/goal/named")
def send_named_goal(req: NamedGoalRequest):
    location = NAMED_LOCATIONS.get(req.location_id)
    if not location:
        raise HTTPException(status_code=404, detail=f"Location ID {req.location_id} not found")
    publish_raw("goal", {"x": location["x"], "y": location["y"], "angle": location["angle"]})
    return {"status": "ok", "location": location["label"], "message": "Named goal sent"}


@app.post("/amr/waypoints/start")
def start_waypoints(req: WaypointsRequest):
    payload = {"waypoints": [w.model_dump() for w in req.waypoints]}
    publish_raw("waypoints", payload)
    return {"status": "ok", "waypoint_count": len(req.waypoints), "message": "Waypoint sequence started"}


@app.post("/amr/waypoints/stop")
def stop_waypoints():
    publish_raw("cancel", {})
    return {"status": "ok", "message": "Waypoint sequence stopped"}


@app.post("/amr/waypoints/retry")
def retry_waypoint():
    publish_raw("waypoints_retry", {})
    return {"status": "ok", "message": "Current waypoint retrying"}


@app.post("/amr/waypoints/skip")
def skip_waypoint():
    publish_raw("waypoints_skip", {})
    return {"status": "ok", "message": "Current waypoint skipped"}


@app.post("/amr/cancel")
def cancel_goal():
    publish_raw("cancel", {})
    return {"status": "ok", "message": "All goals cancelled"}

# =============================================================
# POST /system  —  connection management
# =============================================================

@app.post("/system/connect")
def system_connect(req: ConnectRequest):
    mqtt_client.publish("amr/system/connect", json.dumps({"url": req.url}), qos=1)
    return {"status": "ok", "url": req.url, "message": "Connect command sent to roslib"}


@app.post("/system/disconnect")
def system_disconnect():
    mqtt_client.publish("amr/system/disconnect", json.dumps({}), qos=1)
    return {"status": "ok", "message": "Disconnect command sent to roslib"}

# =============================================================
# GET /amr  —  requires DB (stubbed with 503)
# =============================================================

@app.get("/amr/state")
def get_amr_state():
    return db_unavailable()


@app.get("/amr/health")
def get_amr_health():
    return db_unavailable()


@app.get("/amr/nav/status")
def get_nav_status():
    return db_unavailable()

# =============================================================
# GET /oee  —  requires DB (stubbed with 503)
# =============================================================

@app.get("/oee/summary")
def get_oee_summary():
    return db_unavailable()


@app.get("/oee/cycles")
def get_oee_cycles():
    return db_unavailable()


@app.get("/oee/availability")
def get_oee_availability():
    return db_unavailable()

# =============================================================
# GET /system
# =============================================================

@app.get("/system/status")
def get_system_status():
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "mosquitto": {
            "status": "connected" if mqtt_client.is_connected() else "disconnected"
        },
        "roslib":   {"status": "unknown"},
        "node_red": {"status": "unknown"},
        "database": {"status": "unavailable"},
    }

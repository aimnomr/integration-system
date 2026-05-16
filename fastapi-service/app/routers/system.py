import json
from datetime import datetime, timezone

from fastapi import APIRouter

from ..mqtt import mqtt_client
from ..schemas import ConnectRequest

router = APIRouter(prefix="/system")


@router.post("/connect")
def system_connect(req: ConnectRequest):
    mqtt_client.publish("amr/system/connect", json.dumps({"url": req.url}), qos=1)
    return {"status": "ok", "url": req.url, "message": "Connect command sent to roslib"}


@router.post("/disconnect")
def system_disconnect():
    mqtt_client.publish("amr/system/disconnect", json.dumps({}), qos=1)
    return {"status": "ok", "message": "Disconnect command sent to roslib"}


@router.get("/status")
def get_system_status():
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "mosquitto": {"status": "connected" if mqtt_client.is_connected() else "disconnected"},
        "roslib":    {"status": "unknown"},
        "node_red":  {"status": "unknown"},
        "database":  {"status": "unavailable"},
    }

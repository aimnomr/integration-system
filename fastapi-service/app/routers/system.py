"""System status route.

The former /system/connect and /system/disconnect endpoints are removed — the
rosbridge URL is now fixed configuration (robots.config.json) and the ROS Bridge
Service auto-connects and auto-reconnects on its own.
"""
from datetime import datetime, timezone

from fastapi import APIRouter

from ..db import ping as db_ping
from ..mqtt import mqtt_client

router = APIRouter(prefix="/system")


@router.get("/status")
def get_system_status():
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "mosquitto": {
            "status": "connected" if mqtt_client.is_connected() else "disconnected"
        },
        "database": {
            "status": "connected" if db_ping() else "unavailable"
        },
        # roslib / Node-RED liveness is not directly observable from the gateway.
        "roslib": {"status": "unknown"},
        "node_red": {"status": "unknown"},
    }

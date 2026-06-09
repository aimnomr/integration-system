"""System status route.

The former /system/connect and /system/disconnect endpoints are removed — the
rosbridge URL now lives in the database (the `robots` table) and the ROS Bridge
Service auto-connects and auto-reconnects on its own.
"""
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone

from fastapi import APIRouter

from ..db import ping as db_ping
from ..mqtt import mqtt_client, roslib_status

router = APIRouter(prefix="/system", tags=["system"])

_NODE_RED_URL = os.getenv("NODE_RED_URL", "http://localhost:1880")


def _node_red_status() -> str:
    """Best-effort liveness — Node-RED publishes no VDA5050 topic, so probe its
    HTTP port. Any response (even non-2xx) means the process is up."""
    try:
        urllib.request.urlopen(_NODE_RED_URL, timeout=2).close()
        return "connected"
    except urllib.error.HTTPError:
        return "connected"  # server responded — alive, just not 2xx
    except OSError:
        return "disconnected"


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
        "roslib": {"status": roslib_status()},
        "node_red": {"status": _node_red_status()},
    }

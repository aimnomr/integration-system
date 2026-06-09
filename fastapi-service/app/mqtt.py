"""MQTT for the FMS gateway — publishing AND telemetry ingestion.

Publishes VDA5050 `order` and `instantActions` messages to the per-robot topic
hierarchy. The command-routing role formerly played by Node-RED is gone — FastAPI
publishes directly to amr/v2/{manufacturer}/{serial}/...

It also **subscribes the four telemetry topics** (`state`, `connection`, `order`,
`instantActions`) and persists each via `app/ingest_service.py`. This is what
makes Node-RED optional: persistence is triggered by FastAPI's own MQTT client,
so Node-RED can be a passive viewer or be switched off entirely without losing a
single row. The retained `connection` topic also feeds /system/status (rosbridge
liveness) via `_connection_states`. See docs/architecture.md.
"""
import json
import logging
import os

import paho.mqtt.client as mqtt

from . import ingest_service
from .db import DatabaseUnavailable
from .robots import registry
from .vda5050 import topic_for

logger = logging.getLogger(__name__)

_PREFIX = f"{registry.interface_name}/{registry.major_version}"
# (topic wildcard, QoS) for each telemetry stream FastAPI ingests. `connection`
# is QoS 1 + retained; the rest are QoS 0 to match the publishers.
_TELEMETRY_SUBSCRIPTIONS = [
    (f"{_PREFIX}/+/+/state", 0),
    (f"{_PREFIX}/+/+/connection", 1),
    (f"{_PREFIX}/+/+/order", 0),
    (f"{_PREFIX}/+/+/instantActions", 0),
]

# Latest VDA5050 `connection` state per robot, kept current from the retained topic.
_connection_states: dict[str, str] = {}


def _on_connect(client, userdata, flags, rc):
    # Re-subscribe on every (re)connect. `connection` is retained, so the broker
    # replays each robot's latest connection state immediately.
    for topic, qos in _TELEMETRY_SUBSCRIPTIONS:
        client.subscribe(topic, qos=qos)


def _on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload)
    except (ValueError, TypeError):
        return
    if not isinstance(payload, dict):
        return

    suffix = msg.topic.rsplit("/", 1)[-1]
    try:
        if suffix == "connection":
            serial = payload.get("serialNumber")
            state = payload.get("connectionState")
            if serial and state:
                _connection_states[serial] = state
            ingest_service.persist_connection(payload)
        elif suffix == "state":
            ingest_service.persist_state(payload)
        elif suffix == "order":
            ingest_service.persist_command("order", payload)
        elif suffix == "instantActions":
            ingest_service.persist_command("instantActions", payload)
    except ingest_service.ArchivedRobot:
        pass  # archived serial — refuse silently (hard-cutoff, mirrors HTTP 410)
    except DatabaseUnavailable:
        pass  # DB down — telemetry is best-effort, drop quietly (Node-RED parity)
    except Exception:  # never let one bad message kill the MQTT loop thread
        logger.exception("telemetry ingest failed", extra={"topic": msg.topic})


mqtt_client = mqtt.Client()
mqtt_client.on_connect = _on_connect
mqtt_client.on_message = _on_message
mqtt_client.connect(os.getenv("MQTT_BROKER"), int(os.getenv("MQTT_PORT")))
mqtt_client.loop_start()


def publish_order(serial: str, order: dict) -> None:
    mqtt_client.publish(topic_for(serial, "order"), json.dumps(order), qos=0)


def publish_instant_actions(serial: str, message: dict) -> None:
    mqtt_client.publish(topic_for(serial, "instantActions"), json.dumps(message), qos=0)


def roslib_status() -> str:
    """rosbridge liveness inferred from the robots' retained `connection` topics:
    'connected' if any robot reports ONLINE, 'disconnected' if states are known but
    none are online, 'unknown' if no connection message has been seen yet."""
    if not _connection_states:
        return "unknown"
    if any(state == "ONLINE" for state in _connection_states.values()):
        return "connected"
    return "disconnected"

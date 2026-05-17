"""MQTT publishing for the FMS gateway.

Publishes VDA5050 `order` and `instantActions` messages to the per-robot topic
hierarchy. The command-routing role formerly played by Node-RED is gone — FastAPI
publishes directly to amr/v2/{manufacturer}/{serial}/...

It also subscribes the retained `connection` topics so /system/status can report
rosbridge liveness without a direct connection to the robots.
"""
import json
import os

import paho.mqtt.client as mqtt

from .robots import registry
from .vda5050 import topic_for

_CONNECTION_WILDCARD = (
    f"{registry.interface_name}/{registry.major_version}/+/+/connection"
)

# Latest VDA5050 `connection` state per robot, kept current from the retained topic.
_connection_states: dict[str, str] = {}


def _on_connect(client, userdata, flags, rc):
    # Re-subscribe on every (re)connect. The topic is retained, so the broker
    # replays each robot's latest connection state immediately.
    client.subscribe(_CONNECTION_WILDCARD, qos=1)


def _on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload)
    except (ValueError, TypeError):
        return
    serial = payload.get("serialNumber")
    state = payload.get("connectionState")
    if serial and state:
        _connection_states[serial] = state


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

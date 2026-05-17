"""MQTT publishing for the FMS gateway.

Publishes VDA5050 `order` and `instantActions` messages to the per-robot topic
hierarchy. The command-routing role formerly played by Node-RED is gone — FastAPI
publishes directly to amr/v2/{manufacturer}/{serial}/...
"""
import json
import os

import paho.mqtt.client as mqtt

from .vda5050 import topic_for

mqtt_client = mqtt.Client()
mqtt_client.connect(os.getenv("MQTT_BROKER"), int(os.getenv("MQTT_PORT")))
mqtt_client.loop_start()


def publish_order(serial: str, order: dict) -> None:
    mqtt_client.publish(topic_for(serial, "order"), json.dumps(order), qos=0)


def publish_instant_actions(serial: str, message: dict) -> None:
    mqtt_client.publish(topic_for(serial, "instantActions"), json.dumps(message), qos=0)

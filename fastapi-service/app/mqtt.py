import os
import json
import paho.mqtt.client as mqtt

mqtt_client = mqtt.Client()
mqtt_client.connect(os.getenv("MQTT_BROKER"), int(os.getenv("MQTT_PORT")))
mqtt_client.loop_start()

def publish_raw(command: str, payload: dict) -> None:
    msg = {"command": command, "payload": payload}
    mqtt_client.publish("amr/cmd/raw", json.dumps(msg), qos=2)

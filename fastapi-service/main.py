from fastapi import FastAPI
from pydantic import BaseModel
import paho.mqtt.client as mqtt
import json
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# --- MQTT ---
mqtt_client = mqtt.Client()
mqtt_client.connect(os.getenv("MQTT_BROKER"), int(os.getenv("MQTT_PORT")))
mqtt_client.loop_start()

# --- Schema ---
class TeleopCommand(BaseModel):
    linear_x: float
    angular_z: float

# --- Endpoints ---
@app.post("/robot/teleop")
def teleop_robot(cmd: TeleopCommand):
    payload = {
                    "linear_x": cmd.linear_x,
            "angular_z": cmd.angular_z,
        "command": "teleop",
    }

    mqtt_client.publish("robot/cmd/raw", json.dumps(payload), qos=1)
    print(f"[FastAPI→MQTT] Published to robot/cmd/raw: {payload}")

    return { "status": "ok", "message": "Teleop command sent", "data": payload }
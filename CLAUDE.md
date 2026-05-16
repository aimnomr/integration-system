# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **AMR (Autonomous Mobile Robot) Integration System** — middleware that bridges a ROS-based mobile robot to external REST clients. It uses MQTT as the central messaging backbone across four services.

## Running the Services

Each service must be started independently. There is no docker-compose or unified launcher.

**Mosquitto MQTT Broker:**
```
mosquitto -c mosquitto/mosquitto.conf
```

**FastAPI Service** (Python 3.14, port 8000):
```
cd fastapi-service
venv\Scripts\activate       # Windows
pip install fastapi pydantic paho-mqtt python-dotenv uvicorn
uvicorn main:app --reload --port 8000
```

**ROS Bridge Service** (Node.js):
```
cd ros-bridge-service
npm install
node index.js
```

**Node-RED** (port 1880):
```
cd node-red
node-red --settings settings.js --userDir .
```

No test or lint commands are currently configured.

## Architecture

```
External Client (HTTP)
  → FastAPI (port 8000)
    → MQTT: amr/cmd/raw (QoS 2) → Mosquitto (port 1883)
      → Node-RED (port 1880): routes by command type
        → MQTT: amr/cmd/goal | amr/cmd/waypoints | amr/cmd/cancel (QoS 1)
          → ROS Bridge Service (Node.js)
            → roslib WebSocket (rosbridge, ws://localhost:9090)
              → ROS: /move_base_simple/goal | /move_base/cancel → Robot

Robot
  → ROS topic: /diff_controller/odom
    → ROS Bridge Service
      → MQTT: amr/state/odom (QoS 1) → Mosquitto
        → Node-RED (TODO: store to PostgreSQL)
          → PostgreSQL (not yet integrated)
```

**Key design points:**
- `amr/cmd/raw` is QoS 2 (exactly-once) — carries `{ "command": "...", "payload": {...} }`
- Node-RED's function node routes `amr/cmd/raw` to 5 typed output topics based on `command` field
- `amr/state/odom` is published on distance (>0.05 m) or heading (>5°) change, plus a 5 s heartbeat
- roslib.js manages waypoint sequencing in memory; retry/skip come in as `amr/cmd/waypoints/retry` and `amr/cmd/waypoints/skip`
- `POST /system/connect` and `/system/disconnect` publish to `amr/system/connect` / `amr/system/disconnect`, which roslib.js handles directly (not via Node-RED)

## Source of Truth

Contract definitions live in `schema/` — always update these when adding endpoints or topics:
- `schema/REST_ENDPOINTS.md` — 17 planned REST endpoints (only 1 implemented)
- `schema/MQTT_TOPICS.md` — 12 MQTT topics (4 inbound, 8 outbound)
- `schema/ROS_TOPICS.md` — 137 ROS topics exposed by the robot

Documentation format standards are in `convention/`.

## Implementation Status

**Working:**
- `POST /robot/teleop` → publishes to `robot/cmd/raw`
- Full ROS ↔ MQTT bridge (odometry out, cmd_vel in)
- MQTT message routing through Node-RED skeleton

**Not yet implemented:**
- `POST /robot/move`, `POST /robot/waypoint`, `POST /robot/cancel` — navigation commands
- `GET /system/status`, `GET /robot/state` — system/robot queries
- Node-RED validation logic (function node is empty)
- PostgreSQL integration for odometry storage
- Authentication, rate limiting, health checks, logging
- OEE metrics endpoints

## Environment Configuration

**`fastapi-service/.env`:**
```
MQTT_BROKER=localhost
MQTT_PORT=1883
```

**`ros-bridge-service/.env`:**
```
ROSBRIDGE_URL=ws://localhost:9090
MQTT_BROKER=mqtt://localhost:1883
```

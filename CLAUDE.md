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
- Node-RED's function node routes `amr/cmd/raw` to 3 typed output topics (`amr/cmd/goal`, `amr/cmd/waypoints`, `amr/cmd/cancel`) based on `command` field
- `amr/state/odom` is published on distance (>0.05 m) or heading (>5°) change, plus a 5 s heartbeat
- roslib.js manages waypoint sequencing in memory; retry/skip come in as `amr/cmd/waypoints/retry` and `amr/cmd/waypoints/skip`
- `POST /system/connect` and `/system/disconnect` publish to `amr/system/connect` / `amr/system/disconnect`, which roslib.js handles directly (not via Node-RED)

## Source of Truth

Contract definitions live in `schema/` — always update these when adding endpoints or topics:
- `schema/REST_ENDPOINTS.md` — 16 REST endpoints (9 implemented, 1 partial, 6 stubbed)
- `schema/MQTT_TOPICS.md` — 16 MQTT topics (8 inbound, 8 outbound)
- `schema/ROS_TOPICS.md` — 136 ROS topics exposed by the robot

Documentation format standards are in `convention/`.

## Implementation Status

**Working:**
- 9 POST endpoints — `/amr/goal`, `/amr/goal/named`, `/amr/waypoints/start`, `/amr/waypoints/stop`, `/amr/waypoints/retry`, `/amr/waypoints/skip`, `/amr/cancel`, `/system/connect`, `/system/disconnect`
- `GET /system/status` — partial (reports MQTT connectivity only)
- ROS ↔ MQTT bridge — publishes `amr/state/odom`; handles `goal` / `waypoints` / `cancel` / `waypoints/retry` / `waypoints/skip` and `system/connect` / `system/disconnect`; auto-reconnect to rosbridge
- Node-RED — validation + routing (`amr/cmd/raw` → `goal` / `waypoints` / `cancel`), plus state/health/oee handler tabs (debug output only, no DB writes yet)

**Not yet implemented:**
- Outbound bridge topics — `amr/state/pose`, `amr/state/nav/status`, `amr/state/nav/progress`, `amr/health/*`, `amr/oee/cycle` (Node-RED handlers exist, but the bridge does not publish them yet)
- Nav feedback loop — automatic waypoint advance on goal success/failure
- 6 stubbed GET endpoints — `/amr/state`, `/amr/health`, `/amr/nav/status`, `/oee/summary`, `/oee/cycles`, `/oee/availability` (return 503 pending DB)
- PostgreSQL integration for state/health/OEE storage
- Authentication, rate limiting, structured logging, tests, Docker

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
NAV_GOAL_TOPIC=/move_base_simple/goal
CANCEL_TOPIC=/move_base/cancel
```

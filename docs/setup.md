# Setup & Running

## TL;DR — just the commands

You already know the project and have prerequisites + `.env` files in place. Start
each service in its own terminal:

```bash
# 1. Mosquitto MQTT broker
mosquitto -c mosquitto/mosquitto.conf

# 2. FastAPI service  (http://localhost:8000, docs at /docs)
cd fastapi-service
venv\Scripts\activate
uvicorn main:app --reload --port 8000

# 3. ROS Bridge Service
cd ros-bridge-service
node index.js

# 4. Node-RED  (http://localhost:1880)
cd node-red
node-red --settings settings.js --userDir .
```

The robot's `rosbridge_server` must be reachable at the `ROSBRIDGE_URL` in
`ros-bridge-service/.env` (default `ws://localhost:9090`).

---

## Prerequisites

| Requirement | Used by | Notes |
|---|---|---|
| Python 3.14 | FastAPI service | `venv` already provided under `fastapi-service/venv/` |
| Node.js (LTS) | ROS Bridge Service, Node-RED | |
| Mosquitto | broker | install separately; run with the repo's config |
| Node-RED | Node-RED service | install globally (`npm i -g node-red`) or locally |
| ROS robot + `rosbridge_server` | — | external; exposes a WebSocket (default port 9090) |

There is **no** docker-compose or unified launcher — each service starts independently.
There are **no** test or lint commands configured.

---

## One-time setup

### 1. Environment files

Create these two files (not committed). See the env-var table below.

`fastapi-service/.env`:
```
MQTT_BROKER=localhost
MQTT_PORT=1883
```

`ros-bridge-service/.env`:
```
ROSBRIDGE_URL=ws://localhost:9090
MQTT_BROKER=mqtt://localhost:1883
NAV_GOAL_TOPIC=/move_base_simple/goal
CANCEL_TOPIC=/move_base/cancel
```

### 2. Python dependencies (FastAPI)

```bash
cd fastapi-service
venv\Scripts\activate
pip install fastapi pydantic paho-mqtt python-dotenv uvicorn
```

### 3. Node dependencies (ROS Bridge Service)

```bash
cd ros-bridge-service
npm install
```

---

## Environment variables

| Variable | Service | Default | Purpose |
|---|---|---|---|
| `MQTT_BROKER` | FastAPI | `localhost` | MQTT broker host |
| `MQTT_PORT` | FastAPI | `1883` | MQTT broker port |
| `ROSBRIDGE_URL` | ROS Bridge | `ws://localhost:9090` | rosbridge WebSocket URL |
| `MQTT_BROKER` | ROS Bridge | `mqtt://localhost:1883` | MQTT broker URL |
| `NAV_GOAL_TOPIC` | ROS Bridge | `/move_base_simple/goal` | ROS topic for navigation goals |
| `CANCEL_TOPIC` | ROS Bridge | `/move_base/cancel` | ROS topic for goal cancellation |
| `LOG_LEVEL` | ROS Bridge | `info` | Log verbosity — `debug` / `info` / `warn` / `error` (optional) |

---

## Start order

Mosquitto must be up first (all other services connect to it). FastAPI, ROS Bridge,
and Node-RED can then start in any order — they reconnect automatically.

## Verify it works

- FastAPI: open `http://localhost:8000/docs` — the Swagger UI lists all endpoints.
- Node-RED: open `http://localhost:1880` — the flow tabs should show "connected" on
  the MQTT nodes.
- ROS Bridge: the console logs a rosbridge connection message; once connected it
  begins publishing `amr/state/odom`.

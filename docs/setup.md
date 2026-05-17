# Setup & Running

## TL;DR — just the commands

You already know the project and have prerequisites + `.env` files in place. Start
each service in its own terminal:

```bash
# 1. Mosquitto MQTT broker
mosquitto -c mosquitto/mosquitto.conf

# 2. PostgreSQL  (must be running; see One-time setup to create the DB)

# 3. FastAPI service  (http://localhost:8000, docs at /docs)
cd fastapi-service
venv\Scripts\activate
uvicorn main:app --reload --port 8000

# 4. ROS Bridge Service
cd ros-bridge-service
node index.js

# 5. Node-RED  (http://localhost:1880)
cd node-red
node-red --settings settings.js --userDir .
```

The robot's `rosbridge_server` must be reachable at the `rosbridgeUrl` set in
`ros-bridge-service/robots.config.json` (default `ws://localhost:9090`).

> The system **degrades gracefully** without PostgreSQL — commands and telemetry still
> flow; only the DB-backed endpoints (`/robots/{serial}/state`, `/oee/*`, `/ingest/*`)
> return HTTP 503. For a quick command test you can skip step 2.

---

## Prerequisites

| Requirement | Used by | Notes |
|---|---|---|
| Python 3.11+ | FastAPI service | `venv` provided under `fastapi-service/venv/` |
| Node.js (LTS) | ROS Bridge Service, Node-RED | |
| Mosquitto | broker | install separately; run with the repo's config |
| Node-RED | Node-RED service | install globally (`npm i -g node-red`) or locally |
| PostgreSQL | persistence | install separately; create the DB (below) |
| ROS robot + `rosbridge_server` | — | external; exposes a WebSocket (default port 9090) |

There is **no** docker-compose or unified launcher — each service starts independently.
There are **no** test or lint commands configured.

---

## One-time setup

### 1. Environment files

Create these files (not committed). See the env-var table below.

`fastapi-service/.env`:
```
MQTT_BROKER=localhost
MQTT_PORT=1883
DB_HOST=localhost
DB_PORT=5432
DB_NAME=amr_integration
DB_USER=postgres
DB_PASSWORD=yourpassword
```

`ros-bridge-service/.env`:
```
MQTT_BROKER=mqtt://localhost:1883
NAV_GOAL_TOPIC=/move_base_simple/goal
CANCEL_TOPIC=/move_base/cancel
```

> The rosbridge URL is **not** an env var — it is set per robot in
> `ros-bridge-service/robots.config.json`.

### 2. Robot registry

`ros-bridge-service/robots.config.json` defines the fleet. The default has one robot
(`amr001`). Adding a robot is an edit to this file — no code change; see
`robots.config.example.json` for a two-robot example.

### 3. Python dependencies (FastAPI)

```bash
cd fastapi-service
venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Node dependencies (ROS Bridge Service)

```bash
cd ros-bridge-service
npm install
```

### 5. Database

```bash
psql -U postgres -c "CREATE DATABASE amr_integration;"
# apply the schema — copy the SQL block from docs/schema/DATABASE_SCHEMA.md into schema.sql
psql -U postgres -d amr_integration -f schema.sql
```

---

## Environment variables

| Variable | Service | Default | Purpose |
|---|---|---|---|
| `MQTT_BROKER` | FastAPI | `localhost` | MQTT broker host |
| `MQTT_PORT` | FastAPI | `1883` | MQTT broker port |
| `DB_HOST` | FastAPI | `localhost` | PostgreSQL host |
| `DB_PORT` | FastAPI | `5432` | PostgreSQL port |
| `DB_NAME` | FastAPI | `amr_integration` | PostgreSQL database name |
| `DB_USER` | FastAPI | `postgres` | PostgreSQL user |
| `DB_PASSWORD` | FastAPI | _(empty)_ | PostgreSQL password |
| `ROBOTS_CONFIG` | FastAPI | `../ros-bridge-service/robots.config.json` | Robot registry path |
| `MQTT_BROKER` | ROS Bridge | `mqtt://localhost:1883` | MQTT broker URL |
| `NAV_GOAL_TOPIC` | ROS Bridge | `/move_base_simple/goal` | ROS topic for navigation goals |
| `CANCEL_TOPIC` | ROS Bridge | `/move_base/cancel` | ROS topic for goal cancellation |
| `LOG_LEVEL` | ROS Bridge | `info` | Log verbosity — `debug`/`info`/`warn`/`error` (optional) |

---

## Start order

Mosquitto must be up first (all other services connect to it). PostgreSQL should be up
before FastAPI if you want persistence. FastAPI, ROS Bridge, and Node-RED can then
start in any order — they reconnect automatically.

> **Node-RED:** run it from the `node-red/` directory with `--userDir .` so it loads
> the project flows. Fully stop any Node-RED instance running against the default
> `~/.node-red` directory first, or it will overwrite `flows.json` on deploy.

## Verify it works

- FastAPI: open `http://localhost:8000/docs` — Swagger lists all robot-scoped endpoints.
  `GET /system/status` reports MQTT and database connectivity.
- ROS Bridge: the console logs a rosbridge connection per robot; once connected it
  publishes `amr/v2/moverobotic/amr001/state` and a retained `connection` message.
- Node-RED: open `http://localhost:1880` — MQTT nodes show "connected".
- End to end: `POST http://localhost:8000/robots/amr001/order` with
  `{"nodes":[{"x":1.0,"y":0.5,"theta":0.0}]}`, or use the Node-RED **Test Harness** tab.

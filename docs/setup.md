# Setup & Running

## TL;DR — just the commands

You already know the project and have prerequisites + `.env` files in place. Start
each service in its own terminal:

```bash
# 1. Mosquitto MQTT broker
mosquitto -c mosquitto/mosquitto.conf

# 2. PostgreSQL  (must be running — FastAPI loads the fleet from it at startup)

# 3. FastAPI service  (http://localhost:8000, docs at /docs)
cd fastapi-service
venv\Scripts\activate
uvicorn main:app --reload --port 8000

# 4. ROS Bridge Service  (fetches GET /fleet from FastAPI — start it AFTER FastAPI)
cd ros-bridge-service
node index.js

# 5. Node-RED  (http://localhost:1880)
cd node-red
node-red --settings settings.js --userDir .
```

The robot's `rosbridge_server` must be reachable at the `rosbridge_url` set for the
robot in the `robots` database table (default `ws://localhost:9090`).

> **PostgreSQL is required.** The database is the single source of truth for the fleet
> definition — FastAPI loads it at startup and will not start without it, and the ROS
> Bridge fetches the fleet from FastAPI's `GET /fleet`. So the start order matters:
> PostgreSQL → FastAPI → ROS Bridge.

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

Each service ships a committed `.env.example`. Copy it to `.env` and adjust — the
`.env` itself is not committed:

```bash
cp fastapi-service/.env.example   fastapi-service/.env
cp ros-bridge-service/.env.example ros-bridge-service/.env
```

Both services validate their required env vars at startup and fail fast with a clear
message if any are missing. See the env-var table below.

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
FLEET_API_URL=http://localhost:8000/fleet
NAV_GOAL_TOPIC=/move_base_simple/goal
CANCEL_TOPIC=/move_base/cancel
```

### 2. Robot registry

The fleet is defined in the **database** — `fleet_config` (fleet-wide identity) and
`robots` (one row per robot), seeded by `schema.sql` (step 5). FastAPI loads it at
startup; the ROS Bridge fetches it from FastAPI's `GET /fleet`. Adding a robot is a
database edit — no code change, no config file.

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
psql -U postgres -d amr_integration -f docs/schema/schema.sql
```

`docs/schema/schema.sql` creates all 15 tables and seeds `fleet_config`, `maps`,
`robots`, and `named_locations`. Re-running it resets the database.

---

## Environment variables

| Variable | Service | Default | Purpose |
|---|---|---|---|
| `MQTT_BROKER` | FastAPI | _(required)_ | MQTT broker host — validated at startup |
| `MQTT_PORT` | FastAPI | _(required)_ | MQTT broker port — validated at startup |
| `DB_HOST` | FastAPI | `localhost` | PostgreSQL host |
| `DB_PORT` | FastAPI | `5432` | PostgreSQL port |
| `DB_NAME` | FastAPI | `amr_integration` | PostgreSQL database name |
| `DB_USER` | FastAPI | `postgres` | PostgreSQL user |
| `DB_PASSWORD` | FastAPI | `admin` | PostgreSQL password |
| `NODE_RED_URL` | FastAPI | `http://localhost:1880` | Node-RED URL probed by `/system/status` |
| `MQTT_BROKER` | ROS Bridge | _(required)_ | MQTT broker URL — validated at startup |
| `FLEET_API_URL` | ROS Bridge | `http://localhost:8000/fleet` | FastAPI endpoint the fleet config is fetched from |
| `NAV_GOAL_TOPIC` | ROS Bridge | `/move_base_simple/goal` | ROS topic for navigation goals |
| `CANCEL_TOPIC` | ROS Bridge | `/move_base/cancel` | ROS topic for goal cancellation |
| `LOG_LEVEL` | ROS Bridge | `info` | Log verbosity — `debug`/`info`/`warn`/`error` (optional) |

---

## Start order

The order matters now that the database is the single source of truth:

1. **Mosquitto** — all other services connect to it.
2. **PostgreSQL** — must be up before FastAPI (FastAPI loads the fleet from it at
   startup and will not start otherwise).
3. **FastAPI** — serves `GET /fleet`.
4. **ROS Bridge** — fetches `GET /fleet` from FastAPI at startup; start it after FastAPI.
5. **Node-RED** — can start any time after Mosquitto.

MQTT and rosbridge connections reconnect automatically, but FastAPI→DB and
ROS Bridge→FastAPI are startup dependencies — not retried.

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

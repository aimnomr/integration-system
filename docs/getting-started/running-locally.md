# Running Locally (manual, non-Docker)

> **Who this is for:** developers working *on* the code who want hot-reload
> and direct access to each process. If you just want the system running, the
> Docker path in the [Quickstart](../user-guide/quickstart.md) is far less
> setup. (`start-all.ps1` in the repo root automates the start sequence below
> once one-time setup is done.)

## Prerequisites

| Requirement | Used by |
|---|---|
| Python 3.11+ | FastAPI service |
| Node.js (LTS) | ROS Bridge service, Node-RED, frontend |
| Mosquitto | the MQTT broker — install separately, run with the repo's config |
| PostgreSQL | persistence — install separately |
| Node-RED | optional — `npm i -g node-red` |
| ROS robot + `rosbridge_server` | external, optional — WebSocket on port 9090 |

## One-time setup

### 1. Database

```bash
psql -U postgres -c "CREATE DATABASE amr_integration;"
psql -U postgres -d amr_integration -f docs/schema/schema.sql
```

`schema.sql` creates all tables and seeds the fleet (demo robot `amr001`,
a map, named locations). Re-running it resets the database.

### 2. Environment files

Each service ships a committed `.env.example`. Copy and adjust; the real
`.env` is git-ignored:

```bash
cp fastapi-service/.env.example    fastapi-service/.env     # set DB_PASSWORD
cp ros-bridge-service/.env.example ros-bridge-service/.env
```

Both services validate required vars at startup and fail fast with a clear
message. The frontend's `.env.local` is optional — its defaults
(`http://localhost:8000`, `ws://localhost:9001`) suit local dev.

### 3. Dependencies

```bash
cd fastapi-service && venv\Scripts\activate && pip install -r requirements.txt
cd ros-bridge-service && npm install
cd node-red && npm install        # optional; pulls the postgresql palette node
cd frontend && npm install
```

## Start order (it matters)

The database is the single source of truth for the fleet: FastAPI loads it at
boot and won't start without it; the ROS Bridge fetches the fleet *from
FastAPI* at boot. MQTT and rosbridge connections auto-reconnect, but these
two startup dependencies are not retried.

```bash
# 1. Mosquitto — everything connects to it
mosquitto -c mosquitto/mosquitto.conf

# 2. PostgreSQL — must be up before FastAPI

# 3. FastAPI  (http://localhost:8000, Swagger at /docs)
cd fastapi-service
venv\Scripts\activate
uvicorn main:app --reload --port 8000

# 4. ROS Bridge — AFTER FastAPI (fetches GET /fleet at startup)
cd ros-bridge-service
node index.js

# 5. Node-RED — optional, anytime after Mosquitto  (http://localhost:1880)
cd node-red
node-red --settings settings.js --userDir .

# 6. Frontend — anytime  (http://localhost:5173)
cd frontend
npm run dev
```

> **Node-RED:** run it from `node-red/` with `--userDir .` so it loads the
> project flows — and fully stop any instance using the default `~/.node-red`
> first, or it will overwrite `flows.json` on deploy.

The robot's `rosbridge_server` should be reachable at the `rosbridge_url`
stored for it in the `robots` table (seed: `ws://localhost:9090`). Without a
robot everything still runs; robots just show offline.

## Key environment variables

The full set is documented in each service's `.env.example`. The ones that
matter most:

| Variable | Service | Default | Purpose |
|---|---|---|---|
| `MQTT_BROKER` / `MQTT_PORT` | FastAPI | _(required)_ | broker address |
| `DB_HOST` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | FastAPI | `localhost` / `amr_integration` / `postgres` / — | PostgreSQL connection |
| `API_KEY` | FastAPI, ROS Bridge, frontend | _(unset = open)_ | require `X-API-Key` on the REST API |
| `RATE_LIMIT_PER_MINUTE` | FastAPI | `120` | per-IP request cap (`0` disables) |
| `CORS_ORIGINS` | FastAPI | `http://localhost:5173` | allowed browser origins |
| `MQTT_BROKER` | ROS Bridge | _(required)_ | broker URL, e.g. `mqtt://localhost:1883` |
| `FLEET_API_URL` | ROS Bridge | `http://localhost:8000/fleet` | where the fleet definition comes from |
| `NAV_GOAL_TOPIC` / `CANCEL_TOPIC` | ROS Bridge | `/move_base_simple/goal` / `/move_base/cancel` | ROS topics for navigation |
| `LOG_LEVEL` | ROS Bridge | `info` | `debug`/`info`/`warn`/`error` |
| `VITE_API_URL` / `VITE_MQTT_WS_URL` | frontend | `http://localhost:8000` / `ws://localhost:9001` | backend addresses (baked at build time) |

## Verify it works

- FastAPI: `http://localhost:8000/docs`; `GET /system/status` reports MQTT +
  DB connectivity.
- ROS Bridge: console logs one rosbridge connection per robot; once connected
  it publishes `amr/v2/moverobotic/amr001/state` and a retained `connection`.
- End to end: `POST http://localhost:8000/robots/amr001/order` with
  `{"nodes":[{"x":1.0,"y":0.5,"theta":0.0}]}` — or use the console's
  Dispatch screen.

## Running the tests

See [reference/testing.md](../reference/testing.md) for the full test
pyramid. The fast feedback loops:

```bash
cd fastapi-service && pytest          # unit, no stack needed
cd ros-bridge-service && npm test     # unit, no stack needed
cd frontend && npm run typecheck      # tsc, no stack needed
```

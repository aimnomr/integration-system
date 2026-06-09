# Setup & Running

There are two ways to run the stack:

- **Docker Compose** — one command brings up the whole stack (Postgres,
  Mosquitto, FastAPI, ROS Bridge, Node-RED, frontend). This is the recommended
  path for a self-contained run or a deployment. See
  [Run with Docker](#run-with-docker) below.
- **Manually** (or via `start-all.ps1`) — start each service in its own
  terminal. Best for active development where you want hot-reload and direct
  access to each process. See [Run each service manually](#run-each-service-manually).

The same Compose stack also backs the CI Newman smoke job (see
[`testing.md`](testing.md)).

---

## Run with Docker

From the repo root, build the images and start everything:

```bash
docker compose up --build          # build + start the full stack (foreground)
docker compose up --build -d       # ...detached (runs in the background)
```

Then:

```bash
docker compose ps                  # service health / status
docker compose logs -f fastapi     # tail one service's logs
docker compose down                # stop and remove the containers
docker compose down -v             # ...and wipe the Postgres volume to re-seed
```

Published ports once up: FastAPI `:8000` (docs at `/docs`), Node-RED `:1880`,
frontend `:5173`, Mosquitto `:1883` (TCP) / `:9001` (WebSocket), Postgres
`:5432`. PostgreSQL auto-applies `docs/schema/schema.sql` on the **first** run
(when the data volume is empty); `docker compose down -v` clears it so the next
`up` re-seeds.

Compose enforces start order with healthchecks (`postgres → fastapi →
ros-bridge`). The images are intentionally lean — ROS Bridge and the frontend
build on Alpine, FastAPI on `python:3.12-slim` (glibc, required by the
`psycopg2-binary` wheel), and all run as non-root.

> A real robot's `rosbridge_server` must be reachable **from the ros-bridge
> container** for navigation to actually run; the per-robot `rosbridge_url`
> comes from the database. To rebuild the frontend against non-default
> endpoints: `docker compose build --build-arg VITE_API_URL=... frontend`.

Quick check: `curl http://localhost:8000/openapi.json` and open
`http://localhost:5173/`.

For a fuller command reference (images, volumes, debugging, cleanup,
deployment), see the [Docker cheatsheet](docker-cheatsheet/README.md).

---

## Run each service manually

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

# 6. Frontend  (http://localhost:5173 — Vite dev server)
cd frontend
npm install
npm run dev
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
| Node.js (LTS) | ROS Bridge Service, Node-RED, Frontend | |
| Mosquitto | broker | install separately; run with the repo's config |
| Node-RED | Node-RED service | install globally (`npm i -g node-red`) or locally |
| PostgreSQL | persistence | install separately; create the DB (below) |
| ROS robot + `rosbridge_server` | — | external; exposes a WebSocket (default port 9090) |

The prerequisites above are only needed for the **manual** run path. To run with
Docker instead, you just need Docker (with Compose) — `docker compose up --build`
brings up every service in a container, including Postgres and Mosquitto. See
[Run with Docker](#run-with-docker).

### Tests

Per-service unit suites (CI runs both on every push):

```bash
# ROS Bridge Service — node:test, no extra install
cd ros-bridge-service && npm test

# FastAPI service — pytest
cd fastapi-service
venv\Scripts\activate
pip install -r requirements-dev.txt
pytest
```

Integration suites (full stack must be up first):

```powershell
# Newman backend smoke (HTTP only)
.\docs\postman\run-newman.ps1

# PowerShell integration scripts (MQTT pipeline, retention, misc)
.\scripts\test\run-all.ps1            # wraps Newman + pytest + node:test too

# Frontend E2E (Playwright — chromium only)
cd frontend
npm install
npx playwright install chromium       # one-time, ~150 MB cached globally
npm run e2e
```

Full breakdown — tiers, what each suite covers, and where reports land — in
[`testing.md`](testing.md).

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

### 4b. Node dependencies (Node-RED)

```bash
cd node-red
npm install
```

Pulls in `node-red-contrib-postgresql`, which the **DB Admin** tab needs to talk
to PostgreSQL directly (see `docs/services/node-red.md` Tab 5).

### 5. Database

```bash
psql -U postgres -c "CREATE DATABASE amr_integration;"
psql -U postgres -d amr_integration -f docs/schema/schema.sql
```

`docs/schema/schema.sql` creates all 15 tables and seeds `fleet_config`, `maps`,
`robots`, and `named_locations`. Re-running it resets the database.

> **Tip:** once Node-RED is running, you can also reset the database from the
> **DB Admin** tab — the *Reset DB* inject button runs the same `schema.sql`
> against the live database via the `postgresql` node. The *Run custom SQL* inject
> next to it lets you fire ad-hoc inserts (sample payloads included). Useful for
> re-seeding the database without restarting any other service.

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
| `API_KEY` | FastAPI | _(unset)_ | If set, the client-facing API requires a matching `X-API-Key` header (G10) |
| `RATE_LIMIT_PER_MINUTE` | FastAPI | `120` | Requests per client IP per 60 s; `0` disables the limiter (G11) |
| `CORS_ORIGINS` | FastAPI | `http://localhost:5173` | Comma-separated list of browser origins allowed to call the API (G18) |
| `MQTT_BROKER` | ROS Bridge | _(required)_ | MQTT broker URL — validated at startup |
| `FLEET_API_URL` | ROS Bridge | `http://localhost:8000/fleet` | FastAPI endpoint the fleet config is fetched from |
| `API_KEY` | ROS Bridge | _(unset)_ | Sent as `X-API-Key` on `GET /fleet`; set it only if FastAPI's `API_KEY` is set |
| `NAV_GOAL_TOPIC` | ROS Bridge | `/move_base_simple/goal` | ROS topic for navigation goals |
| `CANCEL_TOPIC` | ROS Bridge | `/move_base/cancel` | ROS topic for goal cancellation |
| `LOG_LEVEL` | ROS Bridge | `info` | Log verbosity — `debug`/`info`/`warn`/`error` (optional) |
| `MQTT_HOST` | Node-RED | `localhost` | MQTT broker host for `flows.json` (defaulted in `settings.js`) |
| `FASTAPI_HOST` | Node-RED | `localhost` | FastAPI host for the `/ingest/*` calls in `flows.json` |
| `VITE_API_URL` | Frontend | `http://localhost:8000` | FastAPI base URL — REST + Vite dev-proxy target |
| `VITE_MQTT_WS_URL` | Frontend | `ws://localhost:9001` | Mosquitto WebSocket listener |
| `VITE_API_KEY` | Frontend | _(empty)_ | Sent as `X-API-Key` on every REST call when set |
| `VITE_APP_NAME` | Frontend | `AMR Console` | App name shown in the top bar |

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

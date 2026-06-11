# AMR Integration System — Detailed Project Reference

> A single, consolidated narrative of the project synthesised from the
> `docs/` knowledge base (overview, architecture, setup, status, decisions,
> per-service references, schema contracts, gaps, testing, and the VDA5050
> migration plan). For the per-topic source of truth, the original docs
> remain authoritative — this file collects them in one place for readers
> who want the whole picture in one read.

---

## 1. What this project is

The **AMR (Autonomous Mobile Robot) Integration System** is a full-stack
**fleet console** for a ROS-based mobile robot. It is the FYP author's
middleware between an operator's browser and a real robot's onboard ROS
stack: orders go out, telemetry comes back, history and metrics persist.

The system speaks the **VDA5050** standard — the open MQTT-based interface
between a Fleet Management System (FMS) and AGVs/AMRs. Topics, messages
and lifecycle semantics follow the standard's structural shape, with three
documented deviations (no `batteryState`, custom `retryNode` / `skipNode`
instant actions, no `visualization` / `factsheet`). The implementation is
**fleet-capable from day one**: VDA5050's per-robot topic namespace
(`amr/v2/moverobotic/{serialNumber}/...`) means scaling from one robot to
N is a database edit, not a code change.

Five components form the running system:

1. **React Frontend** — operator console (Vite + React 19 + TypeScript).
2. **FastAPI Service** — the FMS gateway.
3. **Mosquitto** — the central MQTT broker.
4. **Node-RED** — passive viewer / dev tool (and a DB admin tab).
5. **ROS Bridge Service** — per-robot VDA5050 ↔ ROS translator.

**PostgreSQL** sits behind FastAPI as the persistence layer and the
**single source of truth for the fleet definition**.

The project's primary working directory is `D:\FYP\integration-system`;
the `master` branch holds the integrated build, with feature branches like
the current `claude-090625` for ongoing work.

---

## 2. Architecture at a glance

### 2.1 Services and their roles

| Service          | Tech                                                                       | Address              | Role                                                                                                  |
| ---------------- | -------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| React Frontend   | Vite 6 + React 19 + TS + Tailwind 4 + MUI 7 + MUI X DataGrid/Charts        | `:5173` (dev)        | Operator console — REST commands, MQTT-over-WS telemetry, per-robot rosbridge for camera/teleop/map   |
| FastAPI Service  | Python 3.11+, FastAPI, paho-mqtt, psycopg2, Pydantic                       | HTTP `:8000`         | FMS gateway — builds + publishes VDA5050 orders; subscribes telemetry over MQTT and persists to PostgreSQL; serves state/OEE/order history; reference-data CRUD |
| Mosquitto        | Mosquitto MQTT broker                                                      | TCP `:1883`, WS `:9001` | Central message bus; TCP for backend services, WebSocket for the browser                              |
| Node-RED         | Node-RED                                                                   | `:1880`              | Passive viewer — subscribes the VDA5050 telemetry topics for live display only (no DB writes); also a DB Admin tab |
| ROS Bridge       | Node.js, `roslib`, `mqtt`                                                  | —                    | One isolated `Robot` per fleet entry; VDA5050 ↔ ROS translation                                        |
| PostgreSQL       | PostgreSQL                                                                 | `:5432`              | 15-table normalized schema — state, connection, command audit, OEE, reference data                    |

### 2.2 Three independent realtime lanes (browser side)

The frontend deliberately keeps the high-frequency lane out of MQTT so
that losing one channel degrades only the features that need it:

| Lane               | Endpoint                                                | Used for                                                                                                                                |
| ------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **REST**           | `VITE_API_URL` (default `http://localhost:8000`)        | All commands; cold reads (fleet, robot, orders, OEE, maps, locations, system status)                                                    |
| **MQTT-over-WS**   | `VITE_MQTT_WS_URL` (default `ws://localhost:9001`)      | VDA5050 `state` + `connection` per robot — low-frequency telemetry                                                                      |
| **rosbridge**      | Each robot's `rosbridgeUrl` from `GET /fleet`            | High-frequency: `/reference/map`, `/amcl_pose`, EKF odom, DWA plans, `/camera/front/image_raw/compressed`, `/web_teleop/cmd_vel`         |

The MQTT singleton (`src/realtime/mqttClient.ts`) reference-counts
subscriptions so many components sharing a topic only open one server-side
sub. The rosbridge factory caches one `ROSLIB.Ros` per URL with
exponential reconnect.

### 2.3 Command path (inbound — to the robot)

```
React / external caller
  ↓ HTTP POST /robots/{serial}/order | /instant-actions
FastAPI (FMS gateway — builds the VDA5050 message)
  ↓ MQTT publish → amr/v2/moverobotic/{serial}/order | instantActions  (QoS 0)
Mosquitto
  ↓
ROS Bridge Service — FleetManager routes to the Robot; OrderStateMachine
  ↓ WebSocket (rosbridge)
ROS → /move_base_simple/goal | /move_base/cancel → Robot
```

There is **no command router** any longer — FastAPI publishes VDA5050
messages directly. The `OrderStateMachine` sends one node goal at a time,
waits for each `/move_base/result`, then advances. This is the
auto-waypoint-advance feedback loop closed by the VDA5050 migration.

### 2.4 Telemetry path (outbound — from the robot)

```
Robot
  ↓ ROS topics: /amcl_pose, /diff_controller/odom,
                /move_base/status, /move_base/result
ROS Bridge Service — Robot's StateBuilder + OrderStateMachine
  ↓ MQTT publish → amr/v2/moverobotic/{serial}/state | connection
Mosquitto
  ↓
FastAPI — subscribes state / connection / order / instantActions over MQTT,
          derives OEE cycles, persists each (app/mqtt.py → app/ingest_service.py)
  ↓
PostgreSQL
```

Telemetry persistence lives in FastAPI's own MQTT subscriber (since
2026-06-09); the same logic backs the HTTP `/ingest/*` routes, now a
secondary path kept for manual injection, the Node-RED Test Harness, and
the smoke suite. **Node-RED is a passive viewer** — it subscribes the same
topics (including the `order` / `instantActions` audit tap) purely to
display them live, and no longer writes to the database. The stack
functions whether Node-RED is running or not.

### 2.5 Key design points

- Topics are per-robot (`amr/v2/moverobotic/{serial}/...`); adding a robot
  is a database edit — a `robots` row — no code change.
- Each `Robot` owns its **own MQTT client** so it can register a per-robot
  Last-Will (retained `CONNECTIONBROKEN` on its `connection` topic). MQTT
  permits only one Will per connection.
- VDA5050 QoS — `order` / `instantActions` / `state` are QoS 0;
  `connection` is QoS 1 and retained.
- `state` is published on significant position/order/error change plus a
  5 s heartbeat (distance > 0.05 m or heading > 5°).
- Telemetry persistence is triggered by FastAPI's own MQTT subscriber
  (`app/mqtt.py` → `app/ingest_service.py` → `app/db.py`), not by Node-RED —
  a documented refinement of migration plan §5.3 (2026-06-09; Node-RED
  previously POSTed to `/ingest/*`).

---

## 3. VDA5050 alignment

### 3.1 Topic hierarchy

```
{interfaceName}/{majorVersion}/{manufacturer}/{serialNumber}/{topic}
```

Fixed segments for this project:

| Segment        | Value         | Notes                                                                  |
| -------------- | ------------- | ---------------------------------------------------------------------- |
| interfaceName  | `amr`         | VDA5050 examples use `uagv`; `amr` chosen here for project naming      |
| majorVersion   | `v2`          | VDA5050 `2.0.0`                                                        |
| manufacturer   | `moverobotic` | Fixed for this fleet                                                   |
| serialNumber   | `amr001`, …   | Assigned incrementally per robot                                       |

A concrete example: `amr/v2/moverobotic/amr001/order`.

| Topic            | Direction  | QoS | Retained | Purpose                                                |
| ---------------- | ---------- | --- | -------- | ------------------------------------------------------ |
| `order`          | FMS → AGV  | 0   | no       | Navigation order (graph of nodes)                      |
| `instantActions` | FMS → AGV  | 0   | no       | Immediate actions — cancel / retry / skip              |
| `state`          | AGV → FMS  | 0   | no       | Consolidated robot snapshot                            |
| `connection`     | AGV → FMS  | 1   | **yes**  | `ONLINE` / `OFFLINE` / `CONNECTIONBROKEN` (Last-Will)  |

### 3.2 Shared header

Every VDA5050 message carries:

```json
{
  "headerId": <integer>,           // increments per topic, per robot
  "timestamp": "<ISO 8601 string>",
  "version": "2.0.0",
  "manufacturer": "<string>",
  "serialNumber": "<string>"
}
```

`headerId` is monotonic **per topic, per robot**. The FastAPI
`RobotRegistry` seeds these counters from the database at startup
(`MAX(header_id)` from `orders` / `instant_action_messages`) so they
**persist across restarts** rather than resetting to zero (G21).

### 3.3 Messages — structural shape

- **`order`** — header + `orderId`, `orderUpdateId`, `nodes[]`, `edges[]`.
  A single goal is an order with one node; a waypoint sequence is an
  order with N nodes (edges auto-generated to connect consecutive nodes;
  `actions: []` initially). `theta` is radians, map frame. Each released
  node becomes one `/move_base_simple/goal` in `sequenceId` order — the
  state machine waits for `move_base/result` before sending the next.
- **`instantActions`** — header + `actions[]` of
  `{actionId, actionType, blockingType, actionParameters}`. Action types
  in scope: `cancelOrder` → `/move_base/cancel`; `retryNode` re-sends the
  current node; `skipNode` advances to the next.
- **`state`** — header + `orderId`/`orderUpdateId`/`lastNodeId`/
  `lastNodeSequenceId` + `nodeStates[]`/`edgeStates[]`/`actionStates[]` +
  `agvPosition` (`x,y,theta,mapId,positionInitialized`) + `velocity` +
  `driving` + `operatingMode: "AUTOMATIC"` + `errors[]` +
  `safetyState{eStop, fieldViolation}`. Published on change + 5 s
  heartbeat.
- **`connection`** — header + `connectionState`. Retained, QoS 1, with
  `CONNECTIONBROKEN` as MQTT Last-Will.

### 3.4 ROS → VDA5050 mapping (telemetry)

| `state` field                                                  | ROS source                                       |
| -------------------------------------------------------------- | ------------------------------------------------ |
| `agvPosition`                                                  | `/amcl_pose` (`mapping:=false` mode)              |
| `velocity`, `driving`                                          | `/diff_controller/odom`                          |
| `orderId`, `lastNodeId`, `nodeStates`, `actionStates`          | order state machine (in-process)                 |
| nav progress / completion                                      | `/move_base/result`, `/move_base/status`         |
| `safetyState.eStop`                                            | `/e_stop`, `/error_stop`, `/bumper_stop`         |
| `errors`                                                       | `/safety/error*` + bridge-detected faults        |
| `operatingMode`                                                | static `AUTOMATIC`                               |

### 3.5 Documented deviations from strict VDA5050

1. **`batteryState` omitted** — the robot exposes no battery topic and a
   synthetic stub was unwanted; the mandatory VDA5050 field is dropped.
2. **Custom `retryNode` / `skipNode`** — VDA5050 has no native
   retry/skip. The standard alternative (order updates with higher
   `orderUpdateId` and full merge/horizon semantics) was avoided in
   favour of one action, one effect.
3. **`visualization` and `factsheet` dropped** — the React UI reads live
   pose directly from rosbridge, so `visualization` would duplicate;
   `factsheet` is out of scope.

---

## 4. Service-by-service reference

### 4.1 FastAPI service (`fastapi-service/`)

The **FMS gateway**. Builds and publishes VDA5050 `order` /
`instantActions`, serves PostgreSQL-backed state/OEE/order history,
accepts telemetry from Node-RED, and exposes reference-data CRUD.

Module layout:

```
fastapi-service/
├── main.py                   # load_dotenv → validate_env → mount routers
├── requirements.txt          # fastapi, uvicorn, paho-mqtt, python-dotenv,
│                             # pydantic, psycopg2-binary
└── app/
    ├── robots.py             # RobotRegistry — loads fleet from DB + counters
    ├── vda5050.py            # build_order(), build_instant_actions(), topic_for()
    ├── mqtt.py               # paho client + publish_order / publish_instant_actions
    ├── db.py                 # PostgreSQL access via ThreadedConnectionPool
    ├── config.py             # validate_env() — fail-fast at startup
    ├── schemas.py            # Pydantic request models
    ├── auth.py               # opt-in X-API-Key
    ├── ratelimit.py          # per-client-IP sliding window
    ├── logging_config.py     # JSON-line logging
    └── routers/
        ├── robots.py         # /robots/* — FMS gateway routes
        ├── fleet.py          # /fleet — fleet definition (read by ROS Bridge)
        ├── system.py         # /system/status
        ├── oee.py            # /robots/{serial}/oee/*
        ├── orders.py         # /orders, /orders/{order_id}
        ├── maps.py           # /maps CRUD
        ├── locations.py      # /locations CRUD
        └── ingest.py         # /ingest/* — telemetry from Node-RED
```

Key behaviours:

- **Boots from the DB.** `RobotRegistry` loads `fleet_config` + `robots`
  at startup; if the DB is unreachable, FastAPI does not start.
- **Pooled DB access.** `app/db.py` lazily builds a
  `psycopg2.pool.ThreadedConnectionPool` (`DB_POOL_MIN` / `DB_POOL_MAX`).
  Connection-level errors are caught everywhere and translated into
  `DatabaseUnavailable` → HTTP 503; the pool is invalidated on failure so
  the next request rebuilds a fresh pool (G24).
- **Retention.** A background task every 6 h deletes `state_snapshots`
  and `connection_log` rows older than `TELEMETRY_RETENTION_DAYS`
  (default 30; `0` disables — G19). Child tables go via
  `ON DELETE CASCADE`.
- **Cross-cutting middleware.** Opt-in `X-API-Key` auth on the
  client-facing API (`/robots/*`, `/fleet`, `/system/*`, `/maps/*`,
  `/locations/*`) — off by default for local dev. Per-client-IP sliding
  window rate limit (default 120 req/min). CORS via `CORS_ORIGINS`.
  `/ingest/*` is exempt from auth + rate limit (internal boundary).

### 4.2 ROS Bridge Service (`ros-bridge-service/`)

Translates between VDA5050 MQTT messages and ROS over a `rosbridge`
WebSocket. **Fleet-capable**: a `FleetManager` instantiates one isolated
`Robot` per fleet entry.

```
ros-bridge-service/
├── index.js                  # entry — fetch GET /fleet, start FleetManager
└── src/
    ├── logger.js             # structured JSON logger
    ├── vda5050.js            # topic helpers, HeaderFactory, validators
    ├── mqttClient.js         # createMqttClient({ will })
    ├── fleetManager.js       # Map<serial, Robot>
    ├── robot.js              # one robot's lifecycle (MQTT client + LWT)
    ├── rosConnection.js      # rosbridge WS + 3 s auto-reconnect
    ├── orderStateMachine.js  # drives move_base node-by-node
    ├── stateBuilder.js       # assembles + publishes `state`
    ├── odomBridge.js         # /diff_controller/odom → motion
    └── poseBridge.js         # /amcl_pose → agvPosition
```

Lifecycle:

1. `index.js` validates `MQTT_BROKER`, fetches the fleet from
   `FLEET_API_URL` (FastAPI's `GET /fleet`), exits on failure.
2. `FleetManager` instantiates one `Robot` per entry; SIGINT/SIGTERM
   triggers a graceful `stop()` on each.
3. Each `Robot` owns its own MQTT client (so it can have a per-robot
   `CONNECTIONBROKEN` Last-Will on `connection`), its own
   `RosConnection`, `OrderStateMachine`, `StateBuilder`, `OdomBridge`,
   `PoseBridge`, plus a `HeaderFactory` for per-topic counters.
4. `OrderStateMachine` sends one node goal at a time and waits for the
   `/move_base/result`: `SUCCEEDED` advances; `ABORTED` / `PREEMPTED`
   pauses for `retryNode` / `skipNode`. On non-`SUCCEEDED` results it
   records a `navigationFailed` error (G17) which `StateBuilder` merges
   into `state.errors`, persisted via the ingest path and surfaced by
   `GET /robots/{serial}/state`. A successful later node clears it.

### 4.3 Mosquitto (`mosquitto/`)

Two listeners on the same topic tree, both anonymous (FYP / LAN only;
hardening to TLS + credentials is tracked as G32):

| Port | Protocol         | Used by                                        |
| ---- | ---------------- | ---------------------------------------------- |
| 1883 | MQTT over TCP    | FastAPI, Node-RED, ROS Bridge — backend lane   |
| 9001 | MQTT over WebSockets | Browser frontend (`mqtt.js`) — `state` + `connection` |

Retained-message store is shared between the two listeners — a late WS
subscriber receives the same retained `connection` as a TCP client.

### 4.4 Node-RED (`node-red/`)

**Passive viewer since 2026-06-09** — three tabs in `flows.json`. All MQTT
subscriptions use `+` wildcards so a single flow captures every robot.

| Tab | Purpose                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Telemetry (view-only) | Three view-only flow groups (state + connection, command audit, OEE) — subscribe → validate/tag/derive → debug. **No DB writes.** |
| 2 — Test Harness          | Manual VDA5050 injectors for `amr001`, plus outbound debug                                                                    |
| 3 — DB Admin              | `node-red-contrib-postgresql` direct DB access — Reset DB, Row Counts, View `<table>`, Run custom SQL                          |

The Tab 1 flows **end at a debug node**, not an HTTP POST — FastAPI persists
these same topics over MQTT (`app/ingest_service.py`); the `validate*` /
`tag*` / `deriveCycle` nodes are kept only for the live status display. The
DB Admin tab is the exception: it uses `node-red-contrib-postgresql`
directly for schema reset and ad-hoc admin SQL. Two equivalent Reset
pipelines (A and B) exist side-by-side to let the maintainer pick whichever
the Postgres driver handles cleanly when mixing DDL with seed DML. The
inline SQL inside those nodes is a hand-maintained mirror of
`docs/schema/schema.sql` — keep them in sync.

### 4.5 React Frontend (`frontend/`)

Vite 6 + React 19 + TypeScript. Tailwind 4 for layout utilities, MUI 7
(plus MUI X DataGrid + Charts) for complex widgets, TanStack Query for
the REST cache, `mqtt` for browser MQTT, `roslib` for per-robot
rosbridge.

Screens:

| Route                | What it does                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                  | Dashboard — fleet grid of `RobotTile`. Cold-loads `GET /fleet`, lives off MQTT `state`+`connection` afterwards. 1 s ticker for "last seen".     |
| `/robots/:serial`    | Robot Detail — `MapCanvas` (live SLAM map) + tabbed side panel (State / Errors / Actions). Named-location pins overlaid.                        |
| `/dispatch`          | Robot picker + Named-or-Manual order builder. Active-order panel shows live `nodeStates` + Cancel / Retry / Skip (disabled when order done).    |
| `/orders`            | Cursor-paged DataGrid over `GET /orders`. Filter by robot; "Load older" advances the cursor.                                                    |
| `/oee`               | Summary cards + availability bar + MUI X `BarChart` of recent cycles + paginated cycles log grid.                                               |
| `/teleop`, `/teleop/:serial` | ENGAGED-gated camera + 3×3 keyboard pad (QWE/ASD/ZXC). LINEAR 0.3 m/s, ANGULAR 0.5 rad/s, 100 ms repeat. Auto-disengages on rosbridge drop. |
| `/health`            | Six-row service readout (FastAPI, MQTT browser + backend, Postgres, rosbridge fleet, Node-RED) from `GET /system/status` polled every 5 s.       |
| `/admin/maps`        | DataGrid + edit drawer; 409-aware delete confirm.                                                                                                |
| `/admin/locations`   | DataGrid + edit drawer with an **embedded `MapCanvas`** — click the map to set x/y.                                                              |
| `/admin/robots`      | DataGrid + edit drawer. Active and Archived sections. Archive/Restore icon buttons (G40).                                                       |
| `/admin/fleet`       | Single-row form for `fleet_config`.                                                                                                              |
| `*`                  | 404 with back-to-dashboard link.                                                                                                                 |

`MapCanvas` (`src/components/map/MapCanvas.tsx`) is a custom `<canvas>`
renderer — no `ros2djs`. It rasterises `nav_msgs/OccupancyGrid` from
`/reference/map` onto an offscreen canvas once per map update (ROS Y-flip
on row index), then draws scaled into the visible canvas. Path overlays
(DWA global/local plan) and the robot arrow are world-space and
transformed via the map metadata. Pose source is **AMCL primary, EKF
fallback after 2 s of AMCL silence** (arrow turns amber on fallback).
Click-on-canvas yields world coordinates via the inverse transform —
exposed as `onClickWorld` and used by the location-editor.

Everything visual flows out of one file — `src/branding/branding.ts` —
which feeds both Tailwind (`tailwind.config.ts`, `brand-*` and
`surface-*` utilities) and the MUI theme at runtime. Tailwind has
`important: 'html'` so its utilities win against MUI's
component-internal styles.

V1-interface contracts preserved verbatim:

- Angles are degrees at the UI layer; quaternion conversion happens at
  the rosbridge boundary (`src/helper/angleHelper.ts`).
- Goals carry `header.frame_id = 'map'`.
- Teleop: LINEAR_SPEED 0.3 m/s, ANGULAR_SPEED 0.5 rad/s, 100 ms repeat,
  QWE/ASD/ZXC layout, mouse + touch + keyboard, releases publish zero
  Twist.

---

## 5. REST API (FastAPI)

Authentication, rate limiting, and CORS apply cross-cutting; per-endpoint
status codes are additional.

### 5.1 Cross-cutting middleware

- **Auth (G10).** `X-API-Key` opt-in via `API_KEY` env var. Guards
  `/robots/*`, `/fleet`, `/system/*`, `/maps/*`, `/locations/*`. When
  `API_KEY` is unset the API is open (local-dev default). `/ingest/*` is
  intentionally unguarded — it's the internal Node-RED → DB boundary.
- **Rate limit (G11).** Per-client-IP sliding window,
  `RATE_LIMIT_PER_MINUTE` requests / 60 s (default 120; `0` disables).
  Over-limit returns 429 with `Retry-After`. `/ingest/*` and `/docs` are
  exempt.
- **CORS (G18).** `CORS_ORIGINS` comma-separated; default
  `http://localhost:5173`. Credentials and `X-API-Key` permitted.

### 5.2 Endpoint catalogue

**FMS gateway**

| Method | Path                                       | Purpose                                                              |
| ------ | ------------------------------------------ | -------------------------------------------------------------------- |
| POST   | `/robots/{serial}/order`                   | Submit a navigation order (1 node = single goal, N = sequence)        |
| POST   | `/robots/{serial}/order/named`             | Submit an order by named-location IDs                                |
| POST   | `/robots/{serial}/instant-actions`         | `cancelOrder` / `retryNode` / `skipNode`                              |
| GET    | `/robots`                                  | List active robots (camelCase)                                       |
| GET    | `/robots?include_archived=true`            | Admin view; rows carry `archivedAt`                                  |
| GET    | `/robots/{serial}`                         | One robot (camelCase response, snake_case DB columns)                |
| GET    | `/robots/{serial}/state`                   | Latest stored VDA5050 `state` for the robot                          |
| GET    | `/fleet`                                   | Full fleet definition (ROS Bridge fetches this at startup)           |
| GET    | `/system/status`                           | MQTT + DB + rosbridge + Node-RED connectivity                        |

**Order history**

| Method | Path                | Purpose                                                  |
| ------ | ------------------- | -------------------------------------------------------- |
| GET    | `/orders`           | Cursor-paged historical orders (`limit`, `serial`, `before`) |
| GET    | `/orders/{order_id}` | One order header + joined `nodes` + `edges` (G31)         |

**OEE**

| Method | Path                                      | Purpose                                                        |
| ------ | ----------------------------------------- | -------------------------------------------------------------- |
| GET    | `/robots/{serial}/oee/summary`            | total/succeeded/failed cycles + avg duration                   |
| GET    | `/robots/{serial}/oee/cycles`             | Recent trip cycles                                              |
| GET    | `/robots/{serial}/oee/availability`        | Driving samples / total samples / availability ratio            |

**Reference-data CRUD (G15)**

| Resource          | Operations                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `/maps`           | GET list / GET one / POST / PUT label / DELETE (409 if referenced)                                |
| `/locations`      | GET list / GET one / POST / PUT / DELETE                                                          |
| `/robots`         | POST (409 with `detail.code="archived_serial"` if collides with archived row) / PUT / DELETE / POST archive / POST restore |
| `PUT /fleet`      | Update the single `fleet_config` row                                                              |

Robot archive semantics (G40):

- Operator surfaces (`GET /robots`, `GET /fleet`, Dashboard, Dispatch,
  Teleop, OEE) hide archived robots.
- Command paths return **410 Gone** for archived robots.
- `/ingest/*` rejects archived serials with 410 via in-memory
  `registry.is_archived` (O(1), no per-message DB hit).
- History endpoints (`/orders`, `/oee/*`) still resolve archived serials
  — historical rows remain readable.
- After any robot write the in-memory `RobotRegistry` is reloaded; the
  **ROS Bridge Service still needs a restart** to actually start/stop a
  robot's process.

**Internal ingestion**

| Method | Path                  | Purpose                                                  |
| ------ | --------------------- | -------------------------------------------------------- |
| POST   | `/ingest/state`        | Node-RED POSTs VDA5050 `state` → `state_snapshots` (+ children) |
| POST   | `/ingest/connection`   | VDA5050 `connection` → `connection_log`                   |
| POST   | `/ingest/command`      | `order` / `instantActions` audit tap → `orders` / `instant_action_messages` |
| POST   | `/ingest/oee-cycle`    | Node-RED-derived trip cycle → `oee_cycles`                 |

503 surfaces when the database is unavailable; 422 on Pydantic
validation; routes that need a registered robot return 404.

---

## 6. Database schema (PostgreSQL — 15 tables)

The schema is **VDA5050-aligned, multi-robot, and fully normalized
(1NF-strict, BCNF)**. VDA5050's variable-length arrays (`nodes`, `edges`,
`actions`, `nodeStates`, `actionStates`, `errors`) live in child tables
with foreign keys — **not** JSONB. This replaced the earlier JSONB design
on 2026-05-17.

The runnable schema is `docs/schema/schema.sql`; re-running it
**resets** every table and reseeds `fleet_config`, `maps`, `robots`,
`named_locations`.

### 6.1 Tables

| # | Table                       | Group           | Kind                               |
| - | --------------------------- | --------------- | ---------------------------------- |
| 1 | `fleet_config`              | reference       | single row — fleet-wide VDA5050 identity |
| 2 | `maps`                      | reference       | seeded                             |
| 3 | `robots`                    | reference       | seeded — single source of truth    |
| 4 | `named_locations`           | reference       | seeded                             |
| 5 | `orders`                    | orders          | append-only — `order` header        |
| 6 | `order_nodes`               | orders          | child of `orders`                  |
| 7 | `order_edges`               | orders          | child of `orders`                  |
| 8 | `instant_action_messages`   | instant actions | append-only — header               |
| 9 | `instant_actions`           | instant actions | child of `instant_action_messages` |
| 10 | `state_snapshots`          | state           | append-only — scalar fields        |
| 11 | `state_node_states`        | state           | child of `state_snapshots`         |
| 12 | `state_action_states`      | state           | child of `state_snapshots`         |
| 13 | `state_errors`             | state           | child of `state_snapshots`         |
| 14 | `connection_log`           | connection      | append-only                        |
| 15 | `oee_cycles`               | OEE             | append-only — derived              |

### 6.2 Notable schema points

- **Single-row guard** — `fleet_config` uses `PRIMARY KEY DEFAULT 1
  CHECK (id = 1)` to enforce exactly one row.
- **Soft-delete on `robots`** — `archived_at TIMESTAMPTZ` is NULL when
  active, set when archived. Partial index
  `idx_robots_active … WHERE archived_at IS NULL` keeps active-robot
  lookups fast. History rows survive intact across archive/restore.
- **Foreign keys everywhere** — every log table's `serial_number` is a
  real FK to `robots`. Child tables use `ON DELETE CASCADE` so deleting
  a snapshot or order removes its node/action/error rows atomically.
  **The FK is never cascaded** on operator deletes — telemetry is never
  wiped.
- **Generated columns** — `oee_cycles.duration_s` is `GENERATED ALWAYS AS
  (EXTRACT(EPOCH FROM (end_time - start_time))) STORED` to stay in BCNF
  (no free-standing derived column).
- **Enum-like CHECK constraints** — `connection_state`,
  `oee_cycles.result`, `action_type`, `blocking_type` use `CHECK (… IN
  (…))` rather than PostgreSQL `ENUM` types so the script stays
  drop-and-re-run-clean.
- **Persisting one `state` message is a multi-row transaction** — one
  `state_snapshots` row + N `state_node_states` + action / error rows.
  `state_node_states` is the fastest-growing table; retention (G19)
  prunes both.

### 6.3 Seed data (out of the box)

```sql
fleet_config: id=1, interface_name='amr', major_version='v2',
              version='2.0.0', manufacturer='moverobotic'
maps:         ('default', 'Default map (placeholder…)')
robots:       ('amr001', 'ws://localhost:9090', 'default')
named_locations:
  1 Charging Station ( 3.094,  1.412, -2.21568)
  2 Entrance         (-1.953,  2.467, -0.59145)
  3 Storage Room     (-2.690, -1.583,  2.48120)
  4 Home             ( 0.000,  0.000,  0.00000)
```

`theta` is radians, map frame.

---

## 7. ROS interface

The robot exposes ROS topics over `rosbridge_server` (default port
9090). The integration assumes **`mapping:=false`** mode (localization +
navigation), because `/amcl_pose` — the map-frame pose source for
`state.agvPosition` — is **only** available there. Mapping mode
(`mapping:=true`) instead exposes `/gmapping_node/entropy` and no AMCL.

### 7.1 Topics consumed/published by the frontend (high-frequency lane)

| Topic                                              | Type                                          | UI use                                                |
| -------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| `/reference/map`                                   | `nav_msgs/OccupancyGrid`                      | MapCanvas — live SLAM map                              |
| `/amcl_pose`                                       | `geometry_msgs/PoseWithCovarianceStamped`     | MapCanvas robot arrow (primary)                       |
| `/robot_pose_ekf_node/odom_combined`               | `geometry_msgs/PoseWithCovarianceStamped`     | MapCanvas arrow (fallback after 2 s AMCL silence)     |
| `/move_base_node/DWAPlannerROS/global_plan`        | `nav_msgs/Path`                               | MapCanvas — sky overlay                                |
| `/move_base_node/DWAPlannerROS/local_plan`         | `nav_msgs/Path`                               | MapCanvas — red overlay                                |
| `/camera/front/image_raw/compressed`               | `sensor_msgs/CompressedImage`                 | Teleop — CameraStream                                  |
| `/web_teleop/cmd_vel`                              | `geometry_msgs/Twist`                         | Teleop — KeyboardPad publishes here                    |

### 7.2 Topics consumed/published by the ROS Bridge Service

- Subscribes: `/amcl_pose`, `/diff_controller/odom`, `/move_base/status`,
  `/move_base/result`.
- Publishes: `/move_base_simple/goal`, `/move_base/cancel`.

Two roslib instances exist in the system: one in the browser (direct,
high-frequency lane) and one in `ros-bridge-service` (the VDA5050
pathway).

---

## 8. Setup, prerequisites, environment

### 8.1 Docker — supported run & deployment path

The repo ships a root `docker-compose.yml`, per-service `Dockerfile`s, and a
frontend `nginx.conf`. `docker compose up --build` brings up the whole stack
(Postgres → Mosquitto → FastAPI → ROS Bridge → Node-RED → frontend), so Docker
is a supported way to run the project self-contained and to deploy it. The same
compose stack also backs the CI Newman smoke job. The manual run order below (or
`start-all.ps1`) remains the convenient path for active development with
hot-reload. Images are lean — Alpine for ROS Bridge and the frontend,
`python:3.12-slim` for FastAPI (glibc, required by `psycopg2-binary`), all
running as non-root.

### 8.2 Manual run order

Order matters because the DB is the single source of truth:

1. Mosquitto.
2. PostgreSQL — must be up before FastAPI (FastAPI loads the fleet at
   boot and will not start otherwise).
3. FastAPI — serves `GET /fleet`.
4. ROS Bridge — fetches `GET /fleet` at startup.
5. Node-RED — can start any time after Mosquitto.

MQTT and rosbridge reconnect automatically; FastAPI→DB and ROS Bridge→
FastAPI are **startup dependencies, not retried**.

### 8.3 Prerequisites

| Requirement              | Used by                                  | Notes                                  |
| ------------------------ | ---------------------------------------- | -------------------------------------- |
| Python 3.11+             | FastAPI                                  | venv under `fastapi-service/venv/`     |
| Node.js (LTS)            | ROS Bridge, Node-RED, Frontend           |                                        |
| Mosquitto                | broker                                   | run with the repo's `mosquitto.conf`   |
| Node-RED                 | Node-RED                                 | global or local                        |
| PostgreSQL               | persistence                              | DB must be created (`amr_integration`) |
| ROS robot + `rosbridge_server` | —                                  | external; WebSocket on port 9090       |

### 8.4 Environment variables (selected)

| Variable                | Service       | Default                       | Purpose                                                       |
| ----------------------- | ------------- | ----------------------------- | ------------------------------------------------------------- |
| `MQTT_BROKER`           | FastAPI       | _required_                    | MQTT broker host — validated at startup                       |
| `MQTT_PORT`             | FastAPI       | _required_                    | MQTT broker port                                              |
| `DB_HOST` / `DB_PORT`   | FastAPI       | localhost / 5432              | Postgres connection                                            |
| `DB_NAME`               | FastAPI       | `amr_integration`             |                                                               |
| `DB_USER` / `DB_PASSWORD` | FastAPI     | `postgres` / `admin`          |                                                               |
| `NODE_RED_URL`          | FastAPI       | `http://localhost:1880`       | Probed by `/system/status`                                    |
| `API_KEY`               | FastAPI       | _(unset)_                     | If set, `X-API-Key` required on client-facing API (G10)        |
| `RATE_LIMIT_PER_MINUTE` | FastAPI       | 120                           | 0 disables (G11)                                              |
| `CORS_ORIGINS`          | FastAPI       | `http://localhost:5173`       | Comma-separated allowed origins (G18)                         |
| `TELEMETRY_RETENTION_DAYS` | FastAPI    | 30                            | 0 disables retention (G19)                                    |
| `MQTT_BROKER`           | ROS Bridge    | _required_                    | MQTT broker URL — validated at startup                        |
| `FLEET_API_URL`         | ROS Bridge    | `http://localhost:8000/fleet` | FastAPI endpoint the fleet config is fetched from              |
| `API_KEY`               | ROS Bridge    | _(unset)_                     | Sent as `X-API-Key` on `GET /fleet` (match FastAPI's setting) |
| `NAV_GOAL_TOPIC`        | ROS Bridge    | `/move_base_simple/goal`      | ROS topic for nav goals                                       |
| `CANCEL_TOPIC`          | ROS Bridge    | `/move_base/cancel`           | ROS topic for cancel                                          |
| `LOG_LEVEL`             | ROS Bridge    | `info`                        | debug / info / warn / error                                    |
| `MQTT_HOST`             | Node-RED      | `localhost`                   |                                                               |
| `FASTAPI_HOST`          | Node-RED      | `localhost`                   | For `/ingest/*` calls in `flows.json`                          |
| `VITE_API_URL`          | Frontend      | `http://localhost:8000`       | REST + Vite dev-proxy target                                  |
| `VITE_MQTT_WS_URL`      | Frontend      | `ws://localhost:9001`         | Mosquitto WebSocket listener                                  |
| `VITE_API_KEY`          | Frontend      | _(empty)_                     | Sent as `X-API-Key` on every REST call when set               |
| `VITE_APP_NAME`         | Frontend      | `AMR Console`                 | App name in the top bar                                       |

---

## 9. Testing strategy

Three tiers — pick the deepest one that fits the change.

### 9.1 Tier 1 — unit (no stack needed, < 30 s)

| Suite              | Command                                  | Covers                                                                                                   |
| ------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| FastAPI pytest     | `cd fastapi-service && pytest -q`        | 41+ tests — config, auth, rate limit, schemas, orders, CORS, retention, DB-down 503 contract, robot archive |
| ROS Bridge node:test | `cd ros-bridge-service && npm test`     | ~15 tests — state builder, order state machine, VDA5050 helpers                                          |

`tests/conftest.py` stubs the four DB calls `RobotRegistry.__init__`
makes plus the paho client (G41 workaround), so unit tests run without
live Postgres or Mosquitto.

### 9.2 Tier 2 — integration (full stack must be up)

| Suite                       | Command                                  | Covers                                                                                                |
| --------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Newman backend HTTP         | `.\docs\postman\run-newman.ps1`          | 13 sections / 61 requests / 66 assertions / 0 failed — every endpoint, negative cases, CORS pos/neg, `/orders` pagination |
| PowerShell integration      | `.\scripts\test\run-all.ps1`             | Wraps Newman + pytest + node:test + ingest / retention / misc scripts                                  |
| Playwright frontend E2E     | `cd frontend && npm run e2e`             | Non-robot React surface — AppShell, Health, Dashboard, Dispatch, Admin CRUD, Orders, OEE, CORS (24/24 last run) |

PowerShell integration scripts also runnable individually:

- `test-ingest.ps1` — MQTT → Node-RED → FastAPI → Postgres pipeline.
- `test-retention.ps1` — G19 retention prune SQL.
- `test-misc.ps1` — rapid orders distinctness, G21 legacy-suffix
  tolerance, Mosquitto `:9001` reachable.

### 9.3 Tier 3 — manual

Two views of the same checklist:

- `docs/manual-test-checklist.md` — phase-ordered with `[auto: …]` tags
  showing which tier covers each item.
- `docs/manual-test-by-service.md` — leftover manual items re-grouped by
  service for spot-checks.

Tags: `[robot]` needs a live robot/sim; `[chaos]` needs a service
restart mid-flight; `[UI]` is a visual/interaction check automation
can't reach; `[ops]` is config / log inspection.

### 9.4 CI (GitHub Actions, `.github/workflows/ci.yml`)

Five jobs run on every push / PR:

1. **ROS Bridge** — `npm ci`, `node --check`, `npm test`.
2. **FastAPI** — `pip install`, `compileall`, `pytest`.
3. **Node-RED** — `flows.json` JSON validation.
4. **Frontend** (G28) — `npm ci`, `npm run typecheck` (`tsc -b
   --noEmit`), `npm run build`.
5. **Newman API smoke** (G29) — boots `postgres + mosquitto + fastapi`
   via `docker compose`, waits for the FastAPI healthcheck, runs the
   13-section collection, uploads HTML+JSON reports as artifacts.

Playwright is local-only (needs a live full stack with rosbridge);
Newman is the in-CI substitute for HTTP-level contract drift.

---

## 10. Open gaps and known constraints

As of 2026-05-25, **G32 and G39 are open**; **G41** is a tracked
cosmetic test-env note. All other tracked gaps (G1–G31, G33–G38, G40)
are resolved. The current open set:

| #   | Gap                                                                                                                                | Area       | Severity |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| G32 | MQTT broker anonymous on both `:1883` and `:9001` — no auth / no TLS. Fine for FYP / LAN; needed before any wider deployment.        | Mosquitto  | Low      |
| G39 | Robot Detail "connection" pill stuck ONLINE when the sim stops (only flips on rosbridge death). Likely expected VDA5050 behaviour. | Frontend   | Low      |
| G41 | `app/mqtt.py` calls `mqtt_client.connect()` at module import — pytest fails without a live Mosquitto. Worked-around in `conftest.py`. | Backend tests | Low   |

### 10.1 Documented simplifications (not tracked as gaps)

- **No `batteryState`** — the robot has no battery topic; the VDA5050
  field is omitted entirely.
- **Custom `retryNode` / `skipNode`** — chosen over full order-update
  merge semantics.
- **`visualization` and `factsheet` dropped** — the React UI already
  reads pose directly from rosbridge.
- **Safety topics not yet merged into `state.errors` / `safetyState`** —
  the fields exist with safe defaults but the wire from `/e_stop`,
  `/safety/error*` is a simplification, not a tracked gap.
- **`mapId` is a placeholder (`"default"`)** — the robot loads an
  auto-generated, non-stable map name; once a stable map exists, update
  `maps` / `robots`.

---

## 11. Key design decisions and their rationale

Distilled from `docs/decisions.md`; newest first.

1. **Database is the single source of truth for the fleet (2026-05-17).**
   `fleet_config` + `robots` replace `robots.config.json`. FastAPI loads
   the fleet at startup; the ROS Bridge fetches it from FastAPI's
   `GET /fleet`. One authoritative source eliminates drift. Trade-off:
   PostgreSQL must be up before FastAPI before the ROS Bridge — startup
   dependencies, not retried.
2. **Fully normalized 15-table schema (2026-05-17).** Replaces the
   earlier JSONB design (which violated 1NF). VDA5050 arrays become
   child tables with FKs; storing one `state` message is a multi-row
   transaction; accepted as a known scaling characteristic.
3. **Node-RED persists via FastAPI `/ingest/*` (2026-05-17).** No
   PostgreSQL Node-RED contrib was installed at the time; rather than
   add it for the runtime tabs, Node-RED POSTs each message to FastAPI,
   keeping the SQL in one testable place. The DB Admin tab is the lone
   exception, using `node-red-contrib-postgresql` directly.
   **Superseded 2026-06-09:** FastAPI's own MQTT subscriber now ingests and
   persists telemetry (`app/ingest_service.py`); Node-RED is a passive viewer
   and the `/ingest/*` routes are a secondary path.
4. **Per-robot MQTT client in the ROS Bridge (2026-05-17).** MQTT
   permits only one Will per connection; the `connection` topic needs a
   per-robot retained `CONNECTIONBROKEN` Will, so each `Robot` owns its
   own client. Cleaner per-robot isolation than a shared client +
   wildcard demux.
5. **VDA5050 adoption (2026-05-16 / 2026-05-17).** The legacy `amr/cmd/*`
   / `amr/state/*` scheme was replaced entirely with the VDA5050 topic
   hierarchy. The standard-alignment and multi-robot refactors were
   largely the same work because VDA5050 namespaces per robot.
6. **Service code split into modules.** Both services were
   re-architected into clean dependency graphs (`fastapi-service/app/`,
   `ros-bridge-service/src/`). The class-based ROS Bridge structure is
   the multi-robot primitive — one `Robot` per fleet entry.
7. **MQTT QoS levels.** `order` / `instantActions` / `state` = QoS 0;
   `connection` = QoS 1 + retained. Follows the VDA5050 spec; the
   broker can emit the `CONNECTIONBROKEN` Last-Will to late subscribers.
8. **MQTT as the central backbone.** Decouples services — each can be
   started, stopped, restarted independently; pub/sub allows multiple
   consumers (e.g. logging taps) without changing publishers.

### Superseded

- **`amr/cmd/raw` envelope + Node-RED routing.** FastAPI now publishes
  VDA5050 messages directly; Node-RED is no longer in the command path.

---

## 12. The knowledge base — where to look next

| Topic                                            | Doc                                                   |
| ------------------------------------------------ | ----------------------------------------------------- |
| What the project is + doc map                    | [`overview.md`](overview.md)                          |
| How services connect, message pathways           | [`architecture.md`](architecture.md)                  |
| Prerequisites and how to run everything          | [`setup.md`](setup.md)                                |
| What is implemented                              | [`status.md`](status.md)                              |
| Gaps tracker                                     | [`gaps.md`](gaps.md)                                  |
| Handoff snapshot — recent work + current state   | [`CONTINUATION.md`](CONTINUATION.md)                  |
| Why key design choices were made                 | [`decisions.md`](decisions.md)                        |
| Domain terms                                     | [`glossary.md`](glossary.md)                          |
| Per-service reference                            | [`services/`](services/)                              |
| Contracts — REST, MQTT, VDA5050, ROS, database   | [`schema/`](schema/)                                  |
| Documentation format standards                   | [`convention/`](convention/)                          |
| Forward-looking plans                            | [`plans/`](plans/)                                    |
| Verifying the stack — automation + manual        | [`testing.md`](testing.md)                            |
| Newman API smoke suite                           | [`postman/`](postman/)                                |
| PowerShell integration scripts                   | `scripts/test/` (+ `scripts/test/README.md`)          |
| Playwright E2E suite                             | `frontend/tests/e2e/` (+ `frontend/tests/README.md`)  |
| Long-form regression checklist (with `[auto:]`)  | [`manual-test-checklist.md`](manual-test-checklist.md) |
| Leftover manual items grouped by service         | [`manual-test-by-service.md`](manual-test-by-service.md) |
| Walkthrough remarks (unsure / bug)               | [`manual-test-remarks.md`](manual-test-remarks.md)    |
| Reference notes from the previous single-robot UI | [`old-interface/`](old-interface/)                    |
| The React frontend                               | `frontend/` (see `frontend/README.md`)                |

When adding endpoints or topics, the contract docs in `docs/schema/` are
the source of truth and must be updated:

- `REST_ENDPOINTS.md` — REST API
- `MQTT_TOPICS.md` — MQTT topics
- `VDA5050_MESSAGES.md` — VDA5050 message schemas
- `ROS_TOPICS.md` — ROS topics exposed by the robot
- `DATABASE_SCHEMA.md` — PostgreSQL schema

Documentation format standards live in `docs/convention/`.

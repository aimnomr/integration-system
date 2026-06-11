# Architecture

The single source for how the AMR Integration System fits together. For *what* the
project is, see [overview.md](overview.md); for *what is built so far*, see
[status.md](status.md).

The system speaks **VDA5050** — the open MQTT interface between a fleet management
system (FMS) and AGVs/AMRs. See [plans/vda5050-migration.md](plans/vda5050-migration.md)
and [schema/VDA5050_MESSAGES.md](schema/VDA5050_MESSAGES.md).

---

## Services

| Service | Tech | Address | Role |
|---|---|---|---|
| **React Frontend** | Vite + React 19 + TS + Tailwind + MUI | `:5173` (dev) | Operator console — commands via REST, telemetry via MQTT-over-WS, camera + teleop via per-robot rosbridge |
| **FastAPI Service** | Python, FastAPI, paho-mqtt | HTTP `:8000` | FMS gateway — publishes VDA5050 orders, serves state/OEE/order history, ingests telemetry, reference-data CRUD |
| **Mosquitto** | Mosquitto MQTT broker | TCP `:1883` + WS `:9001` | Central message broker; TCP for backend services, WS for the browser |
| **Node-RED** | Node-RED | `:1880` | Telemetry sink — ingests `state`/`connection`, audits commands, derives OEE; also a DB Admin tab |
| **ROS Bridge Service** | Node.js, roslib, mqtt | — | Per-robot VDA5050 ↔ ROS bridge (FleetManager + Robot) |
| **PostgreSQL** | PostgreSQL | `:5432` | Persistent storage — state, connection, command audit, OEE, reference data |

MQTT is the central backbone for backend services — they are decoupled and
communicate through Mosquitto topics. Topics are per-robot:
`amr/v2/moverobotic/{serialNumber}/{topic}`.

The browser has **three independent realtime lanes** that bypass each other:
REST (FastAPI), MQTT-over-WS (Mosquitto :9001 — VDA5050 `state` + `connection`),
and rosbridge WebSocket (per robot — `/reference/map`, `/amcl_pose`,
`/camera/front/image_raw/compressed`, `/web_teleop/cmd_vel`, …). Losing one
lane degrades only the features that use it.

---

## Inbound — Commands TO the Robot

```
React / External caller
  ↓ HTTP POST  /robots/{serial}/order | /instant-actions
FastAPI (FMS gateway — builds the VDA5050 message)
  ↓ MQTT publish → amr/v2/moverobotic/{serial}/order | instantActions  (QoS 0)
Mosquitto
  ↓
ROS Bridge Service — FleetManager routes to the Robot; OrderStateMachine
  ↓ WebSocket (rosbridge)
ROS → /move_base_simple/goal | /move_base/cancel → Robot
```

The `OrderStateMachine` sends one node goal at a time, waiting for each
`/move_base/result` before the next — this is the automatic waypoint-advance loop.
There is **no command router** in the middle anymore: FastAPI publishes directly.

---

## Outbound — Data FROM the Robot

```
Robot
  ↓ ROS topics: /amcl_pose, /diff_controller/odom, /move_base/status, /move_base/result
ROS Bridge Service — Robot's StateBuilder + OrderStateMachine
  ↓ MQTT publish → amr/v2/moverobotic/{serial}/state | connection
Mosquitto
  ↓
Node-RED — ingests state/connection, derives OEE cycles
  ↓ HTTP POST  /ingest/state | /ingest/connection | /ingest/oee-cycle
FastAPI  →  PostgreSQL
```

Node-RED also taps `order` / `instantActions` and POSTs them to `/ingest/command` as a
passive audit log — parallel to the command path, it cannot block delivery.

---

## Service Responsibilities

| Service | Does |
|---|---|
| **React Frontend** | Operator console; consumes the REST + MQTT-over-WS + rosbridge contracts. See [services/frontend.md](services/frontend.md) |
| **FastAPI** | FMS gateway — builds & publishes VDA5050 `order`/`instantActions`; serves state/OEE/order history from PostgreSQL; `/ingest/*` writes telemetry; reference-data CRUD. See [services/fastapi-service.md](services/fastapi-service.md) |
| **Node-RED** | Subscribes the VDA5050 telemetry topics, derives OEE, persists via the `/ingest/*` API. DB Admin tab for schema reset + ad-hoc SQL. See [services/node-red.md](services/node-red.md) |
| **ROS Bridge Service** | One `Robot` per registry entry; translates VDA5050 ↔ ROS. See [services/ros-bridge-service.md](services/ros-bridge-service.md) |
| **Mosquitto** | MQTT broker — routes all messages between services (TCP `:1883`) and between Mosquitto and the browser (WS `:9001`) |
| **PostgreSQL** | Persistent storage. See [schema/DATABASE_SCHEMA.md](schema/DATABASE_SCHEMA.md) |

---

## Key Design Points

- Topics are per-robot (`amr/v2/moverobotic/{serial}/...`); adding a robot is a
  database edit (a `robots` row) — no code change. The fleet definition lives in the
  database; FastAPI loads it and the ROS Bridge fetches it via `GET /fleet`.
- Each `Robot` owns its **own MQTT client** so it can register a per-robot Last-Will
  (retained `CONNECTIONBROKEN` on its `connection` topic).
- `order` / `instantActions` are QoS 0; `connection` is QoS 1 and retained.
- The `state` message is published on a significant position/order/error change plus a
  5 s heartbeat (distance >0.05 m or heading >5°).
- Node-RED persists via the FastAPI `/ingest/*` API rather than holding its own
  database connection — a documented refinement of migration plan §5.3.

---

## Contracts (source of truth)

When adding endpoints or topics, update the contract docs in [`schema/`](schema/):

- [schema/REST_ENDPOINTS.md](schema/REST_ENDPOINTS.md) — REST API
- [schema/MQTT_TOPICS.md](schema/MQTT_TOPICS.md) — MQTT topics
- [schema/VDA5050_MESSAGES.md](schema/VDA5050_MESSAGES.md) — VDA5050 message schemas
- [schema/ROS_TOPICS.md](schema/ROS_TOPICS.md) — ROS topics exposed by the robot
- [schema/DATABASE_SCHEMA.md](schema/DATABASE_SCHEMA.md) — PostgreSQL schema

Documentation format standards live in [`convention/`](convention/).

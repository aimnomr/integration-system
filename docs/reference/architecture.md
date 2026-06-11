# Architecture

> **Who this is for:** maintainers and integrators — the terse, complete
> topology. For a gentler, narrated version see the
> [architecture tour](../getting-started/architecture-tour.md).

The system speaks **VDA5050** — the open MQTT interface between a fleet management
system (FMS) and AGVs/AMRs. Message schemas:
[VDA5050_MESSAGES.md](../schema/VDA5050_MESSAGES.md).

---

## Services

| Service | Tech | Address | Role |
|---|---|---|---|
| **React Frontend** | Vite + React 19 + TS + Tailwind + MUI | `:5173` (dev) | Operator console — commands via REST, telemetry via MQTT-over-WS, camera + teleop via per-robot rosbridge |
| **FastAPI Service** | Python, FastAPI, paho-mqtt | HTTP `:8000` | FMS gateway — publishes VDA5050 orders, serves state/OEE/order history, ingests telemetry, reference-data CRUD |
| **Mosquitto** | Mosquitto MQTT broker | TCP `:1883` + WS `:9001` | Central message broker; TCP for backend services, WS for the browser |
| **Node-RED** | Node-RED | `:1880` | Passive viewer — subscribes the VDA5050 telemetry topics for live display only (no DB writes); also a DB Admin tab |
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
FastAPI — subscribes state / connection / order / instantActions over MQTT,
          derives OEE cycles, writes directly to PostgreSQL
  ↓
PostgreSQL
```

**Telemetry persistence lives in FastAPI.** Its own MQTT client subscribes the four
telemetry topics and persists each message via `app/ingest_service.py`
(`app/mqtt.py` is the subscriber; the SQL is in `app/db.py`). The same logic backs
the HTTP `/ingest/*` routes, which are now a secondary path kept for manual
injection, the Node-RED Test Harness, and the smoke suite.

**Node-RED is a passive viewer.** It subscribes the same telemetry topics purely to
display them live (node status + debug sidebar) for development; it no longer writes
to the database. The stack therefore fully functions whether Node-RED is running or
not — see [failure-matrix.md](failure-matrix.md).

---

## Service Responsibilities

| Service | Does |
|---|---|
| **React Frontend** | Operator console; consumes the REST + MQTT-over-WS + rosbridge contracts. See [services/frontend.md](services/frontend.md) |
| **FastAPI** | FMS gateway — builds & publishes VDA5050 `order`/`instantActions`; **subscribes the telemetry topics over MQTT and persists state/connection/command/OEE to PostgreSQL**; serves state/OEE/order history; reference-data CRUD. See [services/fastapi-service.md](services/fastapi-service.md) |
| **Node-RED** | **Passive viewer** — subscribes the VDA5050 telemetry topics for live display only (no DB writes). DB Admin tab for schema reset + ad-hoc SQL. Optional: the stack functions with it off. See [services/node-red.md](services/node-red.md) |
| **ROS Bridge Service** | One `Robot` per registry entry; translates VDA5050 ↔ ROS. See [services/ros-bridge-service.md](services/ros-bridge-service.md) |
| **Mosquitto** | MQTT broker — routes all messages between services (TCP `:1883`) and between Mosquitto and the browser (WS `:9001`) |
| **PostgreSQL** | Persistent storage. See [DATABASE_SCHEMA.md](../schema/DATABASE_SCHEMA.md) |

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
- Telemetry persistence is triggered by FastAPI's own MQTT subscriber
  (`app/mqtt.py` → `app/ingest_service.py` → `app/db.py`), not by Node-RED. This
  makes Node-RED an optional passive viewer (Node-RED previously POSTed to
  `/ingest/*`; see [decisions.md](decisions.md)).

---

## Contracts (source of truth)

When adding endpoints or topics, update the contract docs in
[`docs/schema/`](../schema/):

- [REST_ENDPOINTS.md](../schema/REST_ENDPOINTS.md) — REST API
- [MQTT_TOPICS.md](../schema/MQTT_TOPICS.md) — MQTT topics
- [VDA5050_MESSAGES.md](../schema/VDA5050_MESSAGES.md) — VDA5050 message schemas
- [ROS_TOPICS.md](../schema/ROS_TOPICS.md) — ROS topics exposed by the robot
- [DATABASE_SCHEMA.md](../schema/DATABASE_SCHEMA.md) — PostgreSQL schema

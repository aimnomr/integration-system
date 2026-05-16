# Architecture

The single source for how the AMR Integration System fits together. For *what* the
project is, see [overview.md](overview.md); for *what is built so far*, see
[status.md](status.md).

---

## Services

| Service | Tech | Address | Role |
|---|---|---|---|
| **FastAPI Service** | Python 3.14, FastAPI, paho-mqtt | HTTP `:8000` | REST gateway — validates requests, publishes to MQTT |
| **Mosquitto** | Mosquitto MQTT broker | `:1883` | Central message broker between all services |
| **Node-RED** | Node-RED | `:1880` | Validates & routes `amr/cmd/raw`; state/health/oee handler tabs; future DB logging |
| **ROS Bridge Service** | Node.js, roslib, mqtt | — | Bidirectional ROS ↔ MQTT bridge |
| **PostgreSQL** | PostgreSQL | TBD | Persistent storage (not yet integrated) |

MQTT is the central backbone — every service is decoupled and communicates only
through Mosquitto topics. See [decisions.md](decisions.md) for the rationale.

---

## Inbound — Commands TO the Robot

```
React / External caller
  ↓ HTTP POST
FastAPI
  ↓ MQTT publish → amr/cmd/raw  (QoS 2)
Mosquitto
  ↓
Node-RED  (validates & routes by command type)
  ↓ MQTT publish → amr/cmd/goal | amr/cmd/waypoints | amr/cmd/cancel  (QoS 1)
Mosquitto
  ↓
ROS Bridge Service (roslib.js)
  ↓ WebSocket (rosbridge, ws://localhost:9090)
ROS → /move_base_simple/goal | /move_base/cancel → Robot
```

**Bypass paths** — these are published by FastAPI **directly** to the ROS Bridge
Service and do **not** pass through Node-RED:

- `amr/cmd/waypoints/retry`, `amr/cmd/waypoints/skip`
- `amr/system/connect`, `amr/system/disconnect`

---

## Outbound — Data FROM the Robot

```
Robot
  ↓ ROS topic: /diff_controller/odom
ROS Bridge Service (roslib.js)
  ↓ MQTT publish → amr/state/odom  (QoS 1)
Mosquitto
  ↓
Node-RED
  ↓
PostgreSQL  ← NOT YET IMPLEMENTED
```

> Only `amr/state/odom` is currently published. `amr/state/pose`, `amr/state/nav/*`,
> `amr/health/*`, and `amr/oee/cycle` are defined in the schema and Node-RED has
> handler tabs for them, but the bridge does not publish them yet. See
> [status.md](status.md).

---

## Service Responsibilities

| Service | Does |
|---|---|
| **FastAPI** | REST gateway — validates request bodies, publishes commands to MQTT |
| **Node-RED** | Routes `amr/cmd/raw` → typed command topics; state/health/oee handler tabs (debug only); future DB logging. See [services/node-red.md](services/node-red.md) |
| **ROS Bridge Service** | Executes navigation via ROS; publishes robot state to MQTT. See [services/ros-bridge-service.md](services/ros-bridge-service.md) |
| **Mosquitto** | MQTT broker — routes all messages between services |
| **PostgreSQL** | Persistent storage for state, health, OEE (not yet integrated). See [schema/DATABASE_SCHEMA.md](schema/DATABASE_SCHEMA.md) |

---

## Key Design Points

- `amr/cmd/raw` is QoS 2 (exactly-once) — carries `{ "command": "...", "payload": {...} }`.
- Node-RED routes `amr/cmd/raw` to 3 typed output topics (`amr/cmd/goal`,
  `amr/cmd/waypoints`, `amr/cmd/cancel`) based on the `command` field.
- `amr/state/odom` is published on distance (>0.05 m) or heading (>5°) change, plus a
  5 s heartbeat when stationary.
- The ROS Bridge Service manages waypoint sequencing in memory; retry/skip arrive as
  `amr/cmd/waypoints/retry` and `amr/cmd/waypoints/skip`.
- `POST /system/connect` / `/system/disconnect` publish to `amr/system/connect` /
  `amr/system/disconnect`, which the ROS Bridge Service handles directly (not via
  Node-RED).

---

## Contracts (source of truth)

When adding endpoints or topics, update the contract docs in [`schema/`](schema/):

- [schema/REST_ENDPOINTS.md](schema/REST_ENDPOINTS.md) — REST API
- [schema/MQTT_TOPICS.md](schema/MQTT_TOPICS.md) — MQTT topics
- [schema/ROS_TOPICS.md](schema/ROS_TOPICS.md) — ROS topics exposed by the robot
- [schema/DATABASE_SCHEMA.md](schema/DATABASE_SCHEMA.md) — PostgreSQL schema

Documentation format standards live in [`convention/`](convention/).

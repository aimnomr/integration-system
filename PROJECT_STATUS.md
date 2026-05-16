# Project Status — Integration System

**Date:** 2026-05-15
**Project:** FYP — Robot Integration System
**Directory:** `D:\FYP\integration-system`

---

## What This Project Is

A middleware integration layer that connects a ROS-based mobile robot to a REST API via MQTT messaging. External clients (e.g., a React frontend) send HTTP commands to a FastAPI service, which routes them through MQTT → Node-RED → MQTT → a Node.js ROS bridge that translates them into ROS actions/topics. Robot state (odometry, pose, health) flows in the reverse direction back to MQTT, eventually to be stored in PostgreSQL.

---

## Architecture Overview

### Inbound (Commands TO Robot)
```
React / External Client
  → HTTP POST
  → FastAPI Service
  → MQTT publish: amr/cmd/raw  (QoS 2)
  → Mosquitto Broker
  → Node-RED (routes by command type)
  → MQTT publish: amr/cmd/goal | amr/cmd/waypoints | amr/cmd/cancel  (QoS 1)
  → Mosquitto Broker
  → roslib.js (ROS Bridge Service)
  → WebSocket (rosbridge_server on robot)
  → ROS: /move_base_simple/goal | /move_base/cancel
  → Robot
```

### Outbound (Data FROM Robot)
```
Robot
  → ROS topics (/diff_controller/odom, AMCL pose, battery, etc.)
  → WebSocket (rosbridge_server)
  → roslib.js (ROS Bridge Service)
  → MQTT publish: amr/state/odom | amr/state/pose | amr/health/* | amr/oee/cycle  (QoS 1)
  → Mosquitto Broker
  → Node-RED
  → PostgreSQL  ← NOT YET IMPLEMENTED
```

---

## Services

| Service | Tech | Port / Address | Role |
|---|---|---|---|
| **FastAPI Service** | Python, FastAPI, paho-mqtt | HTTP 8000 | REST gateway |
| **Node-RED** | Node-RED | localhost:1880 | Command router & future DB logger |
| **ROS Bridge Service** | Node.js, roslib, mqtt | — | Bidirectional ROS ↔ MQTT bridge |
| **Mosquitto** | Mosquitto MQTT Broker | localhost:1883 | Central MQTT broker |
| **PostgreSQL** | PostgreSQL | TBD | Persistent storage (not yet integrated) |

---

## MQTT Topics

### Inbound (Commands to Robot)

| Topic | QoS | Direction | Status |
|---|---|---|---|
| `amr/cmd/raw` | 2 | FastAPI → Node-RED | Implemented |
| `amr/cmd/goal` | 1 | Node-RED → roslib.js | Implemented |
| `amr/cmd/waypoints` | 1 | Node-RED → roslib.js | Implemented |
| `amr/cmd/cancel` | 1 | Node-RED → roslib.js | Implemented |
| `amr/cmd/waypoints/retry` | 1 | Node-RED → roslib.js | Implemented |
| `amr/cmd/waypoints/skip` | 1 | Node-RED → roslib.js | Implemented |
| `amr/system/connect` | 1 | FastAPI → roslib.js | Implemented |
| `amr/system/disconnect` | 1 | FastAPI → roslib.js | Implemented |

**`amr/cmd/raw` payload:**
```json
{ "command": "goal" | "waypoints" | "cancel" | "waypoints_retry" | "waypoints_skip", "payload": <object> }
```

### Outbound (Data from Robot)

| Topic | QoS | Direction | Status |
|---|---|---|---|
| `amr/state/odom` | 1 | roslib.js → Node-RED | Implemented |
| `amr/state/pose` | 1 | roslib.js → Node-RED | Not started |
| `amr/state/nav/status` | 1 | roslib.js → Node-RED | Not started |
| `amr/state/nav/progress` | 0 | roslib.js → Node-RED | Not started |
| `amr/health/connection` | 1 | roslib.js → Node-RED | Not started |
| `amr/health/battery` | 1 | roslib.js → Node-RED | Not started |
| `amr/health/error` | 2 | roslib.js → Node-RED | Not started |
| `amr/oee/cycle` | 1 | roslib.js → Node-RED | Not started |

---

## REST Endpoints

| Method | Path | Status |
|---|---|---|
| `POST` | `/amr/goal` | **Implemented** |
| `POST` | `/amr/goal/named` | **Implemented** (hardcoded locations) |
| `POST` | `/amr/waypoints/start` | **Implemented** |
| `POST` | `/amr/waypoints/stop` | **Implemented** |
| `POST` | `/amr/waypoints/retry` | **Implemented** |
| `POST` | `/amr/waypoints/skip` | **Implemented** |
| `POST` | `/amr/cancel` | **Implemented** |
| `POST` | `/system/connect` | **Implemented** |
| `POST` | `/system/disconnect` | **Implemented** |
| `GET` | `/system/status` | **Partial** (MQTT only; roslib/node-red/db unknown) |
| `GET` | `/amr/state` | **Stubbed** (503 — awaiting DB) |
| `GET` | `/amr/health` | **Stubbed** (503 — awaiting DB) |
| `GET` | `/amr/nav/status` | **Stubbed** (503 — awaiting DB) |
| `GET` | `/oee/summary` | **Stubbed** (503 — awaiting DB) |
| `GET` | `/oee/cycles` | **Stubbed** (503 — awaiting DB) |
| `GET` | `/oee/availability` | **Stubbed** (503 — awaiting DB) |

---

## ROS Topics (Robot Side)

| ROS Topic | Direction | Description |
|---|---|---|
| `/move_base_simple/goal` | Publish TO robot | Single navigation goal (geometry_msgs/PoseStamped) |
| `/move_base/cancel` | Publish TO robot | Cancel active goal (actionlib_msgs/GoalID) |
| `/diff_controller/odom` | Subscribe FROM robot | Odometry (nav_msgs/Odometry) |

Full list in `schema/ROS_TOPICS.md`.

---

## Implementation Status

### Done
- [x] FastAPI — all 9 POST command endpoints
- [x] FastAPI — GET /system/status (partial — MQTT status only)
- [x] FastAPI — 6 GET endpoints stubbed with 503 pending DB
- [x] ROS Bridge — bidirectional bridge with auto-reconnect
  - Publishes `amr/state/odom` with throttle (distance/heading threshold + 5s heartbeat)
  - Handles `amr/cmd/goal` → `/move_base_simple/goal`
  - Handles `amr/cmd/waypoints` → sequential goal sending
  - Handles `amr/cmd/cancel` → `/move_base/cancel`
  - Handles `amr/cmd/waypoints/retry` and `amr/cmd/waypoints/skip`
  - Handles `amr/system/connect` and `amr/system/disconnect`
- [x] Node-RED — routing function: `amr/cmd/raw` → 5 typed output topics
- [x] Mosquitto broker — configured on localhost:1883
- [x] Schema documentation — MQTT topics, REST endpoints, ROS topics

### Not Started
- [ ] Outbound MQTT topics — `amr/state/pose`, `amr/state/nav/status`, `amr/state/nav/progress`
- [ ] Health topics — `amr/health/connection`, `amr/health/battery`, `amr/health/error`
- [ ] OEE topic — `amr/oee/cycle`
- [ ] Nav status feedback — detecting when a goal is reached to advance waypoint sequence
- [ ] PostgreSQL integration — no DB code anywhere yet
- [ ] Node-RED → PostgreSQL logging — outbound pipeline stops at Node-RED
- [ ] Named locations from DB — currently hardcoded in FastAPI
- [ ] Authentication / authorization
- [ ] Tests — zero test coverage
- [ ] Docker / docker-compose
- [ ] Structured logging

---

## File Structure

```
integration-system/
├── PROJECT_STATUS.md
├── COMMUNICATION_PATHWAY.md
├── CLAUDE.md
├── .gitignore
├── convention/
│   ├── MQTT_TOPICS_CONVENTION.md
│   └── REST_ENDPOINTS_CONVENTION.md
├── schema/
│   ├── MQTT_TOPICS.md
│   ├── REST_ENDPOINTS.md
│   └── ROS_TOPICS.md
├── fastapi-service/
│   ├── main.py               ← 16 endpoints, all REST commands implemented
│   ├── .env
│   └── venv/
├── ros-bridge-service/
│   ├── index.js              ← bidirectional bridge, waypoint manager, dynamic connect
│   ├── package.json
│   └── .env
├── node-red/
│   ├── flows.json            ← routing function, 5 typed output topics
│   ├── settings.js
│   └── package.json
└── mosquitto/
    └── mosquitto.conf
```

---

## Environment Variables

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

---

## Key Gaps Remaining

1. **Nav feedback loop** — roslib.js has no mechanism to detect goal success/failure yet; waypoint sequencing advances manually (retry/skip only), not automatically
2. **Outbound topics** — pose, nav status/progress, health, OEE are not yet subscribed or published
3. **PostgreSQL** — entire persistence layer missing; all GET endpoints return 503
4. **Named locations** — hardcoded in FastAPI; should eventually come from DB

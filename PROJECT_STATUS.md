# Project Status — Integration System

**Date:** 2026-05-15  
**Project:** FYP — Robot Integration System  
**Directory:** `D:\FYP\integration-system`

---

## What This Project Is

A middleware integration layer that connects a ROS-based mobile robot to a REST API via MQTT messaging. External clients (e.g., a React frontend) send HTTP commands to a FastAPI service, which routes them through MQTT → Node-RED → MQTT → a Node.js ROS bridge that translates them into ROS topics. Robot state (odometry, pose) flows in the reverse direction back to MQTT, eventually to be stored in PostgreSQL.

---

## Architecture Overview

### Inbound (Commands TO Robot)
```
React / External Client
  → HTTP POST
  → FastAPI Service
  → MQTT publish: robot/cmd/raw  (QoS 2)
  → Mosquitto Broker
  → Node-RED (validation / transformation)
  → MQTT publish: robot/cmd  (QoS 1)
  → Mosquitto Broker
  → roslib.js (ROS Bridge Service)
  → WebSocket (rosbridge_server on robot)
  → ROS topic: /web_teleop/cmd_vel
  → Robot
```

### Outbound (Data FROM Robot)
```
Robot
  → ROS topic: /diff_controller/odom
  → WebSocket (rosbridge_server)
  → roslib.js (ROS Bridge Service)
  → MQTT publish: robot/odom  (QoS 1)
  → Mosquitto Broker
  → Node-RED
  → PostgreSQL  ← NOT YET IMPLEMENTED
```

---

## Services

| Service | Tech | Port / Address | Role |
|---|---|---|---|
| **FastAPI Service** | Python, FastAPI, paho-mqtt | HTTP (default 8000) | REST gateway — validates & forwards commands to MQTT |
| **Node-RED** | Node-RED | localhost:1880 | Message router & transformer, future DB logging |
| **ROS Bridge Service** | Node.js, roslib, mqtt | — | Bidirectional ROS ↔ MQTT bridge |
| **Mosquitto** | Mosquitto MQTT Broker | localhost:1883 | Central MQTT broker |
| **PostgreSQL** | PostgreSQL | TBD | Persistent storage for robot state/telemetry |

---

## MQTT Topics

| Topic | QoS | Direction | Status |
|---|---|---|---|
| `robot/cmd/raw` | 2 | FastAPI → Node-RED | Implemented |
| `robot/cmd` | 1 | Node-RED → roslib.js | Implemented |
| `robot/odom` | 1 | roslib.js → Node-RED | Implemented |

**Payload format — `robot/cmd/raw` and `robot/cmd`:**
```json
{
  "command": "teleop" | "move" | "cancel",
  "linear_x": <float>,
  "angular_z": <float>
}
```

**Payload format — `robot/odom`:**
```json
{
  "timestamp": <string>,
  "position": { "x": <float>, "y": <float>, "z": <float> },
  "orientation": { "x": <float>, "y": <float>, "z": <float>, "w": <float> },
  "linear_velocity": <float>,
  "angular_velocity": <float>
}
```

---

## REST Endpoints

| Method | Path | Status | Description |
|---|---|---|---|
| `POST` | `/robot/teleop` | **Implemented** | Send velocity command (linear_x, angular_z) |
| `POST` | `/robot/move` | **Not implemented** | Send single navigation goal |
| `POST` | `/robot/waypoint` | **Not implemented** | Send ordered waypoint sequence |
| `POST` | `/robot/cancel` | **Not implemented** | Cancel current active goal |
| `GET` | `/system/status` | **Not implemented** | Get service connection status |
| `GET` | `/robot/state` | **Not implemented** | Get current robot pose |

---

## ROS Topics (Robot Side)

The robot exposes 137 ROS topics via rosbridge. Key topics used by this system:

| ROS Topic | Direction | Description |
|---|---|---|
| `/web_teleop/cmd_vel` | Publish TO robot | Velocity commands (geometry_msgs/Twist) |
| `/diff_controller/odom` | Subscribe FROM robot | Odometry data (nav_msgs/Odometry) |

Full list in `schema/ROS_TOPICS.md`.

---

## Implementation Status

### Done
- [x] FastAPI service — `/robot/teleop` endpoint working, publishes to `robot/cmd/raw`
- [x] ROS Bridge Service — full bidirectional bridge, auto-reconnect on disconnect
  - Subscribes: `/diff_controller/odom` (ROS) → publishes `robot/odom` (MQTT)
  - Subscribes: `robot/cmd` (MQTT) → publishes `/web_teleop/cmd_vel` (ROS)
- [x] Node-RED flow — subscribes `robot/cmd/raw`, forwards to `robot/cmd`
- [x] Mosquitto broker — configured and running on localhost:1883
- [x] Schema documentation — MQTT topics, REST endpoints, ROS topics all documented
- [x] Convention files — formatting standards for MQTT & REST docs

### In Progress / Partial
- [ ] **Node-RED command validation** — flow exists but the function node is empty (just passes msg through with no validation logic)
- [ ] **REST endpoint schemas** — 5 of 6 endpoints defined in schema but have no code in FastAPI

### Not Started
- [ ] FastAPI — `POST /robot/move` (navigation goal)
- [ ] FastAPI — `POST /robot/waypoint` (waypoint sequence)
- [ ] FastAPI — `POST /robot/cancel` (cancel goal)
- [ ] FastAPI — `GET /system/status` (health/connection check)
- [ ] FastAPI — `GET /robot/state` (current robot pose)
- [ ] PostgreSQL integration — no DB code anywhere yet
- [ ] Node-RED → PostgreSQL logging — outbound pipeline stops at Node-RED
- [ ] Error handling — minimal across all services (FastAPI, roslib.js)
- [ ] Authentication / authorization — none
- [ ] Rate limiting — none in FastAPI
- [ ] Health checks / monitoring — no service status tracking
- [ ] Tests — no test files exist in any service
- [ ] Docker / docker-compose — no containerization setup
- [ ] Logging — only basic console.log / print statements

---

## File Structure

```
integration-system/
├── PROJECT_STATUS.md                  ← this file
├── COMMUNICATION_PATHWAY.md           ← architecture diagram
├── convention/
│   ├── MQTT_TOPICS_CONVENTION.md      ← MQTT doc format spec
│   └── REST_ENDPOINTS_CONVENTION.md   ← REST doc format spec
├── schema/                            ← source of truth for contracts
│   ├── MQTT_TOPICS.md
│   ├── REST_ENDPOINTS.md
│   └── ROS_TOPICS.md                  ← 137 ROS topics from robot
├── wiki/                              ← generated/expanded documentation
│   ├── MQTT_TOPICS.md
│   └── REST_ENDPOINTS.md
├── fastapi-service/
│   ├── main.py                        ← 34 lines, 1 endpoint implemented
│   ├── .env                           ← MQTT_BROKER=localhost, MQTT_PORT=1883
│   └── venv/
├── ros-bridge-service/
│   ├── index.js                       ← 93 lines, full bidirectional bridge
│   ├── package.json
│   └── .env                           ← ROSBRIDGE_URL, MQTT_BROKER
├── node-red/
│   ├── flows.json                     ← 1 flow, 6 nodes, empty validator
│   ├── settings.js
│   └── package.json
└── mosquitto/
    └── mosquitto.conf                 ← minimal config
```

---

## Environment Variables

**FastAPI Service (`fastapi-service/.env`):**
```
MQTT_BROKER=localhost
MQTT_PORT=1883
```

**ROS Bridge Service (`ros-bridge-service/.env`):**
```
ROSBRIDGE_URL=ws://localhost:9090
MQTT_BROKER=mqtt://localhost:1883
```

---

## Key Gaps to Address

1. **5 unimplemented REST endpoints** — move, waypoint, cancel, status, state
2. **Node-RED validation logic** — function node needs to validate/sanitize commands before forwarding
3. **PostgreSQL integration** — entire outbound data persistence pipeline missing
4. **Error handling** — services crash or silently fail on bad input or connection drops
5. **No tests** — zero test coverage across all services
6. **No containerization** — all services run manually, no Docker setup
7. **No auth** — REST API is open with no authentication

---

## Notes for Planning

- The core communication pipeline (teleop command end-to-end) is working.
- The system assumes all services run on localhost — deployment to separate hosts will require env var updates.
- ROS bridge uses roslib over WebSocket (rosbridge_server must be running on the robot at port 9090).
- Node-RED is the natural place for validation, transformation, and DB logging — but currently it only passes messages through.
- Schema files in `schema/` are the source of truth; `wiki/` files are the human-readable expanded versions.

# Communication Pathway
> Last updated: May 2026

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
roslib.js
  ↓ WebSocket (rosbridge)
Robot
```

> **Note:** `waypoints/retry`, `waypoints/skip`, `system/connect`, and `system/disconnect`
> are published by FastAPI **directly** to roslib.js (`amr/cmd/waypoints/retry`,
> `amr/cmd/waypoints/skip`, `amr/system/connect`, `amr/system/disconnect`) — they bypass
> Node-RED.

## Outbound — Data FROM the Robot

```
Robot
  ↓ WebSocket (rosbridge)
roslib.js
  ↓ MQTT publish → amr/state/odom  (QoS 1)
Mosquitto
  ↓
Node-RED
  ↓
PostgreSQL  ← NOT YET IMPLEMENTED
```

> **Note:** Only `amr/state/odom` is currently published. `amr/state/pose`,
> `amr/state/nav/*`, `amr/health/*`, and `amr/oee/cycle` are defined in the schema and
> Node-RED has handler tabs for them, but the bridge does not publish them yet.

---

## Service Responsibilities

| Service | Does |
|---|---|
| **FastAPI** | REST gateway — validates requests, publishes to `amr/cmd/raw` |
| **Node-RED** | Routes `amr/cmd/raw` to typed command topics; has state/health/oee handler tabs (debug only); future DB logging |
| **roslib.js** | Executes navigation commands via ROS; publishes robot state to MQTT |
| **Mosquitto** | MQTT broker — routes all messages between services |
| **PostgreSQL** | Persistent storage for state, health, OEE data (not yet integrated) |
| **React** | User interface — sends commands to FastAPI via REST |

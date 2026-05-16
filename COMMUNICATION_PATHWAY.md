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

## Outbound — Data FROM the Robot

```
Robot
  ↓ WebSocket (rosbridge)
roslib.js
  ↓ MQTT publish → amr/state/odom | amr/state/pose | amr/health/* | amr/oee/cycle  (QoS 1)
Mosquitto
  ↓
Node-RED
  ↓
PostgreSQL  ← NOT YET IMPLEMENTED
```

---

## Service Responsibilities

| Service | Does |
|---|---|
| **FastAPI** | REST gateway — validates requests, publishes to `amr/cmd/raw` |
| **Node-RED** | Routes `amr/cmd/raw` to typed command topics; future DB logging |
| **roslib.js** | Executes navigation commands via ROS; publishes robot state to MQTT |
| **Mosquitto** | MQTT broker — routes all messages between services |
| **PostgreSQL** | Persistent storage for state, health, OEE data (not yet integrated) |
| **React** | User interface — sends commands to FastAPI via REST |

# Communication Pathway
> Last updated: May 2026

---

## Inbound — Commands TO the Robot
React / External caller
↓ HTTP POST
FastAPI
↓ MQTT publish → robot/cmd/raw
Mosquitto
↓
Node-RED
↓ MQTT publish → robot/cmd
Mosquitto
↓
roslib.js
↓ WebSocket (rosbridge)
Robot

## Outbound — Data FROM the Robot
  Robot
    ↓ WebSocket (rosbridge)
roslib.js
    ↓ MQTT publish → robot/odom, robot/pose, etc.
Mosquitto
    ↓
Node-RED
    ↓
PostgreSQL

---

## Service Responsibilities
| Service | Does |
|---|---|
| roslib.js | Persistent ROS connection, executes commands, publishes robot state to MQTT |
| FastAPI | REST gateway, validates and forwards commands to MQTT |
| Node-RED | Message routing, logging bridge between MQTT and database |
| Mosquitto | MQTT broker, routes all messages between services |
| PostgreSQL | Persistent storage of all operational and state data |
| React | User interface, sends commands to FastAPI via REST |
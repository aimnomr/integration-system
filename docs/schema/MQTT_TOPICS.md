# MQTT Topics

VDA5050 topic hierarchy. Every topic follows
`{interfaceName}/{majorVersion}/{manufacturer}/{serialNumber}/{topic}` — for this
project `amr/v2/moverobotic/{serialNumber}/{topic}`.

Full message schemas: [VDA5050_MESSAGES.md](VDA5050_MESSAGES.md). The legacy `amr/cmd/*`,
`amr/state/*`, `amr/health/*` and `amr/system/*` topics have been **removed**.

## Broker listeners

Mosquitto exposes two listeners on the same topic tree:

| Port | Protocol | Used by |
|---|---|---|
| 1883 | MQTT over TCP | FastAPI, Node-RED, ROS Bridge — all backend services |
| 9001 | MQTT over WebSockets | Browser frontend (`mqtt.js`) — subscribes to `state` and `connection` directly |

Both listeners are anonymous (`allow_anonymous true`) and share the broker's
retained-message store, so the WebSocket subscriber receives the same retained
`connection` messages as TCP clients. Securing them (TLS + credentials) is a
deployment concern beyond the FYP scope.

## Table of Contents

**Inbound (Commands to Robot)**
- [amr/v2/moverobotic/{serialNumber}/order](#amrv2moveroboticserialnumberorder)
- [amr/v2/moverobotic/{serialNumber}/instantActions](#amrv2moveroboticserialnumberinstantactions)

**Outbound (Data from Robot)**
- [amr/v2/moverobotic/{serialNumber}/state](#amrv2moveroboticserialnumberstate)
- [amr/v2/moverobotic/{serialNumber}/connection](#amrv2moveroboticserialnumberconnection)

---

## Inbound (Commands to Robot)

### amr/v2/moverobotic/{serialNumber}/order

**Direction:** FastAPI → Mosquitto → ROS Bridge Service  
**QoS:** 0  
**Purpose:** Carries a navigation order — a graph of nodes the robot visits in `sequenceId` order; published when a client submits an order via the FMS gateway.

**Message Format:**
```json
{
  "headerId": <integer>,
  "timestamp": <string>,
  "version": "2.0.0",
  "manufacturer": <string>,
  "serialNumber": <string>,
  "orderId": <string>,
  "orderUpdateId": <integer>,
  "nodes": [
    {
      "nodeId": <string>,
      "sequenceId": <integer>,
      "released": <boolean>,
      "nodePosition": { "x": <float>, "y": <float>, "theta": <float>, "mapId": <string> },
      "actions": <array>
    }
  ],
  "edges": [
    {
      "edgeId": <string>,
      "sequenceId": <integer>,
      "released": <boolean>,
      "startNodeId": <string>,
      "endNodeId": <string>,
      "actions": <array>
    }
  ]
}
```

---

### amr/v2/moverobotic/{serialNumber}/instantActions

**Direction:** FastAPI → Mosquitto → ROS Bridge Service  
**QoS:** 0  
**Purpose:** Carries actions that take effect immediately, independent of the current order; published when a client requests cancel, retry, or skip.

**Message Format:**
```json
{
  "headerId": <integer>,
  "timestamp": <string>,
  "version": "2.0.0",
  "manufacturer": <string>,
  "serialNumber": <string>,
  "actions": [
    {
      "actionId": <string>,
      "actionType": "cancelOrder" | "retryNode" | "skipNode",
      "blockingType": "NONE" | "SOFT" | "HARD",
      "actionParameters": <array>
    }
  ]
}
```

---

## Outbound (Data from Robot)

### amr/v2/moverobotic/{serialNumber}/state

**Direction:** ROS Bridge Service → Mosquitto → Node-RED  
**QoS:** 0  
**Purpose:** The consolidated robot state snapshot; published on a significant position/order/error change plus a 5 s heartbeat.

**Message Format:**
```json
{
  "headerId": <integer>,
  "timestamp": <string>,
  "version": "2.0.0",
  "manufacturer": <string>,
  "serialNumber": <string>,
  "orderId": <string>,
  "orderUpdateId": <integer>,
  "lastNodeId": <string>,
  "lastNodeSequenceId": <integer>,
  "nodeStates": <array>,
  "edgeStates": <array>,
  "actionStates": <array>,
  "agvPosition": { "x": <float>, "y": <float>, "theta": <float>, "mapId": <string>, "positionInitialized": <boolean> },
  "velocity": { "vx": <float>, "vy": <float>, "omega": <float> },
  "driving": <boolean>,
  "operatingMode": "AUTOMATIC",
  "errors": <array>,
  "safetyState": { "eStop": "NONE" | "AUTOACK" | "MANUAL", "fieldViolation": <boolean> }
}
```

---

### amr/v2/moverobotic/{serialNumber}/connection

**Direction:** ROS Bridge Service → Mosquitto → Node-RED  
**QoS:** 1  
**Purpose:** Reports robot liveness; published **retained** — `ONLINE` on rosbridge connect, `OFFLINE` on graceful shutdown, `CONNECTIONBROKEN` emitted by the broker as the Last-Will if the bridge process dies.

**Message Format:**
```json
{
  "headerId": <integer>,
  "timestamp": <string>,
  "version": "2.0.0",
  "manufacturer": <string>,
  "serialNumber": <string>,
  "connectionState": "ONLINE" | "OFFLINE" | "CONNECTIONBROKEN"
}
```

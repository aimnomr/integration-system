# VDA5050 Messages

The message and topic contract for the VDA5050 migration
([../plans/vda5050-migration.md](../plans/vda5050-migration.md)).

> **Status:** Phase 0 contract — **agreed, not yet implemented.** This file is the
> source of truth for the four VDA5050 messages and the topic hierarchy. The legacy
> `amr/*` scheme is still live; see [MQTT_TOPICS.md](MQTT_TOPICS.md). MQTT_TOPICS.md is
> rewritten against this contract in migration Phases 2–3.

This project implements a **structural subset** of VDA5050 2.0.0 — real topic
hierarchy, real envelopes, real `order` / `instantActions` / `state` / `connection`
structures; edges and actions kept minimal. See [§ Deviations](#deviations-from-vda5050)
for where this project knowingly departs from the standard.

---

## Table of Contents

- [Topic Hierarchy](#topic-hierarchy)
- [Shared Header](#shared-header)
- [order](#order) — FMS → AGV
- [instantActions](#instantactions) — FMS → AGV
- [state](#state) — AGV → FMS
- [connection](#connection) — AGV → FMS
- [Robot Registry — robots.config.json](#robot-registry--robotsconfigjson)
- [Deviations from VDA5050](#deviations-from-vda5050)

---

## Topic Hierarchy

Every topic follows the VDA5050 pattern:

```
{interfaceName}/{majorVersion}/{manufacturer}/{serialNumber}/{topic}
```

For this project the leading segments are fixed:

| Segment | Value | Notes |
|---|---|---|
| `interfaceName` | `amr` | VDA5050's examples use `uagv`; `interfaceName` is a configurable label, `amr` is used for project consistency. |
| `majorVersion` | `v2` | VDA5050 version `2.0.0`. |
| `manufacturer` | `moverobotic` | Fixed for this fleet. |
| `serialNumber` | `amr001`, `amr002`, … | Assigned incrementally per robot. |

So a concrete topic is `amr/v2/moverobotic/amr001/order`. Adding a second robot
(`amr002`) is **configuration, not code** — see
[robots.config.json](#robot-registry--robotsconfigjson).

| Topic | Direction | QoS | Retained | Purpose |
|---|---|---|---|---|
| `order` | FMS → AGV | 0 | no | Navigation order — a graph of nodes to visit. |
| `instantActions` | FMS → AGV | 0 | no | Immediate actions (cancel / retry / skip). |
| `state` | AGV → FMS | 0 | no | Full robot state snapshot. |
| `connection` | AGV → FMS | 1 | **yes** | `ONLINE` / `OFFLINE` / `CONNECTIONBROKEN`. |

The `connection` topic is **retained** so a late-joining subscriber immediately learns
the robot's liveness, and carries the `CONNECTIONBROKEN` value as the MQTT Last-Will so
the broker emits it automatically if the bridge process dies. The `visualization` and
`factsheet` topics are **out of scope** (see the migration plan §3.3, §2).

---

## Shared Header

Every VDA5050 message — `order`, `instantActions`, `state`, `connection` — carries
these five header fields. They are shown as `...header...` in the message bodies below.

```json
{
  "headerId": <integer>,
  "timestamp": "<ISO 8601 string>",
  "version": "2.0.0",
  "manufacturer": "<string>",
  "serialNumber": "<string>"
}
```

- `headerId` — increments **per topic, per robot**. Each robot keeps an independent
  counter for each topic it publishes.
- `timestamp` — ISO 8601, the moment the message was created.
- `version` — the VDA5050 protocol version string, fixed at `2.0.0`.
- `manufacturer` / `serialNumber` — identify the robot; match the topic segments.

---

## order

**Direction:** FastAPI (FMS) → Mosquitto → ros-bridge-service
**Topic:** `amr/v2/{manufacturer}/{serialNumber}/order`
**QoS:** 0
**Purpose:** Carries a navigation order — a graph of nodes the robot should visit. A
single goal is an order with one node; a waypoint sequence is an order with N nodes.

```json
{
  "headerId": <integer>,
  "timestamp": "<ISO 8601 string>",
  "version": "2.0.0",
  "manufacturer": "<string>",
  "serialNumber": "<string>",
  "orderId": "<string>",
  "orderUpdateId": <integer>,
  "nodes": [
    {
      "nodeId": "<string>",
      "sequenceId": <integer>,
      "released": <boolean>,
      "nodePosition": {
        "x": <float>,
        "y": <float>,
        "theta": <float>,
        "mapId": "<string>"
      },
      "actions": <array>
    }
  ],
  "edges": [
    {
      "edgeId": "<string>",
      "sequenceId": <integer>,
      "released": <boolean>,
      "startNodeId": "<string>",
      "endNodeId": "<string>",
      "actions": <array>
    }
  ]
}
```

**Subset rules:**
- A **single goal** = an order with **one** node.
- A **waypoint sequence** = an order with **N** nodes; `edges` are auto-generated to
  connect consecutive nodes. `actions` arrays are left empty (`[]`) initially.
- `theta` is the heading in **radians, map frame** — it replaces the legacy Euler
  `angle.z` (degrees).
- `mapId` identifies the map the coordinates belong to; sourced from
  [robots.config.json](#robot-registry--robotsconfigjson).

**ROS translation:** each released node, in `sequenceId` order, becomes one
`/move_base_simple/goal` (`geometry_msgs/PoseStamped`). The order state machine waits
for the `move_base` result before sending the next node.

---

## instantActions

**Direction:** FastAPI (FMS) → Mosquitto → ros-bridge-service
**Topic:** `amr/v2/{manufacturer}/{serialNumber}/instantActions`
**QoS:** 0
**Purpose:** Carries actions that take effect immediately, independent of the current
order — cancelling, retrying, or skipping.

```json
{
  "headerId": <integer>,
  "timestamp": "<ISO 8601 string>",
  "version": "2.0.0",
  "manufacturer": "<string>",
  "serialNumber": "<string>",
  "actions": [
    {
      "actionId": "<string>",
      "actionType": "cancelOrder" | "retryNode" | "skipNode",
      "blockingType": "NONE" | "SOFT" | "HARD",
      "actionParameters": <array>
    }
  ]
}
```

**Action types in scope:**

| actionType | ROS effect | Replaces legacy |
|---|---|---|
| `cancelOrder` | publish `/move_base/cancel` | `amr/cmd/cancel` |
| `retryNode` *(custom)* | re-send the current node's goal | `amr/cmd/waypoints/retry` |
| `skipNode` *(custom)* | advance to the next node and send its goal | `amr/cmd/waypoints/skip` |

`retryNode` / `skipNode` are **custom** instantActions — see
[§ Deviations](#deviations-from-vda5050).

---

## state

**Direction:** ros-bridge-service → Mosquitto → Node-RED (and FastAPI)
**Topic:** `amr/v2/{manufacturer}/{serialNumber}/state`
**QoS:** 0
**Purpose:** The single consolidated telemetry message — replaces all legacy
`amr/state/*` and `amr/health/*` topics and feeds OEE derivation.

```json
{
  "headerId": <integer>,
  "timestamp": "<ISO 8601 string>",
  "version": "2.0.0",
  "manufacturer": "<string>",
  "serialNumber": "<string>",
  "orderId": "<string>",
  "orderUpdateId": <integer>,
  "lastNodeId": "<string>",
  "lastNodeSequenceId": <integer>,
  "nodeStates": <array>,
  "edgeStates": <array>,
  "actionStates": <array>,
  "agvPosition": {
    "x": <float>,
    "y": <float>,
    "theta": <float>,
    "mapId": "<string>",
    "positionInitialized": <boolean>
  },
  "velocity": {
    "vx": <float>,
    "vy": <float>,
    "omega": <float>
  },
  "driving": <boolean>,
  "operatingMode": "AUTOMATIC",
  "errors": <array>,
  "safetyState": {
    "eStop": "NONE" | "AUTOACK" | "MANUAL",
    "fieldViolation": <boolean>
  }
}
```

**ROS → state mapping:**

| state field | ROS source |
|---|---|
| `agvPosition` | `/amcl_pose` (map-frame pose; available in `mapping:=false` mode) |
| `velocity`, `driving` | `/diff_controller/odom` |
| `orderId`, `lastNodeId`, `nodeStates`, `actionStates` | order state machine (in-process) |
| nav progress / completion | `/move_base/result`, `/move_base/status` |
| `safetyState.eStop` | `/e_stop`, `/error_stop`, `/bumper_stop` |
| `errors` | `/safety/error*` topics + bridge-detected faults |
| `operatingMode` | static `AUTOMATIC` |

**Publish trigger:** on significant change (position / order / error) **plus** a 5 s
heartbeat — the same distance/heading throttle the legacy `odom` bridge uses.

> `batteryState` is intentionally **omitted** — see [§ Deviations](#deviations-from-vda5050).

---

## connection

**Direction:** ros-bridge-service → Mosquitto → Node-RED (and FastAPI)
**Topic:** `amr/v2/{manufacturer}/{serialNumber}/connection`
**QoS:** 1
**Purpose:** Reports the robot's liveness to the FMS. Published **retained**.

```json
{
  "headerId": <integer>,
  "timestamp": "<ISO 8601 string>",
  "version": "2.0.0",
  "manufacturer": "<string>",
  "serialNumber": "<string>",
  "connectionState": "ONLINE" | "OFFLINE" | "CONNECTIONBROKEN"
}
```

- `ONLINE` — published when the bridge's rosbridge connection is up.
- `OFFLINE` — published on graceful shutdown of the bridge.
- `CONNECTIONBROKEN` — set as the MQTT **Last-Will** message; the broker emits it
  automatically if the bridge process dies without a clean disconnect.

---

## Robot Registry — robots.config.json

The fleet is defined by `ros-bridge-service/robots.config.json`. Adding a robot is an
edit to this file — no code change. The ros-bridge-service `FleetManager` reads it at
startup and instantiates one `Robot` per entry.

```json
{
  "interfaceName": "amr",
  "majorVersion": "v2",
  "version": "2.0.0",
  "manufacturer": "moverobotic",
  "robots": [
    {
      "serialNumber": "amr001",
      "rosbridgeUrl": "ws://localhost:9090",
      "mapId": "default"
    }
  ]
}
```

| Field | Scope | Notes |
|---|---|---|
| `interfaceName` | fleet | Leading topic segment — `amr`. |
| `majorVersion` | fleet | Topic segment — `v2`. |
| `version` | fleet | VDA5050 `version` header value — `2.0.0`. |
| `manufacturer` | fleet | Topic segment + header field — `moverobotic`. |
| `robots[].serialNumber` | robot | Topic segment + header field; unique per robot. |
| `robots[].rosbridgeUrl` | robot | The robot's rosbridge WebSocket URL. |
| `robots[].mapId` | robot | Map identifier for positions on `order` / `state`. |

> **`mapId` is a placeholder (`"default"`).** The robot currently loads an
> auto-generated map name (e.g. `cropped_12p5`) that is not stable, so a meaningful
> value cannot be fixed yet. Set this to the real map name once one is established —
> it is a single config value with no code impact. (Migration plan open question §9-B.)

---

## Deviations from VDA5050

This project deliberately departs from strict VDA5050 in three documented places:

1. **`batteryState` omitted.** VDA5050 lists `batteryState` as a mandatory field of
   `state`. The robot exposes no battery/charge ROS topic and a synthetic stub is not
   wanted, so the field is omitted entirely.
2. **Custom `retryNode` / `skipNode` actions.** VDA5050 has no native retry/skip; the
   standard approach is order updates with a higher `orderUpdateId`, which requires the
   full order-update merge and horizon semantics. To keep the codebase simple, retry
   and skip are modelled as custom `instantActions` — one action, one clear effect.
3. **`visualization` and `factsheet` topics dropped.** The React UI reads live pose
   directly from rosbridge (migration plan §3.3), so `visualization` would duplicate
   data; `factsheet` is out of scope.

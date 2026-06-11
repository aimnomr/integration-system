# Refactor Plan: VDA5050 Migration

> Status: **Implemented** — all phases (0–7) completed 2026-05-17. Code-complete and
> syntax-checked; end-to-end runtime testing pending (needs MQTT, rosbridge, a robot,
> and PostgreSQL). This document is a planning artifact kept for the design record.

---

## 1. Goal & Context

Re-architect the AMR Integration System so its communication model **reflects the
VDA5050 standard** — the open MQTT-based interface between a fleet management system
(FMS) and AGVs/AMRs.

Two hard constraints shape every decision below:

1. **The robot's internal software is not touched.** All VDA5050 behaviour is added
   as an *external adapter layer*. The robot keeps speaking plain ROS; the
   ros-bridge-service translates.
2. **The codebase must scale from one robot to many.** VDA5050 is fleet-native — its
   topic hierarchy already namespaces per robot — so the VDA5050 refactor and the
   multi-robot refactor are largely the *same work*.

---

## 2. Confirmed Decisions

These were agreed during planning. Listed here so they can be verified.

| Decision | Choice |
|---|---|
| Order-model fidelity | **Structural subset** — real VDA5050 topic hierarchy, real message envelopes, real `order`/`state`/`instantActions`/`connection` structures; `order` carries node positions used like waypoints; edges/actions kept minimal. |
| ros-bridge-service runtime | **Single process with a robot registry** — one process holds a `FleetManager` with a `Map<serial, Robot>`; each `Robot` owns its own rosbridge connection + order state. |
| Topic migration | **Replace `amr/*` entirely** with the VDA5050 hierarchy. No parallel scheme. |
| Component roles | **FastAPI = FMS gateway** (publishes `order`/`instantActions` directly); **Node-RED = state ingestion + persistence** _(later demoted to passive viewer 2026-06-09 — FastAPI now ingests; see §5.3 note)_, command-routing role removed. |
| `visualization` topic | **Out of scope** — see §3.3; React reads live pose directly from rosbridge. |
| `factsheet` topic | **Out of scope.** |

---

## 3. Target Architecture

### 3.1 VDA5050 Topic Hierarchy

All topics follow:

```
{interfaceName}/{majorVersion}/{manufacturer}/{serialNumber}/{topic}
```

For this project the segments are fixed as:

- `interfaceName` = **`amr`** — VDA5050's own examples use `uagv`, but `interfaceName`
  is a configurable label; `amr` is used here for project consistency.
- `majorVersion` = **`v2`** (VDA5050 version `2.0.0`).
- `manufacturer` = **`moverobotic`**.
- `serialNumber` = assigned incrementally — `amr001`, `amr002`, …

So a topic looks like `amr/v2/moverobotic/amr001/order`. Adding a second robot
(`amr002`) is **configuration, not code**.

| Topic | Direction | QoS | Retained | Purpose |
|---|---|---|---|---|
| `order` | FMS → AGV | 0 | no | Navigation order (graph of nodes) |
| `instantActions` | FMS → AGV | 0 | no | Immediate actions (cancel, etc.) |
| `state` | AGV → FMS | 0 | no | Full robot state snapshot |
| `connection` | AGV → FMS | 1 | **yes** | ONLINE / OFFLINE / CONNECTIONBROKEN |

(VDA5050 specifies QoS 0 for high-rate topics and a retained `connection` topic.)

### 3.2 Component Pipeline

```
Inbound (commands):
  React UI ──HTTP──> FastAPI (FMS gateway)
                       └─MQTT─> amr/v2/{mfr}/{serial}/order | instantActions
                                  └─> ros-bridge-service (FleetManager → Robot)
                                        └─> rosbridge WebSocket ─> ROS ─> Robot

Outbound (telemetry):
  Robot ─ROS─> rosbridge ─> ros-bridge-service (Robot → state builder)
                              └─MQTT─> amr/v2/{mfr}/{serial}/state | connection
                                         └─> Node-RED ─> PostgreSQL (keyed by serial)
```

### 3.3 The Direct High-Frequency Path (out of the VDA5050 pathway)

The React interface runs its **own** roslib instance and connects **directly** to the
robot's rosbridge for high-frequency data — **teleop, camera stream, live pose**.
This bypasses MQTT entirely.

Consequence: the VDA5050 `visualization` topic (whose only job is feeding a live map)
would duplicate data the UI already gets directly — so it is **dropped**. The
integration pathway still publishes the lower-rate, comprehensive `state` topic for
the FMS and persistence.

```
React UI ──roslib (direct)──> robot rosbridge   [teleop, camera, live pose]
React UI ──HTTP──> FastAPI ──MQTT──> ...         [orders, instantActions, state]
```

So there are **two roslib instances** in the system: one in React (direct, high-freq),
one in ros-bridge-service (the VDA5050 pathway).

---

## 4. VDA5050 Message Design (structural subset)

### 4.1 Shared Header

Every VDA5050 message carries:

```json
{
  "headerId": <integer>,        // increments per topic, per robot
  "timestamp": "<ISO 8601>",
  "version": "2.0.0",
  "manufacturer": "<string>",
  "serialNumber": "<string>"
}
```

### 4.2 `order` (FMS → AGV)

```json
{
  "...header...": "",
  "orderId": "<string>",
  "orderUpdateId": <integer>,
  "nodes": [
    {
      "nodeId": "<string>",
      "sequenceId": <integer>,
      "released": <boolean>,
      "nodePosition": { "x": <float>, "y": <float>, "theta": <float>, "mapId": "<string>" },
      "actions": []
    }
  ],
  "edges": [
    {
      "edgeId": "<string>",
      "sequenceId": <integer>,
      "released": <boolean>,
      "startNodeId": "<string>",
      "endNodeId": "<string>",
      "actions": []
    }
  ]
}
```

**Subset simplifications:**
- A **single goal** = an order with **one** node.
- A **waypoint sequence** = an order with **N** nodes (edges auto-generated to connect
  consecutive nodes; `actions` arrays left empty initially).
- `theta` (radians, map frame) replaces the current Euler `angle.z`.

**ROS translation:** each released node, in `sequenceId` order, becomes one
`/move_base_simple/goal` (`geometry_msgs/PoseStamped`). The order state machine waits
for the move_base result before sending the next node — this finally closes the
**automatic waypoint-advance feedback loop** that is missing today.

### 4.3 `instantActions` (FMS → AGV)

```json
{
  "...header...": "",
  "actions": [
    {
      "actionId": "<string>",
      "actionType": "<string>",
      "blockingType": "NONE | SOFT | HARD",
      "actionParameters": []
    }
  ]
}
```

Action types in scope:

| actionType | ROS effect | Replaces |
|---|---|---|
| `cancelOrder` | publish `/move_base/cancel` | `amr/cmd/cancel`, waypoints/stop |
| `retryNode` *(custom)* | re-send current node goal | `amr/cmd/waypoints/retry` |
| `skipNode` *(custom)* | advance to next node, send goal | `amr/cmd/waypoints/skip` |

> **Design decision:** VDA5050 has no native retry/skip. The "pure" VDA5050 way is
> order updates (re-sending the order with a higher `orderUpdateId`), which requires
> implementing the full order-update merge and horizon semantics. To keep the codebase
> simple and easy for a future maintainer, retry/skip are implemented as **custom
> instantActions** (`retryNode` / `skipNode`) — one action, one clear effect. This is
> a deliberate, documented deviation from strict VDA5050.

### 4.4 `state` (AGV → FMS)

The single consolidated telemetry message. Replaces all of today's `amr/state/*`,
`amr/health/*`, and feeds `amr/oee/*`.

```json
{
  "...header...": "",
  "orderId": "<string>",
  "orderUpdateId": <integer>,
  "lastNodeId": "<string>",
  "lastNodeSequenceId": <integer>,
  "nodeStates": [ ... ],
  "edgeStates": [ ... ],
  "actionStates": [ ... ],
  "agvPosition": { "x": <float>, "y": <float>, "theta": <float>,
                   "mapId": "<string>", "positionInitialized": <boolean> },
  "velocity": { "vx": <float>, "vy": <float>, "omega": <float> },
  "driving": <boolean>,
  "operatingMode": "AUTOMATIC",
  "errors": [ ... ],
  "safetyState": { "eStop": "NONE | AUTOACK | MANUAL", "fieldViolation": <boolean> }
}
```

> `batteryState` is intentionally **omitted** from this message — see §8.

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

Publish trigger: on significant change (position/order/error) **plus** a periodic
heartbeat — reuses the existing odom throttle logic (distance/heading thresholds + 5 s
heartbeat).

### 4.5 `connection` (AGV → FMS)

```json
{ "...header...": "", "connectionState": "ONLINE | OFFLINE | CONNECTIONBROKEN" }
```

- Published **retained**, QoS 1.
- `ONLINE` when the bridge's rosbridge connection is up; `OFFLINE` on graceful
  shutdown.
- `CONNECTIONBROKEN` is set as the MQTT **Last-Will** message, so the broker emits it
  automatically if the bridge process dies.

---

## 5. Component-by-Component Changes

### 5.1 `ros-bridge-service` — heaviest change

Today: module-level singletons (`currentRos`, `waypointQueue`, `lastOdomMsg`, …) —
cannot scale. Refactor into per-robot objects.

**New structure (extends the existing `src/` layout):**

```
src/
  fleetManager.js   # Map<serial, Robot>; one MQTT client; wildcard subscribe;
                    # demux amr/v2/+/+/{order,instantActions} by serial
  robot.js          # Robot class: owns rosConnection + odom + orderStateMachine
                    #              + state/connection publishers, scoped to one serial
  orderStateMachine.js  # tracks orderId/orderUpdateId, nodeStates, actionStates,
                        #   lastNodeId; drives move_base node-by-node;
                        #   consumes /move_base/result + /move_base/status
  stateBuilder.js   # assembles the VDA5050 `state` message + headerId counter
  vda5050.js        # topic-name helpers, header builder, message validators
  rosConnection.js  # (existing) now instantiated per Robot
  odomBridge.js     # (existing) now feeds stateBuilder instead of amr/state/odom
  mqttClient.js     # (existing) shared; configure Last-Will for connection topic
robots.config.json  # registry: [{ manufacturer, serialNumber, rosbridgeUrl }]
```

- `index.js` stays slim: load `robots.config.json`, create `FleetManager`.
- The `Robot` class is the core scalability primitive: instantiate N of them, done.

### 5.2 `fastapi-service` — becomes the FMS gateway

- **Robot-scoped routes** replace the flat `/amr/*` and `/system/*`:
  - `GET  /robots` — list registered robots
  - `POST /robots/{serial}/order` — submit an order (single goal or sequence)
  - `POST /robots/{serial}/instant-actions` — cancel / retry / skip
  - `GET  /robots/{serial}/state` — latest state (from DB / retained message)
- `app/mqtt.py`: replace `publish_raw()` with VDA5050 builders — `build_order()`,
  `build_instant_actions()` — publishing to `amr/v2/{mfr}/{serial}/...`.
- New robot registry module (which serials exist + rosbridge URLs + manufacturer);
  config file initially, PostgreSQL later.
- `headerId` / `orderId` / `orderUpdateId` counters per robot.
- Named locations (`data.py`) kept — a named location resolves to a one-node order.

### 5.3 `node-red` — command routing removed

- **Delete** the `Command Router` tab — the FMS now publishes `order`/`instantActions`
  directly; a router in the middle is not VDA5050 and is a fleet bottleneck.
- **Replace** the per-topic State/Health/OEE handler tabs with:
  - `state` ingestion: subscribe `amr/v2/+/+/state`, parse, persist (keyed by serial).
  - `connection` ingestion: subscribe `amr/v2/+/+/connection`, persist.
- **Command-side logging:** add `mqtt in` nodes subscribed to `amr/v2/+/+/order` and
  `amr/v2/+/+/instantActions`, wired to PostgreSQL inserts, to log every command.
  Because MQTT is publish/subscribe, these nodes are a **passive tap** — they sit
  *parallel* to the command path, not in series. They observe a copy of each message;
  delivery to the robot is unaffected, and Node-RED being down cannot block or delay a
  command. The `+` wildcards capture every robot at once. The same pattern extends to
  any topic you later want to audit.
- OEE trip cycles are **derived** from order-completion transitions in `state`.

### 5.4 `mosquitto`

No broker config change. Retained messages and Last-Will are client-side concerns
(set by ros-bridge-service).

### 5.5 PostgreSQL

Every table keyed by `(manufacturer, serial_number)`: `state_snapshots`,
`connection_log`, `order_log`, `error_log`, `oee_cycles`.

### 5.6 `schema/` documentation

- `MQTT_TOPICS.md` → rewritten as the VDA5050 topic contract.
- `REST_ENDPOINTS.md` → rewritten for robot-scoped routes.
- New `schema/VDA5050_MESSAGES.md` → the four message schemas.
- `convention/` files are **immutable** — a new convention may be needed if the
  existing format does not fit; to be discussed.

---

## 6. Phased Implementation Roadmap

Each phase is independently reviewable. The system is kept runnable between phases
where practical.

| Phase | Scope | Outcome |
|---|---|---|
| ✅ **0. Foundations** | Define the 4 message schemas, `robots.config.json` format, topic naming. Write `schema/VDA5050_MESSAGES.md`. | Agreed contract. **Done 2026-05-17.** |
| ✅ **1. Robot abstraction** | Refactor ros-bridge-service singletons into `Robot` + `FleetManager`. Behaviour unchanged, still one robot. | Per-robot code structure. **Done 2026-05-17.** |
| ✅ **2. Inbound VDA5050** | `order` + `instantActions` parsing, `OrderStateMachine` driving move_base node-by-node with result feedback. Remove `amr/cmd/*`. | Robot navigates from VDA5050 orders; auto waypoint advance works. **Done 2026-05-17.** |
| ✅ **3. Outbound VDA5050** | `stateBuilder` + `connection` (with Last-Will). Remove `amr/state/*`, `amr/health/*`. | Full state telemetry on VDA5050 topics. **Done 2026-05-17.** |
| ✅ **4. FMS gateway** | FastAPI robot-scoped routes, VDA5050 builders, robot registry. | REST → VDA5050 end to end. **Done 2026-05-17.** |
| ✅ **5. Node-RED rework** | Drop Command Router; add `state`/`connection` ingestion. | Telemetry processing aligned. **Done 2026-05-17.** |
| ✅ **6. Persistence** | PostgreSQL tables keyed by serial; Node-RED writes; FastAPI GET reads. | State/OEE queryable. **Done 2026-05-17.** |
| ✅ **7. Multi-robot proof** | Add a 2nd robot via config only; verify isolation and fleet-wide views. | Scalability demonstrated. **Done 2026-05-17.** |

Recommended starting point: **Phase 1** (the `Robot` refactor) — it unblocks
everything else and carries no behaviour risk.

---

## 7. What Is Explicitly NOT Changing

- The robot's ROS software / internal program.
- The React ↔ rosbridge direct path for teleop / camera / live pose (§3.3).
- Mosquitto broker configuration.
- The roslib library choice and the move_base navigation interface
  (`/move_base_simple/goal`, `/move_base/cancel`).

---

## 8. Known Constraints

- **No battery data — `batteryState` removed.** The robot exposes no battery/charge
  ROS topic, and a synthetic stub is not wanted. `batteryState` is therefore **omitted
  from the `state` message entirely**. VDA5050 lists `batteryState` as a mandatory
  field, so this is a deliberate, documented deviation from the standard.
- **VDA5050 has no retry/skip** — handled via custom instantActions (§4.3).
- **`convention/` files are immutable** — the documentation rewrite in §5.6 may need a
  new convention rather than editing the existing ones.

## 8a. Deviations made during implementation

- **Per-robot MQTT client (deviation from §5.1).** §5.1 proposed a single shared MQTT
  client. MQTT permits only one Last-Will per connection, and the `connection` topic
  needs a per-robot retained `CONNECTIONBROKEN` Will — so each `Robot` owns its own MQTT
  client and subscribes its own `order`/`instantActions` topics. This is also cleaner
  per-robot isolation than a shared client + wildcard demux.
- **Node-RED persists via the FastAPI `/ingest/*` API (refinement of §5.3).** §5.3
  proposed Node-RED writing to PostgreSQL directly. No PostgreSQL Node-RED contrib node
  is installed; rather than depend on an uninstalled node, Node-RED POSTs each message
  to FastAPI `/ingest/*`, which owns the SQL (`app/db.py`). Node-RED remains the
  ingestion and OEE-derivation layer — only the final INSERT moved one hop, into the
  service that already owns the database connection.
  _(Superseded 2026-06-09: FastAPI's own MQTT subscriber now ingests and derives OEE
  via `app/ingest_service.py`; Node-RED is a passive viewer. See decisions.md.)_
- **`amr/system/connect|disconnect` dropped.** The rosbridge URL is now fixed
  configuration (`robots.config.json`); the bridge auto-connects and auto-reconnects,
  so manual connect/disconnect commands no longer apply.

---

## 9. Open Questions

### Resolved during review

| # | Question | Decision |
|---|---|---|
| 1 | VDA5050 version | `v2` major segment; `version` string `2.0.0` |
| 2 | `factsheet` | Out of scope |
| 3 | `manufacturer` / `serialNumber` | `moverobotic` / incremental `amr001`, `amr002`, … |
| 4 | `interfaceName` | `amr` (instead of VDA5050's `uagv`) |
| 5 | retry/skip modelling | Custom `retryNode` / `skipNode` instantActions (§4.3) |
| 6 | Robot registry source | Config file now, PostgreSQL later |
| 7 | `batteryState` | Removed entirely (§8) |
| 8 | AGV pose source for `state.agvPosition` | `/amcl_pose` — see below |

**§9-A — AGV pose source (resolved).**
VDA5050 needs a **map-frame** pose. When the robot runs in `mapping:=false`
(localization + navigation) mode it runs AMCL and publishes `/amcl_pose`
(`geometry_msgs/PoseWithCovarianceStamped`) — the map-localised pose. The bridge
subscribes to `/amcl_pose` for `state.agvPosition`. Note: `/amcl_pose` is **not**
available in `mapping:=true` (SLAM) mode; the integration assumes the robot runs in
`mapping:=false` mode. See [../schema/ROS_TOPICS.md](../schema/ROS_TOPICS.md).

**§9-B — `mapId` (resolved).**
VDA5050 positions require a map identifier — a configured string in
`robots.config.json`. The robot currently loads an auto-generated, non-stable map name
(e.g. `cropped_12p5`), so no meaningful value can be fixed yet. `mapId` is set to the
placeholder `"default"`; set it to the real map name once one is established (single
config value, no code impact).

### Still open

_None._

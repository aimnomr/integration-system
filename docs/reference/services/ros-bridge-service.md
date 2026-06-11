# Service Reference: ros-bridge-service

> As-built reference for the current implementation (VDA5050).

The bridge translates between VDA5050 MQTT messages and ROS. It is **fleet-capable**:
a `FleetManager` runs one isolated `Robot` per robot in the fleet definition, which it
fetches from FastAPI's `GET /fleet` at startup (the database is the single source of
truth).

## Structure

```
ros-bridge-service/
├── index.js                  # entry — fetch GET /fleet, start FleetManager
└── src/
    ├── logger.js             # structured JSON logger (no dependency)
    ├── vda5050.js            # topic helpers, HeaderFactory, message validators
    ├── mqttClient.js         # createMqttClient({ will }) factory
    ├── fleetManager.js       # FleetManager — Map<serial, Robot>
    ├── robot.js              # Robot — one robot's full lifecycle
    ├── rosConnection.js      # RosConnection — rosbridge WebSocket + auto-reconnect
    ├── orderStateMachine.js  # OrderStateMachine — drives move_base from VDA5050 orders
    ├── stateBuilder.js       # StateBuilder — assembles + publishes the `state` message
    ├── odomBridge.js         # OdomBridge — /diff_controller/odom → motion
    └── poseBridge.js         # PoseBridge — /amcl_pose → agvPosition
```

## Module Responsibilities

### `index.js`
Validates `MQTT_BROKER`, fetches the fleet definition from `FLEET_API_URL`
(FastAPI's `GET /fleet`, default `http://localhost:8000/fleet`), and starts a
`FleetManager` with it. Exits with a clear error if the fetch fails — so FastAPI must
be running first.

### `src/fleetManager.js` — `FleetManager`
Takes the fleet config object, instantiates one `Robot` per `robots[]` entry into a
`Map<serialNumber, Robot>`, and starts each. Registers SIGINT/SIGTERM → graceful
`stop()` of every robot.

### `src/robot.js` — `Robot`
One robot's whole world. Owns its **own MQTT client** (with a per-robot
`CONNECTIONBROKEN` Last-Will), a `HeaderFactory`, the 4 VDA5050 topic names, a
`RosConnection`, `OrderStateMachine`, `StateBuilder`, `OdomBridge`, `PoseBridge`.
Subscribes `order` + `instantActions`; publishes `connection` (`ONLINE`/`OFFLINE`).

### `src/rosConnection.js` — `RosConnection`
Manages one rosbridge WebSocket with 3 s auto-reconnect. Surfaces connect/disconnect
/error via callbacks (no direct dependency on health/state modules).

### `src/orderStateMachine.js` — `OrderStateMachine`
Accepts a VDA5050 `order`, drives `/move_base_simple/goal` node-by-node (waits for each
`/move_base/result` before the next — the auto-advance loop), and applies
`instantActions` (`cancelOrder`/`retryNode`/`skipNode`). `snapshot()` exposes the
order-related fields of the `state` message. Replaces the former `navigation.js` +
`navFeedback.js`.

### `src/stateBuilder.js` — `StateBuilder`
Assembles and publishes the consolidated VDA5050 `state` message. Inputs are pushed in
by the bridges and the order state machine; publishes on significant position/order/
error change plus a 5 s heartbeat.

### `src/odomBridge.js` / `src/poseBridge.js`
`OdomBridge` feeds `velocity`/`driving` from `/diff_controller/odom`. `PoseBridge` feeds
`agvPosition` from `/amcl_pose` (map-frame, `mapping:=false` mode); its distance/heading
throttle is the main `state` publish trigger.

### `src/vda5050.js`
`buildTopic()`, `parseTopic()`, `HeaderFactory` (per-robot, per-topic `headerId`
counter + shared-header builder), `isValidOrder()`, `isValidInstantActions()`.

### `src/mqttClient.js`
`createMqttClient({ will })` — connects an MQTT client, optionally with a Last-Will.
One client per robot (MQTT permits only one Will per connection).

## Key Design Decisions

- **One `Robot` instance per robot** — the scalability primitive. Adding a robot is a
  database edit (a `robots` row), no code change.
- **Per-robot MQTT client** — needed for a per-robot retained `CONNECTIONBROKEN`
  Last-Will (MQTT allows only one Last-Will per connection); see
  [decisions.md](../decisions.md).
- The `OrderStateMachine` sends one node goal at a time and waits for the move_base
  result — `SUCCEEDED` advances, `ABORTED`/`PREEMPTED` pauses for retry/skip.
- All collaborators take `ros` / dependencies explicitly — no module singletons.

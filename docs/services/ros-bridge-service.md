# Service Reference: ros-bridge-service

> As-built reference for the current implementation.

## Structure

```
ros-bridge-service/
├── index.js              # entry point — wires everything together
└── src/
    ├── logger.js         # structured JSON logger (no dependency)
    ├── mqttClient.js     # MQTT singleton (connect, subscribe)
    ├── rosConnection.js  # ROS lifecycle: connect / reconnect / disconnect
    ├── health.js         # publishes amr/health/connection and amr/health/error
    ├── odomBridge.js     # /diff_controller/odom → amr/state/odom
    ├── poseBridge.js     # /amcl_pose → amr/state/pose
    ├── navFeedback.js    # /move_base status+result → amr/state/nav/status
    └── navigation.js     # MQTT → ROS navigation (waypoint queue + auto-advance)
```

## Module Responsibilities

### `src/logger.js`
- Structured logger — emits one JSON object per line (`{ts, level, service, msg, …}`).
- Level filtered by the `LOG_LEVEL` env var (`debug`/`info`/`warn`/`error`).

### `src/mqttClient.js`
- Creates and exports the `mqtt.connect()` singleton; subscribes to command topics.

### `src/rosConnection.js`
- Owns `currentRos`, `rosbridgeUrl`, `shouldReconnect` state.
- Exports: `createRosConnection({onConnect, onDisconnect})`, `reconnectRos(url)`, `disconnectRos()`, `getRos()`.
- Publishes `amr/health/connection` (via `health.js`) on connect/close.

### `src/health.js`
- Exports `publishConnection(connected, url)` and `reportError(type, message, source)`.
- Publishes `amr/health/connection` and `amr/health/error`.

### `src/odomBridge.js`
- Subscribes `/diff_controller/odom`; publishes `amr/state/odom` (distance/heading throttle + 5 s heartbeat).
- Exports: `setupOdomSubscription(ros, mqttClient)`, `teardownOdom()`.

### `src/poseBridge.js`
- Subscribes `/amcl_pose` (available in `mapping:=false` mode); publishes `amr/state/pose` with the same throttle pattern as odomBridge.
- Exports: `setupPoseSubscription(ros, mqttClient)`, `teardownPose()`.

### `src/navFeedback.js`
- Subscribes `/move_base/status` and `/move_base/result`; maps actionlib status codes to the schema enum; publishes `amr/state/nav/status`.
- Invokes an `onResult(status)` callback so `navigation.js` can advance a waypoint sequence.
- Exports: `setupNavFeedback(ros, mqttClient, onResult)`, `teardownNavFeedback()`.

### `src/navigation.js`
- Owns `waypointQueue`, `currentWaypointIdx`, `sequenceActive` (private).
- Exports: `sendGoal(ros, data)`, `startWaypoints(ros, data)`, `cancelGoal(ros)`, `retryWaypoint(ros)`, `skipWaypoint(ros)`, `resetWaypoints()`, `handleGoalResult(ros, status)`.
- `handleGoalResult` auto-advances the sequence on a `SUCCEEDED` result and publishes `amr/state/nav/progress`.

### `index.js`
Purely wiring:
1. Import `mqttClient` → subscribe to command topics.
2. `createRosConnection` with an `onConnect` that sets up odom, pose, and nav-feedback subscriptions.
3. MQTT `message` handler: dispatch to `navigation.*` or `rosConnection.*` by topic.

## Dependency Graph (no cycles)

```
index.js
  ├── logger.js          (no deps)
  ├── mqttClient.js      ←── logger
  ├── rosConnection.js   ←── logger, health
  ├── health.js          ←── mqttClient, logger
  ├── odomBridge.js      ←── logger        (mqttClient injected per call)
  ├── poseBridge.js      ←── logger        (mqttClient injected per call)
  ├── navFeedback.js     ←── logger        (mqttClient injected per call)
  └── navigation.js      ←── mqttClient, logger   (ros injected per call)
```

## Key Design Decisions

- `navigation.js` and the bridge modules take `ros` as a per-call argument — explicit dependency, testable.
- `navFeedback.js` is decoupled from `navigation.js`: it invokes an injected `onResult` callback rather than importing the navigation module.
- The waypoint sequence auto-advances on a `SUCCEEDED` move_base result; `ABORTED`/`PREEMPTED` pauses it for manual retry/skip.

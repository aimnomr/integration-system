# Service Reference: ros-bridge-service

> As-built reference for the current implementation.

## Structure

```
ros-bridge-service/
├── index.js              # entry point — wires everything together
└── src/
    ├── mqttClient.js     # MQTT singleton (connect, subscribe)
    ├── rosConnection.js  # ROS lifecycle: connect / reconnect / disconnect
    ├── odomBridge.js     # ROS → MQTT odometry (throttle state lives here)
    └── navigation.js     # MQTT → ROS navigation (waypoint queue lives here)
```

## Module Responsibilities

### `src/mqttClient.js`
- Creates and exports the `mqtt.connect()` singleton.
- No other logic — other modules import it as a dependency.

### `src/rosConnection.js`
- Owns `currentRos`, `rosbridgeUrl`, `shouldReconnect` state.
- Exports: `createRosConnection(onConnect)`, `reconnectRos(url)`, `disconnectRos()`, `getRos()`.
- Accepts an `onConnect(ros)` callback so `index.js` can hook in `setupOdomSubscription` without rosConnection knowing about odom.

### `src/odomBridge.js`
- Owns `lastPos`, `lastYaw`, `lastOdomMsg`, `heartbeatHandle` (all private to the module).
- Exports: `setupOdomSubscription(ros, mqttClient)`.
- Called once per ROS connection; teardown happens automatically on ROS close.

### `src/navigation.js`
- Owns `waypointQueue`, `currentWaypointIdx` (private).
- Exports: `sendGoal(ros, data)`, `startWaypoints(ros, data)`, `cancelGoal(ros)`, `retryWaypoint(ros)`, `skipWaypoint(ros)`, `resetWaypoints()`.
- Takes `ros` as a parameter on each call — no coupling to `rosConnection.js`.
- Queue reset on disconnect handled via callback from `index.js`.

### `index.js` (slimmed down ~40 lines)
Purely wiring:
1. Import mqttClient → subscribe to topics.
2. `createRosConnection({ onConnect: ros => setupOdomSubscription(ros, mqttClient) })`
3. MQTT `message` handler: dispatch to `navigation.*` or `rosConnection.*` based on topic.

## Dependency Graph (no cycles)

```
index.js
  ├── mqttClient.js         (no deps)
  ├── rosConnection.js      (no deps)
  ├── odomBridge.js    ←── mqttClient (injected via parameter)
  └── navigation.js         (no deps, ros injected per-call)
```

## Key Design Decisions

- `navigation.js` functions all take `ros` as a first argument — explicit dependency, testable.
- `disconnectRos` needs to reset the waypoint queue; `index.js` passes a cleanup callback to avoid a cycle between `rosConnection.js` and `navigation.js`.

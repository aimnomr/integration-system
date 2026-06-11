# Single-Robot Web Interface — Project Overview

> A handoff reference for the **current state** of this codebase, intended to carry forward into a next-version rewrite without losing functionality. Snapshot taken on branch `waypoint-nav`.

---

## 1. Purpose

A browser-based dashboard for teleoperating and monitoring a single ROS robot over a WebSocket connection. The frontend is a React SPA that talks to `rosbridge_suite` (default `ws://<robot-ip>:9090`), subscribing to map/camera/pose topics and publishing teleop and navigation goals.

**Target user**: A robot operator on the same network as the robot.
**Scope**: Single robot only. No fleet support, no authentication, no persistence across sessions.

---

## 2. Tech Stack (verified against `package.json`)

| Layer            | Technology                              |
|------------------|-----------------------------------------|
| Build            | Vite ^8.0.9                             |
| UI               | React ^19.2.5 (no StrictMode — commented out in `main.jsx`) |
| Routing          | react-router-dom ^7.14.1                |
| Styling          | Tailwind CSS ^4.2.3 + `@tailwindcss/vite` |
| Component libs   | `@headlessui/react` ^2.2.10 (modals, disclosure), `@mui/material` ^9 (Skeleton only), `@heroicons/react` ^2.2.0 |
| ROS (npm)        | `roslib` ^2.1.0                         |
| ROS (CDN)        | `roslib@1`, `ros2d@0`, `easeljs@1`, `eventemitter2@6` (loaded in `index.html`) |

> **Critical gotcha**: Two versions of roslib are loaded at runtime — `roslib@2` from npm (used by all hooks), and `roslib@1` from CDN (required by `ros2djs`). `main.jsx` exposes `window.ROSLIB = <npm v2>` so `ros2djs` interops with the same connection instance. A v2 rewrite should pick one path: stay on `ros2djs` (and keep the CDN bundle) or replace `Ros2DMapView` with a canvas/WebGL renderer and drop ros2d entirely.

---

## 3. Architecture

### Entry & context

```
index.html  →  /src/main.jsx  →  <RosProvider><App /></RosProvider>
```

- `main.jsx`: creates React root, wraps in `<RosProvider>`, **exposes `window.ROSLIB`** for ros2djs interop. StrictMode is commented out.
- `App.jsx`: `BrowserRouter` with three routes — `/`, `/dashboard`, `/robots` — all under a shared `<Layout />`.
- `RosProvider` (`src/hooks/ROS/ROSProvider.jsx`): single source of truth for connection. Exposes via `useRos()`:

  | Field              | Type              | Description |
  |--------------------|-------------------|-------------|
  | `ros`              | `ROSLIB.Ros\|null` | Active instance (null when disconnected) |
  | `status`           | `boolean`         | True while WebSocket is open |
  | `url`              | `string\|null`    | Currently-connected URL |
  | `connect(url)`     | function          | Opens a new connection (closes any existing one first) |
  | `disconnect()`     | function          | Closes and resets all state |
  | `connectionError`  | `string\|null`    | `'Failed to connect'` (on error event) or `'Connection closed'` (on close before a connection event) |
  | `clearError()`     | function          | Resets `connectionError` to null |

  **No auto-reconnect.** Errors are surfaced immediately via the error dialog in `Layout`.

### Routes

| Path         | Component   | Status                                |
|--------------|-------------|---------------------------------------|
| `/`          | `Dashboard` | Placeholder ("Overview dashboard will be displayed here.") |
| `/dashboard` | `Dashboard` | Same placeholder                       |
| `/robots`    | `Robots`    | Main functional page                   |

Navbar links (`src/pages/config/routes.js`) are `Robot` (`/robots`) and `Dashboard` (`/dashboard`). CLAUDE.md mentioned `/team` and `/locations` — these no longer exist.

### `Robots` page layout (the only working page)

```
!ros  →  <SkeletonRobot />
ros   →
        ┌───────────────────────────────────────────────────────┐
        │ Ros2dMapView           │ RobotView (camera)            │
        │  (640×640, ros2djs)    │ GoalSelector (4 hardcoded     │
        │                        │   waypoints + Cancel Nav)     │
        │                        │ (AMCLPoseView commented out)  │
        ├────────────────────────┴───────────────────────────────┤
        │ RobotControl (3×3 teleop) │ WaypointNav (mission runner)│
        └────────────────────────────────────────────────────────┘
```

---

## 4. File Map (current — supersedes CLAUDE.md)

### Entry / config
| Path                              | Purpose                                                   |
|-----------------------------------|-----------------------------------------------------------|
| `index.html`                      | HTML shell + CDN script tags for `easeljs`, `eventemitter2`, `roslib@1`, `ros2d@0` |
| `src/main.jsx`                    | React root, `RosProvider` wrap, `window.ROSLIB` export    |
| `src/App.jsx`                     | Router (3 routes under `Layout`)                          |
| `src/index.css`                   | `@import "tailwindcss"`                                   |
| `vite.config.js`                  | Vite + react + tailwindcss plugins                        |
| `src/pages/config/routes.js`      | `navLinks` array (Robot, Dashboard)                       |
| `src/pages/config/mock-data.js`   | Hardcoded waypoint list (see §7)                          |

### Components (`src/components/`)
| File                  | Purpose                                                                                   |
|-----------------------|-------------------------------------------------------------------------------------------|
| `Layout.jsx`          | Navbar, connection status pill, Connect/Disconnect button, error dialog. Wraps `<Outlet />`. |
| `ConnectDialog.jsx`   | Modal to enter WS URL (default `ws://localhost:9090`).                                    |
| `SkeletonRobot.jsx`   | MUI-Skeleton placeholder mirroring the Robots page layout. **Out of date** — does not mirror Ros2DMapView or WaypointNav. |
| `MapView.jsx`         | **Unused.** Custom canvas renderer for raw `nav_msgs/OccupancyGrid` (Y-flipped). Kept as a reference / fallback. |
| `Ros2DMapView.jsx`    | **Active map view.** ros2djs `Viewer` (640×640) + `OccupancyGridClient` + path overlays + robot arrow. |
| `RobotView.jsx`       | `<img>` displaying base64 JPEG from `/camera/front/image_raw/compressed`.                 |
| `AMCLPoseView.jsx`    | Displays `{px, py, qz, qw, rz}`. **Currently commented out in `Robots.jsx`**.             |
| `RobotControl.jsx`    | 3×3 teleop pad with keyboard + mouse handling (touch disabled).                            |
| `GoalSelector.jsx`    | Buttons for each `mockLocationList` entry + a "Cancel Nav" button.                        |
| `WaypointNav.jsx`     | UI for sequential waypoint mission (start/stop/skip/retry + log).                         |
| `List.jsx`            | **Unused** generic list component (legacy).                                               |

### Hooks (`src/hooks/ROS/`)
| File                       | Returns                                                              | Topic / Action |
|----------------------------|----------------------------------------------------------------------|----------------|
| `ROSContext.js`            | `createContext(null)`                                                | —              |
| `ROSProvider.jsx`          | provider value (see §3)                                              | —              |
| `useROS.js`                | `useContext(RosContext)` → `useRos()`                                | —              |
| `useMap.js`                | `{ width, height, resolution, origin, data }` or `null`              | sub `/reference/map` (`nav_msgs/OccupancyGrid`) |
| `useCamera.js`             | `data:image/jpeg;base64,...` string or `null`                        | sub `/camera/front/image_raw/compressed` (`sensor_msgs/CompressedImage`) |
| `useAMCLPose.js`           | `{ px, py, qz, qw, rz }` — **all strings** (`.toFixed(3)`)           | sub `/amcl_pose` (`geometry_msgs/PoseWithCovarianceStamped`) |
| `useOdom.js`               | `{ position: {x,y,z}, orientation: {x,y,z,w} }` — raw floats          | sub `/robot_pose_ekf_node/odom_combined` (`geometry_msgs/PoseWithCovarianceStamped`) |
| `useDWAPlannerGlobal.js`   | raw `nav_msgs/Path` msg                                              | sub `/move_base_node/DWAPlannerROS/global_plan` |
| `useDWAPlannerLocal.js`    | raw `nav_msgs/Path` msg                                              | sub `/move_base_node/DWAPlannerROS/local_plan` |
| `useTeleop.js`             | `{ publish(linearX, angularZ), stop() }`                              | pub `/web_teleop/cmd_vel` (`geometry_msgs/Twist`) |
| `useMoveBase.js`           | `{ publish(point, angle, callbacks), cancelAll() }` + exports `GOAL_STATUS` | action client `/move_base` (`move_base_msgs/MoveBaseAction`) |
| `useWaypointNav.js`        | `{ waypoints, navStatus, currentIdx, logs, progress, start, stop, retry, skip, is* }` + exports `NAV_STATUS` | uses `useMoveBase` + sub `/move_base/result` |

### Helpers (`src/helper/`)
| File                    | Exports                                              |
|-------------------------|------------------------------------------------------|
| `conditionalHelper.js`  | `conditionalHelper(...classes)` → space-joined string of truthy classes |
| `angleHelper.js`        | `quaternionToEuler(q)` → degrees; `eulerToQuaternion(q)` accepts degrees |

### Pages (`src/pages/`)
- `Dashboard.jsx` — placeholder header + paragraph.
- `Robots.jsx` — wires together every active component (see §3).

---

## 5. ROS Contract — what the robot side must provide

The interface will not function unless the robot exposes the following over rosbridge:

### Subscribed by the UI
| Topic                                              | Type                                          | Used by                       |
|----------------------------------------------------|-----------------------------------------------|-------------------------------|
| `/reference/map`                                   | `nav_msgs/OccupancyGrid`                      | `useMap`, `Ros2DMapView` (via `OccupancyGridClient`) |
| `/camera/front/image_raw/compressed`               | `sensor_msgs/CompressedImage` (JPEG)          | `useCamera`                   |
| `/amcl_pose`                                       | `geometry_msgs/PoseWithCovarianceStamped`     | `useAMCLPose` (currently rendered nowhere — kept available) |
| `/robot_pose_ekf_node/odom_combined`               | `geometry_msgs/PoseWithCovarianceStamped`     | `useOdom` → robot arrow on map |
| `/move_base_node/DWAPlannerROS/global_plan`        | `nav_msgs/Path`                               | `useDWAPlannerGlobal` → blue path |
| `/move_base_node/DWAPlannerROS/local_plan`         | `nav_msgs/Path`                               | `useDWAPlannerLocal` → red path |
| `/move_base/result`                                | `move_base_msgs/MoveBaseActionResult`         | `useWaypointNav` (mission state machine) |

### Published by the UI
| Topic / Action                | Type                                          | Used by                          |
|-------------------------------|-----------------------------------------------|----------------------------------|
| `/web_teleop/cmd_vel`         | `geometry_msgs/Twist`                         | `useTeleop` (RobotControl)       |
| `/move_base` (action server)  | `move_base_msgs/MoveBaseAction`               | `useMoveBase` (GoalSelector + WaypointNav) |

### Frame conventions
- All goals are published with `header.frame_id = 'map'`.
- Map data assumes ROS convention (origin bottom-left); both `MapView` and `Ros2DMapView` flip the Y axis for canvas rendering.
- Robot arrow Y-flip is applied **inside `Ros2DMapView`**: `navArrow.y = -robotPose.position.y`. Rotation is `-quaternionToEuler(orientation).z` (degrees).

---

## 6. Behavioral Contract (concrete values for parity in v2)

### Connection
- **Default URL**: `ws://localhost:9090` (`ConnectDialog` initial value).
- **On error event** → `connectionError = 'Failed to connect'`, dialog opens.
- **On close before a `connection` event** → `connectionError = 'Connection closed'`.
- **No retry**, no exponential backoff, no URL persisted to localStorage.

### Teleop (`RobotControl.jsx`)
- **`LINEAR_SPEED = 0.3`** m/s, **`ANGULAR_SPEED = 0.5`** rad/s.
- **Repeat interval = 100 ms** while key/button is held (`setInterval`).
- `e.repeat` events from the OS are ignored — only the initial keydown starts the interval.
- Touch handlers **commented out** in `ControlButton` — mobile is unsupported today.
- 3×3 key map (rows top to bottom):

  | Key | linear.x        | angular.z        | Effect            |
  |-----|-----------------|------------------|-------------------|
  | Q   | +0.3            | +0.5             | Forward + left    |
  | W   | +0.3            | 0                | Forward           |
  | E   | +0.3            | −0.5             | Forward + right   |
  | A   | 0               | +0.5             | Rotate left       |
  | S   | 0               | 0                | Stop              |
  | D   | 0               | −0.5             | Rotate right      |
  | Z   | −0.3            | −0.5             | Reverse + right   |
  | X   | −0.3            | 0                | Reverse           |
  | C   | −0.3            | +0.5             | Reverse + left    |

- On keyup / mouseup / mouseleave: interval is cleared and `stop()` (Twist with all zeros) is published.

### Camera (`useCamera.js`)
- Returns `data:image/jpeg;base64,<msg.data>` — no decode validation, no error fallback.
- `<img>` is rendered with `object-cover` inside a fixed aspect-video container.

### Map: custom canvas renderer (`MapView.jsx`, currently unused)
- Canvas is sized to `map.width × map.height` in cells.
- ROS index → canvas index: `rosIdx = (height - 1 - row) * width + col` (Y-flip).
- Cell coloring:
  - `-1` (unknown) → grey `(50,50,50)`
  - `0` (free) → white `(255,255,255)`
  - `1..100` (occupied) → grey scaled as `Math.round((100 - cell) * 2.55)` (100 → black, 0 → white).
- `imageRendering: pixelated` to keep the look crisp when CSS-scaled.

### Map: ros2djs renderer (`Ros2DMapView.jsx`, active)
- `ROS2D.Viewer` initialized at fixed **640×640** in the div `#map`.
- `ROS2D.OccupancyGridClient` with `continuous: true`, `topic: '/reference/map'`.
- On grid `change`: `viewer.scaleToDimensions(width, height)` then `viewer.shift(origin.x, origin.y)`.
- Three overlay shapes added to scene:
  - `localPathShape`: `ROS2D.PathShape({ strokeSize: 0.03, strokeColor: rgb(200, 100, 100) })` — red.
  - `globalPathShape`: `ROS2D.PathShape({ strokeSize: 0.01, strokeColor: rgb(0, 0, 100) })` — dark blue.
  - `navArrow`: `ROS2D.ArrowShape({ size: 0.25, strokeSize: 0.1, fillColor: rgb(0, 100, 255) })`.
- Arrow pose update (effect on `robotPose`): `x = pos.x`, `y = -pos.y`, `rotation = -yaw_deg.toFixed(2)`.
- Path overlays only update when `msg.poses.length > 0`.
- Cleanup unsubscribes `gridClient.gridClient` (the internal topic on the client) and clears the EaselJS scene.

### Navigation goal (`useMoveBase.js`)
- Uses **ROSLIB.ActionClient** (not the legacy `/move_base/goal` topic).
- `actionClient = new ROSLIB.ActionClient({ ros, serverName: '/move_base', actionName: 'move_base_msgs/MoveBaseAction' })`.
- `publish(point, angle, { onSucceeded, onFailed, onFeedback })`:
  - `angle` is `{x, y, z}` **in degrees** → converted to quaternion via `eulerToQuaternion`.
  - Goal message:
    ```
    target_pose:
      header:   { frame_id: 'map', stamp: { secs: 0, nsecs: 0 } }
      pose:
        position:    { x, y, z: 0 }
        orientation: { x, y, z, w }   // from eulerToQuaternion
    ```
  - Returns the `ROSLIB.Goal` instance (so callers can read `goal.goalID`).
- `goal.on('status')` fires repeatedly; the hook calls `onSucceeded`/`onFailed` based on the `GOAL_STATUS` enum (`SUCCEEDED=3`, `ABORTED=4`, `REJECTED=5`, `LOST=9`).
- `goal.on('feedback')` exposes `fb.base_position.pose` to `onFeedback`.
- `cancelAll()` calls `actionClient.cancel()`. Hook also auto-cancels on unmount.

### Waypoint mission (`useWaypointNav.js`)
- States: `IDLE`, `NAVIGATING`, `DONE`, `ERROR` (exported as `NAV_STATUS`).
- Reads from `mockLocationList` — **the list is captured at module load** (`const WAYPOINTS = normaliseMockLocations(...)`). Editing mock-data at runtime won't update an in-flight session.
- Listens to `/move_base/result` (one shot per goal) and filters by `msg.status.goal_id.id === activeGoalIdRef.current` so that stale results from prior goals are ignored.
- Result code → action:
  - `SUCCEEDED (3)` → log "Reached", advance index, send next; on overflow → `DONE`.
  - `ABORTED (4) / REJECTED (5) / PREEMPTED (2)` → log failure, set `ERROR`.
- Controls:
  - `start()` — reset to idx 0, send first waypoint.
  - `stop()` — `cancelAll()`, return to `IDLE`.
  - `retry()` — only valid in `ERROR`; re-sends current waypoint.
  - `skip()` — cancel current, jump to next (or `DONE` if past last).
- `logs` keeps the **last 50** entries (`prev.slice(0, 49)` after prepending).
- Progress = `Math.round(currentIdx / WAYPOINTS.length * 100)`.

### AMCL pose display (`useAMCLPose.js`)
- Returns strings (`.toFixed(3)`). If a v2 consumer needs numbers (e.g., to drive an overlay), call `Number(...)` or refactor the hook.
- `rz` field is yaw in **degrees**, derived via `quaternionToEuler` then `.toFixed(3)`.

---

## 7. Mock Waypoints (`src/pages/config/mock-data.js`)

Used by both `GoalSelector` (one-shot goal per click) and `useWaypointNav` (sequential mission). All angles in **degrees**, z-only (no roll/pitch).

| id | name              | x       | y       | yaw (°)   |
|----|-------------------|---------|---------|-----------|
| 1  | Charging Station  |  3.094  |  1.412  | −126.949  |
| 2  | Entrance          | −1.953  |  2.467  |  −33.887  |
| 3  | Storage Room      | −2.690  | −1.583  |  142.161  |
| 4  | Home              |  0.000  |  0.000  |    0.000  |

These coordinates are specific to the map produced by the robot's SLAM/mapping setup. **They will need to be recaptured for any new environment.**

---

## 8. Math & coordinate conversions (`src/helper/angleHelper.js`)

### `quaternionToEuler({x, y, z, w})` → `{x, y, z}` in **degrees**
Standard Tait–Bryan ZYX decomposition; pitch clamped at ±90° to avoid `asin` overflow.
```
roll  = atan2( 2(wx + yz), 1 − 2(x² + y²) )
pitch = asin ( clamp(2(wy − zx), −1, 1) )
yaw   = atan2( 2(wz + xy), 1 − 2(y² + z²) )
```
All three multiplied by `180/π` before return.

### `eulerToQuaternion({x, y, z})` ← **degrees** → `{x, y, z, w}`
Convert each input by `π/180`, then standard half-angle formula:
```
cr=cos(roll/2), sr=sin(roll/2)
cp=cos(pitch/2), sp=sin(pitch/2)
cy=cos(yaw/2), sy=sin(yaw/2)

w = cr·cp·cy + sr·sp·sy
x = sr·cp·cy − cr·sp·sy
y = cr·sp·cy + sr·cp·sy
z = cr·cp·sy − sr·sp·cy
```

> **Convention pitfall**: this codebase consistently uses **degrees** at the JS/UI layer and only converts to radians inside `eulerToQuaternion`. A rewrite should keep this contract or document the switch loudly — `useMoveBase`, `mockLocationList`, and `Ros2DMapView`'s `navArrow.rotation` all depend on it.

---

## 9. UI Theme

- **Background**: `bg-gray-900` (set on `<html>` and `<body>` in `index.html`).
- **Surfaces**: `bg-gray-800`, `bg-gray-800/50` (navbar), `bg-gray-700` (controls).
- **Text**: white primary, `text-gray-400` secondary, `text-gray-500/600` tertiary.
- **Accent**: indigo-500/600 (Connect, GoalSelector).
- **States**: green-500 (connected dot, completed waypoint), red-500/600 (disconnect, error), yellow (active waypoint, retry), blue (path overlay, progress bar).
- **Component libraries used**:
  - Headless UI: `Dialog`, `DialogBackdrop`, `DialogPanel`, `DialogTitle`, `Disclosure`, `Button`.
  - MUI: `Skeleton` only.
  - Heroicons: imported but no current consumer in the active component graph.

---

## 10. Connection flow (user perspective)

1. App loads → `Dashboard` placeholder, `Disconnected` state (red dot).
2. User clicks **Connect** → `ConnectDialog` modal opens with `ws://localhost:9090` prefilled.
3. User edits URL → submits → `RosProvider.connect(url)` opens a `ROSLIB.Ros`.
4. On `connection` event → status flips green, URL truncated next to dot. User can navigate to `/robots` to see map/camera/controls.
5. On `error` or pre-connection `close` → error modal opens with `'Failed to connect'` / `'Connection closed'`. Dismiss → `clearError()` resets state. **No automatic retry.**
6. **Disconnect** button closes the WS and resets all state to initial.

---

## 11. Running the app

```bash
cd D:/FYP/ros_tests/roslibjs/single_robot
npm install        # first time
npm run dev        # Vite dev server (HMR)
npm run build      # production bundle
npm run preview    # serve the production bundle locally
npm run lint       # eslint
```

No environment variables. No backend other than rosbridge on the robot side.

---

## 12. Known limitations of the current version

These are the rough edges a next-version interface should resolve (or consciously inherit):

**Connection**
- No auto-reconnect; a transient WS drop puts the UI back to disconnected with a manual-retry dialog.
- The chosen URL is **not persisted** — every reload starts back at `ws://localhost:9090`.
- No support for multiple simultaneous robot connections.

**Routing & pages**
- `Dashboard` is a placeholder; `Team` and `Locations` routes (mentioned in older CLAUDE.md) **don't exist anymore**.
- Only `/robots` is functional.

**Map view**
- `Ros2DMapView` uses CDN-loaded `ros2djs` + `easeljs` globals — no module-bundled alternative, no offline support.
- Viewer is **fixed at 640×640** — does not respond to container size or window resize.
- Robot arrow uses `/robot_pose_ekf_node/odom_combined`, not `/amcl_pose` — pose will drift if EKF disagrees with AMCL.
- `MapView` (the canvas-based fallback) still exists but is dead code in the active page.

**Teleop**
- Hardcoded `LINEAR_SPEED = 0.3` and `ANGULAR_SPEED = 0.5` — no UI to adjust or scale.
- **Touch handlers are commented out** — the 3×3 pad does not work on tablets/phones.
- No safety: holding `W` then alt-tabbing the window leaves the interval running until the keyup eventually fires.

**Camera**
- Hardcoded to `/camera/front/image_raw/compressed`. No way to switch streams or display multiple cameras.
- No fps display, no frame-drop indicator, no fullscreen.

**Navigation**
- Waypoints come from **a hardcoded `mockLocationList`** captured at module load — no UI to edit, save, or import.
- `useWaypointNav` resolves the waypoint list **once at import time** — runtime edits to `mock-data.js` won't take effect mid-session.
- No map click-to-set-goal, no drag-to-orient.
- `AMCLPoseView` is built but **commented out** in `Robots.jsx` — operators have no numeric pose readout in the current layout.
- `SkeletonRobot` does not reflect the current Robots layout (no skeleton for `Ros2DMapView`, `GoalSelector`, or `WaypointNav`).

**Code quality / hygiene**
- `MapView.jsx`, `List.jsx`, and `AMCLPoseView` reference (commented out) are all dead code paths.
- `console.log(map.height)` / `console.log(map.width)` left in `MapView.jsx`.
- `useDWAPlannerLocal/Global` initialize `paths` state to the integer `0` instead of `null` — a minor inconsistency.
- Two `roslib` versions loaded simultaneously (npm v2 + CDN v1 for ros2djs) — works, but fragile.
- No tests. No CI configuration.
- No TypeScript — all JS with no JSDoc.

---

## 13. Pointers for a next-version implementer

If the goal is to **match or exceed** today's functionality, the minimum feature set is:

1. Connect/disconnect to rosbridge with clear status + error surfacing (matching §10).
2. Live map render of `/reference/map` (canvas, ros2d, or WebGL — any of the three works; v1 has working code for two of them).
3. Camera stream from `/camera/front/image_raw/compressed`.
4. Teleop 3×3 pad with the exact velocity table in §6 (or expose them as configurable).
5. Single-goal navigation via the `/move_base` action with the message shape in §6.
6. Sequential waypoint mission (start/stop/skip/retry) consuming `/move_base/result`.
7. Display of robot pose on the map and (optionally) as numeric readout.

The **ROS contract in §5 must be honored exactly** — anything else requires changes on the robot side too.

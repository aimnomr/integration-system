# Service Reference: React Frontend

The operator console — a browser SPA that drives the fleet via FastAPI's REST
API, listens to live VDA5050 telemetry over MQTT-over-WebSockets, and talks
directly to each robot's rosbridge for the high-frequency lane (live
occupancy grid, AMCL/EKF pose, camera, teleop).

Lives in **`frontend/`**. Run with `npm install && npm run dev` (Vite dev
server on `http://localhost:5173`). See [`frontend/README.md`](../../frontend/README.md)
for stack details, conventions, and how the branding file works.

---

## Realtime channels

Three independent lanes — losing one degrades only the features that use it.

| Lane | Endpoint | Used for |
|---|---|---|
| **REST** | `VITE_API_URL` (default `http://localhost:8000`) | All commands; cold reads (fleet, robot, orders, OEE, maps, locations, system status) |
| **MQTT-over-WS** | `VITE_MQTT_WS_URL` (default `ws://localhost:9001`) | VDA5050 `state` + `connection` per robot — the low-frequency telemetry lane |
| **rosbridge** | Each robot's `rosbridgeUrl` from `GET /fleet` | High-frequency: `/reference/map`, `/amcl_pose`, EKF odom, DWA plans, `/camera/front/image_raw/compressed`, `/web_teleop/cmd_vel` |

The MQTT singleton (`src/realtime/mqttClient.ts`) reference-counts
subscriptions so the same topic shared by many components opens only one
server-side sub. The rosbridge factory (`src/realtime/rosbridgeClient.ts`)
caches one `ROSLIB.Ros` per URL, opens it lazily on first use, and exposes
exponential reconnect.

---

## Screens

| Route | What it does |
|---|---|
| `/` (Dashboard) | Fleet grid of `RobotTile` — per-robot connection pill, mode, battery, current orderId, last-seen, map, rosbridge status. Cold-loads `GET /fleet`, lives off MQTT `state`+`connection` after that. |
| `/robots/:serial` (Robot Detail) | `MapCanvas` left, tabbed side panel (State / Errors / Actions) right. Named-location pins overlaid on the map. |
| `/dispatch` | Robot picker + Named-or-Manual order builder. Active-order panel shows live `nodeStates` and Cancel / Retry / Skip instant-action buttons. |
| `/orders` (Order History) | Cursor-paged `DataGrid` over `GET /orders`. Filter by robot, choose page size, "Load older" button advances the cursor. |
| `/oee` (OEE) | Summary cards (`total`/`succeeded`/`failed`/`avg`), availability bar, MUI X `BarChart` of recent cycle durations, paginated cycles log grid. |
| `/teleop`, `/teleop/:serial` | ENGAGED-gated camera stream + 3×3 keyboard pad. Velocity table inherits the v1 contract: LINEAR 0.3 m/s, ANGULAR 0.5 rad/s, 100 ms repeat, QWE/ASD/ZXC. Mouse + touch + keyboard. Auto-disengages on rosbridge drop. |
| `/health` | Six-row service readout (FastAPI, MQTT browser + backend, Postgres, rosbridge fleet, Node-RED) from `GET /system/status` polled every 5 s. |
| `/admin/maps` | DataGrid + edit drawer + 409-aware delete confirm. |
| `/admin/locations` | DataGrid + edit drawer with an **embedded `MapCanvas`** — click on the map to set x / y. |
| `/admin/robots` | DataGrid + edit drawer; warns that adding a robot still needs a ROS Bridge restart. |
| `/admin/fleet` | Single-row form for `fleet_config` — interface_name, major_version, version, manufacturer. |
| `*` | 404 page with a back-to-dashboard link. |

---

## MapCanvas

`src/components/map/MapCanvas.tsx` — custom `<canvas>` renderer, no `ros2djs`.

- Rasterises the `nav_msgs/OccupancyGrid` from `/reference/map` onto an
  offscreen canvas once per map update (ROS Y-flip applied on the row index),
  then draws it scaled into the visible canvas.
- Path overlays (`/move_base_node/DWAPlannerROS/{global,local}_plan`) and the
  robot arrow are computed in world coordinates and transformed via the map
  metadata.
- **Pose source:** AMCL primary, EKF fallback after 2 s of AMCL silence; the
  arrow turns amber on fallback so the operator notices.
- Click-on-canvas yields world coordinates via the inverse transform —
  exposed as the `onClickWorld` prop and used by the location-editor in
  `/admin/locations`.
- Responsive via `ResizeObserver` — fills the container and keeps the map's
  aspect ratio.

---

## Branding

Everything visual flows out of `src/branding/branding.ts`:

```ts
export const BRAND = {
  appName: 'AMR Console',
  primary:   '#6366f1',
  secondary: '#a855f7',
  accent:    '#06b6d4',
  surface: { 0: '#0f172a', 1: '#1e293b', 2: '#334155' },
  status:  { ok: '#22c55e', warn: '#eab308', error: '#ef4444', idle: '#64748b' },
  navWidth: 240, navWidthCollapsed: 64, appBarHeight: 56,
};
```

Tailwind reads this at build time via `tailwind.config.ts` (`brand-*` and
`surface-*` colour utilities); the MUI theme is built from the same object at
runtime inside `AppProviders.tsx`. Edit one file to rebrand.

Tailwind has `important: 'html'` so its utilities win against MUI's
component-internal styles — required when mixing the two.

---

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | FastAPI base URL — REST + dev-proxy target |
| `VITE_MQTT_WS_URL` | `ws://localhost:9001` | Mosquitto WebSocket listener |
| `VITE_API_KEY` | _(empty)_ | If set, sent as `X-API-Key` on every REST call |
| `VITE_APP_NAME` | `AMR Console` | Override the app name in the AppBar |

All have sensible defaults — `.env.local` is optional for local dev.

---

## Conventions inherited from the v1 interface

The pre-VDA5050 single-robot UI (`docs/old-interface/PROJECT_OVERVIEW.md`)
established a few contracts that the v2 keeps verbatim:

- **Angles are degrees at the UI layer.** Convert to quaternion only at the
  rosbridge boundary. `src/helper/angleHelper.ts` is a near-direct TS port.
- **Goals carry `header.frame_id = 'map'`.**
- **Teleop velocity table:** `LINEAR_SPEED = 0.3 m/s`, `ANGULAR_SPEED = 0.5
  rad/s`, 100 ms repeat.
- **ROS topics consumed:** `/reference/map`, `/amcl_pose`,
  `/robot_pose_ekf_node/odom_combined`, the two DWA plan topics,
  `/camera/front/image_raw/compressed`. Published: `/web_teleop/cmd_vel`. See
  [`schema/ROS_TOPICS.md`](../schema/ROS_TOPICS.md) for the full picture.

---

## What's not here yet

- **Order History row drill-down** — the backend endpoint
  (`GET /orders/{order_id}`) and frontend client (`getOrder()` +
  `OrderDetail` type) shipped 2026-05-25; the UI hook-up is still to do.
- **Multi-camera support** — the camera topic is hardcoded to
  `/camera/front/image_raw/compressed`.

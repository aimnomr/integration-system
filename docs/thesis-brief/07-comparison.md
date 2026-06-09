# Before vs. After — The Two Interfaces, Side by Side

This file contrasts the **previous** single-robot React interface (described in
[05-old-interface.md](05-old-interface.md)) with the **current** AMR Integration
System (described in files 01–04). Use this as a scaffold for thesis chapters
on system evolution, design rationale, and contribution.

---

## 1. One-line summary

| | Previous | Current |
|---|---|---|
| What it is | A single-robot operator console | A full-stack fleet management system |
| Scope | One robot, one browser tab | Many robots, multi-service backend, persistence |
| Standard | Bespoke ROS topics over rosbridge | **VDA5050** — open MQTT FMS ↔ AGV standard |
| Persistence | None (session only) | PostgreSQL — state, orders, commands, OEE |
| Components | 1 (React SPA + robot) | 5 services (React, FastAPI, Mosquitto, Node-RED, ROS Bridge) + Postgres |

---

## 2. Architecture

### Previous

```
Browser (React SPA)  ──rosbridge WebSocket──>  Robot
```

A single React app opens a `ws://<robot-ip>:9090` connection via `roslib`,
subscribes to ROS topics (map, camera, pose), publishes Twist + MoveBase
goals. No backend. No persistence. No second robot possible.

### Current

```
Browser ──HTTP──>          FastAPI (FMS gateway)
        ──MQTT/WS──>       Mosquitto :9001     (state, connection)
        ──rosbridge──>     per-robot rosbridge  (map, camera, teleop)

FastAPI ──MQTT──> Mosquitto ──> ROS Bridge Service (FleetManager → Robot[])
                                  └─ rosbridge ──> ROS ──> Robot

Robot ──ROS──> ROS Bridge ──MQTT──> Mosquitto ──> Node-RED ──HTTP──> FastAPI ──> Postgres
```

Three realtime lanes (REST, MQTT-over-WS, rosbridge) are independent — losing
one degrades only the features that use it. Topics are per-robot
(`amr/v2/moverobotic/{serial}/...`), so adding a robot is a database edit, not
a code change.

---

## 3. Feature comparison

| Capability | Previous | Current |
|---|---|---|
| Connect to robot | Manual URL entry, no retry, no persistence | Auto-loaded from DB; per-robot rosbridge connection cached |
| Live map | `ros2djs` 640×640 viewer, CDN-loaded globals | Custom React `MapCanvas` — responsive, AMCL primary, EKF fallback after 2 s |
| Camera | Single hardcoded topic `/camera/front/image_raw/compressed` | Same topic, plus liveness pill and ENGAGED-gated teleop |
| Teleop | 3×3 keyboard pad, touch disabled | Same velocity table (0.3 m/s, 0.5 rad/s, 100 ms), now mouse + touch + keyboard, auto-disengages on rosbridge drop |
| Navigation goals | Hardcoded `mockLocationList` of 4 waypoints | Database-backed `named_locations` + manual order builder with map-pick coord picker |
| Waypoint mission | In-browser `useWaypointNav` driving `/move_base` action | VDA5050 `order` published over MQTT; `OrderStateMachine` in ROS Bridge drives goal-by-goal |
| Cancel / Retry / Skip | Browser-side `cancelAll()` | VDA5050 `instantActions` — `cancelOrder`, `retryNode`, `skipNode` |
| Fleet view | — (single robot only) | Dashboard fleet tiles, multi-robot routing |
| Order history | — | Cursor-paged DataGrid backed by `orders` + child tables |
| OEE / metrics | — | Availability bar, cycles bar chart, cycles log grid |
| Reference data | Hardcoded in `mock-data.js` | CRUD UI for Maps, Locations, Robots, Fleet Config |
| Auth | — | Opt-in `X-API-Key` header |
| Tests / CI | None | pytest (41), node:test (~15), Newman (61 requests), Playwright (24), GitHub Actions |
| Docker | — | `docker-compose.yml` + Dockerfiles — full stack via `docker compose up`, a supported run/deploy path; also backs the CI smoke job |
| Robot archive | — | Soft-delete (`robots.archived_at`) with restore-on-collision UX |

---

## 4. Tech stack

| Layer | Previous | Current |
|---|---|---|
| Bundler | Vite 8 | Vite 6 |
| UI framework | React 19 (no StrictMode) | React 19 + TypeScript |
| Styling | Tailwind 4 | Tailwind 4 + MUI 7 (complex widgets only) |
| State / cache | `useState` per hook | TanStack Query for server cache |
| ROS interop | `roslib` npm v2 + `ros2djs` CDN globals | `roslib` (rosbridge only) + `mqtt` (MQTT over WS) |
| Backend | — | FastAPI (Python 3.11+) + paho-mqtt |
| Bridge | — | Node.js (`roslib` + `mqtt`) — `FleetManager` + per-robot `Robot` classes |
| Messaging | Direct WebSocket | Mosquitto MQTT (TCP `:1883` for services, WS `:9001` for browser) |
| Telemetry sink | — | Node-RED → FastAPI `/ingest/*` → Postgres |
| Database | — | PostgreSQL — 15-table normalized schema (1NF strict, BCNF) |

---

## 5. Protocol contract

| | Previous | Current |
|---|---|---|
| Inbound goal | ROS action `/move_base` (MoveBaseAction) | VDA5050 `order` message over MQTT, then ROS Bridge converts to `/move_base_simple/goal` per node |
| State feed | `/amcl_pose`, `/robot_pose_ekf_node/odom_combined`, `/move_base/result` | VDA5050 `state` message — consolidated snapshot, published on significant change + 5 s heartbeat |
| Liveness | None | VDA5050 `connection` topic — QoS 1, retained, with `CONNECTIONBROKEN` MQTT Last-Will |
| Cancel | `actionClient.cancel()` | `instantActions` with `cancelOrder` |

---

## 6. Data model

| | Previous | Current |
|---|---|---|
| Persistence | Session only — nothing saved on reload | PostgreSQL, ACID writes |
| Waypoints | Hardcoded array `mockLocationList` | `maps` + `named_locations` tables with FK constraints |
| Robot identity | Implicit (just the WS URL) | `robots` table — `serial_number` PK, `archived_at` soft-delete, FK from every log table |
| Fleet identity | — | `fleet_config` single-row table — `interfaceName`, `majorVersion`, `manufacturer` |
| Order audit | — | `orders` + `order_nodes` + `order_edges` + `instant_action_messages` + `instant_actions` |
| State audit | — | `state_snapshots` + `state_node_states` + `state_action_states` + `state_errors` |
| OEE | — | `oee_cycles` populated by Node-RED |

The schema is fully normalised — VDA5050's variable-length arrays (`nodes`,
`edges`, `actions`, `nodeStates`, `actionStates`, `errors`) become child
tables with FKs, instead of JSONB columns. This is correct relational design
and queryable without JSON operators (relevant for FYP grading on database
modelling).

---

## 7. What was *kept* from the previous interface

Not everything changed — these contracts were preserved on purpose:

- **Teleop velocity table** — `LINEAR = 0.3 m/s`, `ANGULAR = 0.5 rad/s`,
  100 ms repeat, QWE/ASD/ZXC 3×3 layout. (Verbatim from the v1 spec.)
- **Camera topic** — `/camera/front/image_raw/compressed`.
- **ROS contract for goal frame** — `header.frame_id = 'map'`.
- **AMCL as primary pose** — though the current system adds EKF fallback after
  2 s AMCL silence and flips the arrow amber to signal degradation.
- **3×3 keypad geometry** — operators trained on v1 don't relearn anything.

---

## 8. Limitations of the previous interface, and how the current system answers them

This maps directly onto the "Known limitations" section in
[05-old-interface.md §12](05-old-interface.md).

| Limitation in v1 | Answer in current |
|---|---|
| No auto-reconnect; transient drop = manual retry | Singleton MQTT client with auto-reconnect; per-rosbridge connections cached and lazily reopened |
| Chosen URL not persisted across reloads | Robots are DB rows; the UI loads them on every start |
| No support for multiple simultaneous robots | Per-robot topic namespace, `FleetManager` runs one `Robot` per registry entry |
| `Dashboard` is a placeholder | Dashboard now shows live fleet tiles |
| `Ros2DMapView` fixed at 640×640, CDN-loaded | Custom canvas `MapCanvas` — responsive, no CDN, AMCL + EKF |
| EKF arrow can drift from AMCL | AMCL is primary; EKF only on 2 s AMCL silence; arrow flips amber so the operator notices |
| Touch handlers commented out | Re-enabled — mouse + touch + keyboard all supported |
| Hardcoded `LINEAR_SPEED` / `ANGULAR_SPEED` | Same values, but now codified in a single typed constant and documented |
| Waypoints hardcoded in `mock-data.js` | Database CRUD UI for `named_locations` |
| `AMCLPoseView` built but commented out | Numeric pose available in the Robot Detail state panel |
| Two `roslib` versions loaded (v1 + v2) | Single `roslib` import — `ros2djs` dropped in favor of a custom canvas renderer |
| No tests, no CI | pytest, node:test, Newman, Playwright, GitHub Actions five-job pipeline |
| No TypeScript | Whole frontend in TypeScript with `tsc -b --noEmit` clean |

---

## 9. Thesis framing suggestions

The contribution narrative arc this contrast supports:

1. **Problem.** The single-robot interface couldn't scale to a fleet, had no
   persistence, no standards alignment, no audit trail, no tests.
2. **Approach.** Adopt VDA5050 — the open MQTT-based FMS ↔ AGV standard — so
   that fleet-scaling and standards-alignment are *the same refactor*. Decouple
   services through an MQTT broker. Move persistence into a normalised
   relational schema.
3. **Result.** A five-service stack with three independent realtime lanes, a
   15-table BCNF schema, opt-in auth and rate limiting, structured logging,
   end-to-end tests and CI, and a containerised dev environment — all while
   preserving the trained operator's muscle memory (teleop velocity table,
   3×3 keypad).
4. **Future work.** MQTT auth + TLS (the broker is anonymous), the open
   frontend liveness investigation (G39), and the VDA5050 features
   intentionally left out of scope (battery state, `visualization`,
   `factsheet`).

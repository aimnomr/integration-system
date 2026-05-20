# Implementation Status

> **This is a point-in-time snapshot and decays.** Last updated: 2026-05-21.
> When in doubt, the code is authoritative.

---

## Working

The system speaks **VDA5050** end to end and is fronted by a feature-complete
React UI. The VDA5050 migration (Phases 0–7, see
[plans/vda5050-migration.md](plans/vda5050-migration.md)) is complete; the
post-migration audit gaps (G15–G21) and the frontend-blocking gap (G18) are
all closed.

### Backend

- **FastAPI — FMS gateway.** Robot-scoped routes: `GET /robots`, `GET /fleet`,
  `POST /robots/{serial}/order|/order/named|/instant-actions`,
  `GET /robots/{serial}/state`, `/oee/summary|cycles|availability`,
  `GET /system/status`, `GET /orders` (paged order history), the
  reference-data CRUD endpoints (`/maps`, `/locations`, `/robots`,
  `PUT /fleet`), and the internal `/ingest/*` telemetry endpoints. Publishes
  VDA5050 `order` / `instantActions` directly to MQTT. Loads the fleet from the
  database at startup. **CORS** (G18) is configured via `CORS_ORIGINS`.
- **ROS Bridge Service — fleet-capable.** `FleetManager` fetches the fleet from
  FastAPI's `GET /fleet` at startup and runs one isolated `Robot` per entry
  (own MQTT client, own rosbridge connection). The `OrderStateMachine` drives
  `/move_base_simple/goal` node-by-node, auto-advancing on each
  `/move_base/result`, and applies `cancelOrder` / `retryNode` / `skipNode`.
  Publishes the consolidated VDA5050 `state` on change + 5 s heartbeat and a
  retained `connection` topic with a `CONNECTIONBROKEN` MQTT Last-Will.
- **Node-RED — telemetry sink + DB admin.** Ingests `state` / `connection` and
  the `order` / `instantActions` audit tap, derives OEE cycles, and persists
  via the FastAPI `/ingest/*` API. A separate **DB Admin** tab uses
  `node-red-contrib-postgresql` to reset the schema and run ad-hoc admin SQL
  directly against Postgres — for setup/maintenance only.
- **Mosquitto** — two listeners: TCP on `:1883` (backend services) and
  WebSocket on `:9001` (browser frontend).
- **Database — fully normalized.** 15-table relational schema (1NF-strict,
  BCNF). FastAPI `app/db.py` uses a `ThreadedConnectionPool` and writes each
  `state` / `order` / `instantActions` message as a multi-table transaction.
- **Database is the single source of truth for the fleet.** `fleet_config` +
  `robots` define the fleet; FastAPI loads it at startup and the ROS Bridge
  fetches it via `GET /fleet`. The reference-data CRUD endpoints make it
  editable without re-running `schema.sql`.
- **Structured logging** — ROS Bridge Service and FastAPI emit JSON-line logs.
- **Authentication & rate limiting** — FastAPI supports opt-in `X-API-Key`
  auth (`API_KEY`) on the client-facing API and a per-client rate limiter
  (`RATE_LIMIT_PER_MINUTE`); both are off/permissive by default for local dev.

### Frontend (`frontend/`)

- **Stack** — Vite 6 + React 19 + TypeScript, Tailwind 4 (utility) + MUI 7
  (complex widgets), MUI X DataGrid + Charts (admin + OEE), TanStack Query
  (server cache), `mqtt` (browser MQTT-over-WS), `roslib` (per-robot
  rosbridge). One `src/branding/branding.ts` file feeds both Tailwind and the
  MUI theme — change one file to rebrand.
- **Realtime channels** — three independent lanes:
  1. **REST** to FastAPI for commands + cold reads. `apiFetch` wrapper sends
     `X-API-Key` from `VITE_API_KEY` if set.
  2. **MQTT-over-WS** to Mosquitto `:9001` for VDA5050 `state` + `connection`.
     Singleton client with reference-counted subscriptions, auto-reconnect,
     wildcard support.
  3. **rosbridge** WebSocket per robot for the high-frequency lane: live
     occupancy grid, AMCL/EKF pose, camera image, `cmd_vel` teleop.
     Connections are cached per URL and lazily opened.
- **Screens** — Dashboard (fleet tiles), Robot Detail (live MapCanvas +
  tabbed state/errors/actions panel), Dispatch (named or manual order builder
  + active-order panel with Cancel/Retry/Skip), Teleop (camera + 3×3 keyboard
  pad with ENGAGED gate), Order History (cursor-paged DataGrid), OEE (cards +
  availability bar + cycles bar chart + cycles log grid), Admin CRUD for Maps
  / Named Locations (with map-pick coord picker) / Robots / Fleet Config,
  Health (six-row service readout).
- **Pose source for the map arrow** — AMCL primary, EKF
  (`/robot_pose_ekf_node/odom_combined`) fallback after 2 s AMCL silence;
  arrow flips to amber on fallback so the operator notices.
- **Teleop velocity table** inherits the v1 interface contract:
  `LINEAR = 0.3 m/s`, `ANGULAR = 0.5 rad/s`, 100 ms repeat,
  QWE/ASD/ZXC layout, mouse + touch + keyboard, releases publish a zero
  Twist, auto-disengages on rosbridge drop.

### Testing & CI

- **Per-service unit tests.** ROS Bridge `node:test` suite (~15 tests),
  FastAPI `pytest` suite (`tests/test_config.py`, `test_auth.py`,
  `test_ratelimit.py`, `test_schemas.py`, `test_orders.py`, `test_cors.py`).
  Both run in CI on every push.
- **Newman API smoke suite** (`docs/postman/`) — 30 requests / 46 assertions
  covering every endpoint family. Runs via `.\docs\postman\run-newman.ps1`;
  HTML + JSON reports under `docs/postman/reports/`. Self-cleaning CRUD
  blocks.
- **GitHub Actions CI** (`.github/workflows/ci.yml`) — three jobs:
  - **ROS Bridge** — `npm ci`, `node --check`, `npm test`.
  - **FastAPI** — `pip install -r requirements*.txt`, `compileall`, `pytest`.
    `tests/conftest.py` stubs the four DB calls `RobotRegistry.__init__`
    makes, so router imports don't need a live Postgres.
  - **Node-RED** — `flows.json` JSON validation.
  Frontend (`tsc`/build) and Newman are **not** in CI by design — local-only
  for now.

### Docker & ops

- Per-service `Dockerfile`s; root `docker-compose.yml` brings up the whole
  stack (Postgres → Mosquitto → FastAPI → ROS Bridge → Node-RED) with
  healthcheck-gated start order. Schema auto-applies on first run.
- The frontend is **not** in `docker-compose.yml` — runs via `npm run dev`
  for now; Phase 5 (Dockerize) was planned but not done.

---

## Verified vs. not

- **Statically verified end-to-end:** all backend Python (`py_compile`),
  ROS Bridge JS (`node --check`), `flows.json` JSON shape, frontend
  TypeScript compiles (`tsc -b`), Vite production build succeeds.
- **Unit-tested:** ROS Bridge `node:test`, FastAPI `pytest` (both green in
  CI as of 2026-05-21).
- **HTTP-tested:** Newman replays 30 requests against the running FastAPI
  with 45/46 assertions passing on the latest run; the one failure is a
  Newman assertion mismatch on `GET /robots/{serial}` shape (response is
  missing `serialNumber` at top level — worth eyeballing the actual JSON).
- **Manually verified:** the [manual-test-checklist.md](manual-test-checklist.md)
  Phases 0–7 are largely ticked by the user; Phases 8–13 (extreme cases +
  frontend) are partially done.

---

## Not yet implemented (post-v1)

All originally tracked gaps **G1–G21 are resolved.** Things that would be the
natural next steps but aren't tracked as gaps:

- **Frontend in CI** — `tsc --noEmit && vite build` job. ~15 min to add.
- **Newman in CI** — boot the stack via `docker compose`, run the collection,
  tear down. Would catch contract drift on every PR.
- **Frontend Dockerfile + compose service** — currently local-dev only.
- **`GET /orders/{id}`** — detail endpoint for the Order History → click-to-
  expand drill-down. The list endpoint is in place.
- **Playwright E2E** for the frontend — Phase 1 was scaffold-only; the UI has
  no automated browser tests.
- **MQTT auth + TLS** on both broker listeners — anonymous is fine for FYP /
  LAN, not for any wider deployment.

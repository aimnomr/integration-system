# Implementation Status

> **This is a point-in-time snapshot and decays.** Last updated: 2026-05-22.
> When in doubt, the code is authoritative.

---

## Working

The system speaks **VDA5050** end to end and is fronted by a feature-complete
React UI. The VDA5050 migration (Phases 0–7, see
[plans/vda5050-migration.md](plans/vda5050-migration.md)) is complete; the
post-migration audit gaps (G15–G21) and the frontend-blocking gap (G18) are
all closed. The 2026-05-22 manual-checklist walkthrough surfaced four new
gaps — **G24–G27** — all medium / low severity (DB-down 500-not-503 from
the state and system-status routes, two frontend liveness/polish issues, and
unreadable map pin labels). See [gaps.md](gaps.md) and
[manual-test-remarks.md](manual-test-remarks.md) for detail.

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

See [`testing.md`](testing.md) for the full breakdown (tiers, how to run
each, where reports land). Short version:

- **Per-service unit tests** (Tier 1 — run in CI). ROS Bridge `node:test`
  suite (~15 tests). FastAPI `pytest` suite covers config, auth, rate-limit,
  schemas, orders, CORS, and **retention** (`tests/test_retention.py`,
  added 2026-05-21 alongside the test-automation expansion).
- **Newman API smoke suite** (Tier 2, `docs/postman/`) — **13 sections /
  61 requests** covering every endpoint family plus negative cases, CORS
  pos/neg, and `/orders` cursor pagination. Runs via
  `.\docs\postman\run-newman.ps1`; reports under `docs/postman/reports/`.
- **PowerShell integration scripts** (Tier 2, `scripts/test/`) — ingestion
  pipeline (MQTT→DB), G19 retention prune SQL, G21 legacy-suffix safety,
  Mosquitto WS listener, rapid-order distinctness. Wrapped by
  `.\scripts\test\run-all.ps1` which also calls Newman + pytest + node:test.
- **Playwright E2E** (Tier 2, `frontend/tests/e2e/`) — non-robot React
  surface: AppShell, Health page live timestamp, Dashboard tile, Dispatch
  named + manual happy paths, Admin Maps/Robots/Fleet CRUD incl. 409 toast,
  Orders + OEE empty state, no-CORS-errors check. `cd frontend && npm run e2e`.
- **GitHub Actions CI** (`.github/workflows/ci.yml`) — five jobs:
  - **ROS Bridge** — `npm ci`, `node --check`, `npm test`.
  - **FastAPI** — `pip install -r requirements*.txt`, `compileall`, `pytest`.
    `tests/conftest.py` stubs the four DB calls `RobotRegistry.__init__`
    makes, so router imports don't need a live Postgres.
  - **Node-RED** — `flows.json` JSON validation.
  - **Frontend** — `npm ci`, `npm run typecheck` (`tsc -b --noEmit`), and
    `npm run build` (`tsc -b && vite build`). Added 2026-05-22 (G28).
  - **Newman API smoke** — boots `postgres + mosquitto + fastapi` via
    `docker compose`, waits for the FastAPI healthcheck, replays the
    13-section collection, uploads HTML+JSON reports as artifacts. Added
    2026-05-22 (G29).
  Playwright is still local-only (needs a live full stack with rosbridge);
  the Newman job is the in-CI substitute for HTTP-level contract drift.

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
  TypeScript type-checks cleanly (`tsc -b --noEmit` exits 0 as of
  2026-05-22 — 8 prior errors fixed; see CONTINUATION.md), Vite production
  build succeeds (only a chunk-size > 500 kB perf warning).
- **Unit-tested:** ROS Bridge `node:test`, FastAPI `pytest` (both green in
  CI as of 2026-05-21).
- **HTTP-tested:** Newman replays **61 requests / 66 assertions / 0 failed**
  against the running FastAPI (13 sections — full CRUD round-trips +
  negative cases + CORS pos/neg + `/orders` cursor pagination). The earlier
  `GET /robots/{serial}` snake_case asymmetry is now **resolved** (G23 —
  single-row robot endpoints return camelCase).
- **Integration-tested:** PowerShell scripts under `scripts/test/` cover the
  MQTT→DB ingestion pipeline, the G19 retention prune SQL, the G21 legacy-
  suffix safety, and the Mosquitto :9001 WS listener.
- **Browser-tested:** Playwright suite under `frontend/tests/e2e/` —
  **24/24 passed, 0 skipped, 0 failed** at last run. Covers AppShell,
  Health, Dashboard, Dispatch (named + manual), Admin CRUD
  (Maps / Robots / Fleet), Orders, OEE, CORS. Surfaced **G22** during
  development (frontend named-order camelCase vs FastAPI snake_case).
- **Manually verified:** the [manual-test-checklist.md](manual-test-checklist.md)
  carries `[auto: …]` tags inline. The leftover manual items (chaos / robot /
  UI / ops) are re-grouped by service in
  [manual-test-by-service.md](manual-test-by-service.md) for spot-checks.

---

## Not yet implemented (post-v1)

Tracked gaps **G1–G23 + G28 + G29 are resolved; G24–G27 + G30–G33 are open**
(see [gaps.md](gaps.md) for severity + repro and
[manual-test-remarks.md](manual-test-remarks.md) for the walkthrough
context behind G24–G27). G30–G33 are the previously "untracked next
steps" now promoted into the gaps tracker:

- **G30** — Frontend Dockerfile + `docker-compose.yml` service.
- **G31** — `GET /orders/{id}` detail endpoint for Order History drill-down.
- **G32** — MQTT auth + TLS on both broker listeners.
- **G33** — `"noEmit": true` in `frontend/tsconfig.json` to stop stray `.js`
  emission on `npm run build`.

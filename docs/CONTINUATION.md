# Continuation Notes — Where We Left Off

> A point-in-time handoff snapshot so work can resume without re-deriving context.
> **This decays** — trust the code and the canonical docs over this page.
> Last updated: 2026-05-22 (frontend typecheck fixed; manual-checklist walkthrough surfaced four real bugs — G24–G27 — and a batch of clarifications consolidated in `manual-test-remarks.md`).

---

## Current project state (snapshot)

End-to-end implemented + manually verified:

- **Backend (FastAPI + Mosquitto + ROS Bridge + Node-RED + PostgreSQL)** —
  code-complete, CI green, manually exercised against a real robot. All
  originally tracked gaps **G1–G23 closed** (see `docs/gaps.md`).
- **React frontend (`frontend/`)** — feature-complete v1: Dashboard, Robot
  Detail (live MapCanvas), Dispatch (named + manual), Teleop (camera + 3×3
  keyboard pad), Order History (paged), OEE dashboard (cards + bar chart +
  cycles log), Admin CRUD for Maps / Locations / Robots / Fleet Config, Health
  page. Stack: Vite 6 + React 19 + TS + Tailwind 4 + MUI 7 + MUI X (DataGrid
  & Charts) + TanStack Query + `mqtt` + `roslib`.
- **Realtime split** — MQTT-over-WS to Mosquitto :9001 for low-frequency
  telemetry; rosbridge direct from the browser per robot for high-frequency
  camera + teleop + map.
- **Newman smoke suite** (`docs/postman/`) — **13 sections / 61 requests /
  66 assertions** replayable via `.\docs\postman\run-newman.ps1`. HTML + JSON
  reports. Coverage extended 2026-05-21 with negative-case section (Phase 8),
  CORS pos/neg (Phase 9), and `/orders` cursor pagination.
- **CI** (`.github/workflows/ci.yml`) — three jobs (ROS Bridge, FastAPI,
  Node-RED). FastAPI suite includes `test_orders.py`, `test_cors.py`,
  `test_schemas.py`, `test_auth.py`, `test_config.py`, `test_ratelimit.py`.
  `tests/conftest.py` stubs the four DB calls `RobotRegistry.__init__` makes,
  so router imports don't need a live Postgres in CI.

Nothing tracked as open in `docs/gaps.md`. The manual test checklist
(`docs/manual-test-checklist.md`) is the long-form regression script;
Phase 9–13 cover the new frontend and Phase-0 backend work.

---

## Recently completed (most recent first)

**Frontend typecheck zero-errored + stray .js cleanup (2026-05-22, uncommitted).**
The frontend `npm run typecheck` had been failing with 8 errors; `npm run build`
worked but `tsc -b` (the typecheck phase of build) was also emitting compiled
`.js` files next to every `.ts` source in `frontend/src/`. Both issues addressed
in one pass.

- **8 typecheck errors fixed** across four files:
  - `frontend/src/api/orders.ts` — `ListOrdersQuery` got an index signature so
    it satisfies `apiFetch`'s `Record<string, …>` query type.
  - `frontend/src/vite-env.d.ts` — **new file** with the standard
    `/// <reference types="vite/client" />` directive. This typed
    `import.meta.env` for `branding.ts` + `config.ts` (the 2 `TS2339` errors).
  - `frontend/src/pages/admin/Locations.tsx` + `frontend/src/pages/OEE.tsx` —
    four `valueFormatter` callbacks rewritten to read from the `row` arg
    instead of `value`. MUI X Data Grid v7's `GridValueFormatter` types
    `value` as `never` when the column's `V` generic isn't inferred, which
    was the cause of the four `'never'` errors.
  - Verified: `npx tsc -b --noEmit` exits 0. `npm run build` still produces
    `dist/` cleanly (only the chunk-size > 500 kB warning, which is a perf
    hint, not an error).
- **50 stray `.js` files removed** from `frontend/`:
  - 49 `.js` files under `frontend/src/` (every one had a `.ts`/`.tsx` sibling)
  - `frontend/vite.config.js` (orphan of `vite.config.ts`)
  - `frontend/tsconfig.tsbuildinfo` (tsc incremental cache)
  - These were emitted by `tsc -b` in the build script because `tsconfig.json`
    doesn't set `"noEmit": true` (only the `typecheck` script passes
    `--noEmit` inline). They'll regenerate on the next `npm run build` until
    `noEmit` is added to the config — left for a follow-up since the user
    said cleanup only this session.
- **Gitignore safety net.** Added `typecheck.txt` + `build-output.txt` to
  `frontend/.gitignore` under a new "Throwaway captures" section so future
  log dumps don't get accidentally committed.

**Manual-checklist walkthrough — 4 new gaps + test clarifications (2026-05-22).**
The user worked through `docs/manual-test-checklist.md` end-to-end and added
inline `{…}` remarks to ~20 items. Surfaced four real bugs and a batch of
ambiguous-prompt clarifications. New gaps:

- **G24** — `GET /robots/{serial}/state` and `GET /system/status` return
  **HTTP 500** instead of `503 Database unavailable: …` when Postgres is
  down. The `DatabaseUnavailable` fallback in `app/db.py` is in place but the
  router(s) aren't catching it. Found during Phase 8 chaos test.
- **G25** — Health pills don't update in real time when FastAPI goes down.
  Only the **API** pill flips red; **DB** and **ROS** stay green until the
  page is refreshed (then API red, others idle). They're derived from
  `/system/status` (5 s poll) — on a failed poll the derived pills should
  also degrade, but they don't.
- **G26** — Dashboard tile "last seen" timer stays stuck at `0s ago` rather
  than ticking upward as time passes since the last `state` MQTT message.
  Suspected: the elapsed-time formatter doesn't have a `setInterval` driver,
  or the `lastSeen` state is reset on every render.
- **G27** — Named-location pin **labels** on `MapCanvas` are barely visible
  against the dark slate background (color similarity). Pin markers
  themselves render fine.

A new doc `docs/manual-test-remarks.md` consolidates every item with a remark
(answered "what was asked", "what was observed", "next step"). Several items
that looked like bugs were actually expected behaviour (e.g. mid-order
replacement) or user-side test setup issues (e.g. the G19 retention test
plant timestamp didn't end up 90 d old, so prune correctly left it alone).

**Test-automation suite fully green (2026-05-21, uncommitted).**
Both `.\scripts\test\run-all.ps1` and `npm run e2e` end-to-end passing on a
quiet stack:

- Phase 4 ingestion: **6/6** (`test-ingest.ps1`)
- Phase 6 G19 retention: **6/6** (`test-retention.ps1`)
- Phase 8/9 misc: **4/4** (`test-misc.ps1`)
- Newman backend HTTP: **66/66 assertions** (Phase 4 G20 + Phase 5 OEE + Phase 8 negative cases + Phase 9 CORS + cursor pagination)
- pytest fastapi-service: **36 passed**, 7 deprecation warnings (Pydantic v1 + `app.on_event` migration noise — non-blocking)
- node:test ros-bridge-service: **19/19**
- Playwright frontend E2E: **24/24** (0 skipped, 0 failed, 2.2 min)

Two real bugs surfaced and fixed during this push: **G22** (frontend
`postNamedOrder` sent camelCase but FastAPI expected snake_case — 422 on
every Dispatch → Named send) and **G23** (single-row `/robots/{serial}`
endpoints returned snake_case while the list endpoint returned camelCase —
API self-inconsistency). Both logged in `docs/gaps.md`.

**Test-automation expansion (2026-05-21, uncommitted).** Took the long-form
manual checklist (`docs/manual-test-checklist.md`) and automated everything
that can be automated without a robot or a service-stop-and-restart:

- **Newman collection** (`docs/postman/amr-integration.postman_collection.json`)
  grew from 10 to **13 sections** (61 requests). New sections 11/12/13 cover
  Phase 8 negative cases (missing y, UNKNOWN robot, bogus instant-action type,
  bad map_id, duplicate map_id, 404 trio on `/maps/nope`, `limit=501` clamp),
  CORS positive + negative (allowed Origin gets ACAO; evil Origin doesn't),
  and `/orders` cursor pagination via a captured `cursorTs` variable.
- **PowerShell integration scripts** under `scripts/test/`:
  - `test-ingest.ps1` — Phase 4 MQTT→DB pipeline (state + connection +
    malformed dropped + G20 happy body).
  - `test-retention.ps1` — Phase 6 G19 prune SQL (plant 90-day row, run prune,
    assert recents untouched).
  - `test-misc.ps1` — Phase 8 5-rapid-orders distinct + Phase 9 G21 legacy
    suffix tolerated + Mosquitto :9001 reachable.
  - `run-all.ps1` — wraps all three plus Newman, pytest, and `npm test`.
- **pytest** additions: `fastapi-service/tests/test_retention.py` covers the
  G19 lifespan hook (disabled when `TELEMETRY_RETENTION_DAYS=0`, scheduled
  when >0) and the prune SQL shape.
- **Playwright suite** at `frontend/tests/e2e/` covers the non-robot React
  surface (AppShell + 404 + LeftNav, Health page rows + live timestamp,
  Dashboard render + click-through, Dispatch named/manual happy paths,
  Admin Maps/Robots/Fleet CRUD incl. 409 toasts, Orders + OEE empty state,
  no-CORS-errors check). Added `@playwright/test` devDep, `e2e` / `e2e:ui` /
  `e2e:headed` npm scripts, `playwright.config.ts` that auto-spawns the
  Vite dev server. First-time setup: `npm install` + `npx playwright install
  chromium` (~150 MB).
- **Docs**: `docs/manual-test-checklist.md` got a status legend at the top
  and `[auto: newman|pytest|node|ps|e2e]` tags inline next to every
  automated item. New companion doc `docs/manual-test-by-service.md`
  re-groups the *remaining* manual items by service (Mosquitto, PostgreSQL,
  FastAPI, Node-RED, ROS Bridge, Frontend, cross-service) so spot-checks
  can be picked at random instead of phase-walked.

What's left manual on purpose: `[robot]`-gated items, service-stop chaos
(stop Postgres / stop Mosquitto), Node-RED DB-Admin tab clicks, frontend
visual interactions (canvas pixel-clicks, key-hold teleop, tooltip hovers).

**Node-RED DB Admin — View Tables pipeline (2026-05-21, uncommitted).** Added
a third section to the DB Admin tab so the operator can verify writes from
inside Node-RED without opening psql:

- **Row Counts** button — single `postgresql` node runs a 15-table
  `UNION ALL SELECT COUNT(*)` and prints `{tbl, rows}` to the debug pane.
- **11 per-table buttons** — only the live/log tables: `orders`,
  `order_nodes`, `order_edges`, `instant_action_messages`, `instant_actions`,
  `state_snapshots`, `state_node_states`, `state_action_states`,
  `state_errors`, `connection_log`, `oee_cycles`. Each fires one `SELECT *`
  with `ORDER BY ts DESC LIMIT 20` (or `ORDER BY id` for tables without `ts`).
  Each button has its own debug node so multiple inspections don't overwrite
  each other. The four reference tables (`fleet_config`, `maps`, `robots`,
  `named_locations`) were intentionally omitted — they barely change at
  runtime, and the `Row Counts` button still includes them.

Doc updated: `docs/services/node-red.md` Tab 5.

**Node-RED DB Admin — inline-SQL reset pipelines (2026-05-21, uncommitted).**
The previous `Reset DB` flow read `docs/schema/schema.sql` from disk via a
`file in` node and piped the whole payload into one `postgresql` node. In
practice the read was truncating — the schema only partially applied. Replaced
with two side-by-side reset pipelines on the **DB Admin** tab so we can A/B
which the `node-red-contrib-postgresql` driver actually accepts:

- **Pipeline A** — `inject → Reset Schema (postgresql) → Setup Tables
  (postgresql) → debug`. DDL inline in the first node's `query`, INSERT seed
  inline in the second's.
- **Pipeline B** — `inject → Apply full schema (postgresql) → debug`. The
  entire DDL+seed lives in one node's `query` field.

Both reach the same end state (drop + recreate 15 tables, reseed fleet_config /
maps / robots / named_locations). No filesystem dependency. The `Run custom
SQL` flow is unchanged. Once one pipeline is confirmed working, delete the
other. Doc updated: `docs/services/node-red.md` Tab 5 section.

> Caveat: the inline SQL is a hand-maintained copy of `docs/schema/schema.sql`.
> Edit both when the schema changes. `schema.sql` remains canonical (FastAPI's
> docker-compose still applies it on first boot).

**FastAPI CI fix — DB stub in conftest (2026-05-21, uncommitted).** GitHub
Actions was red because `test_orders.py` imports `app.routers.orders`, which
transitively imports `app.robots`, which constructs `registry = RobotRegistry()`
at module load, which calls `db.fetch_fleet_config()` — no Postgres in CI.

- New `fastapi-service/tests/conftest.py` — starts four `unittest.mock.patch`
  instances against `app.db.fetch_fleet_config`, `app.db.fetch_robots`,
  `app.db.fetch_max_header_ids`, `app.db.fetch_max_order_suffixes` returning
  canned fleet data (one robot `amr001`, identity `amr/v2/moverobotic`).
- `conftest.py` is loaded by pytest before any test file, so the patches are
  in place when the module-level `RobotRegistry()` call fires.
- Production fail-fast design unchanged: `app/robots.py` still raises if
  Postgres is unreachable at startup; only the test-time path gets a stub.
- After this change the FastAPI CI job is green.

**Newman smoke-test suite (2026-05-21, uncommitted).** Replayable HTTP smoke
tests for the FastAPI gateway.

- New folder `docs/postman/` with:
  - `amr-integration.postman_collection.json` — collection v2.1 with 10
    grouped sections (health, fleet, robots read/write, orders + instant
    actions, order history, OEE, maps + locations CRUD, ingest). Every
    request carries at least a status-code assertion; CRUD blocks are
    self-cleaning.
  - `local.postman_environment.json` — `baseUrl` + `apiKey` placeholders.
  - `run-newman.ps1` — wraps `npx newman run` with CLI + JSON + HTML reporters.
    First run pulls `newman` + `newman-reporter-htmlextra` via the npx cache.
  - `README.md` — usage, what's covered, how to add tests, CI pointer.
- Pre-request script strips the `X-API-Key` header automatically when the
  environment's `apiKey` is empty, so the same collection works against an
  open-API local FastAPI and a locked-down deployment.
- `docs/manual-test-checklist.md` Conventions block now points to the Newman
  runner as the preferred path for HTTP smoke; the manual checklist remains
  for the behavioural scenarios Newman can't easily express.

**React frontend — Phase 4 analytics + admin (2026-05-20, uncommitted).** Every
route is now a real screen. The UI is feature-complete for v1.

- **Cross-cutting polish** — `SnackbarProvider` (wrapped in `AppProviders`)
  with a `useToast()` hook (`success`/`error`); `ConfirmDialog` for
  destructive actions; `EditDrawer` with header/body/footer slots that the
  four admin pages reuse.
- **Order History** (`/orders`) — DataGrid off `GET /orders` with
  `useInfiniteQuery`. Filter by robot, choose page size (25–200). "Load older"
  uses the last row's `ts` as the cursor; button changes to "End of history"
  when there's no more.
- **OEE** (`/oee`) — robot picker; four summary cards
  (`total`/`succeeded`/`failed`/`avg`) with success-rate hint, an availability
  bar, an MUI X `BarChart` of recent cycle durations, and a paginated
  cycles log via DataGrid.
- **Admin → Maps** — DataGrid + + Add / edit drawer / delete with 409
  surfaced as a toast; the EditDrawer keeps the ID field read-only on edit.
- **Admin → Named Locations** — same DataGrid pattern; the edit drawer embeds
  the Phase 3 `MapCanvas` and binds `onClickWorld` so clicking on the map
  sets `x` / `y` in the form. Pins re-render live as you type the label.
- **Admin → Robots** — DataGrid + drawer; `createRobot` / `updateRobot` /
  `deleteRobot` added to `api/robots.ts`. A persistent `Alert` reminds the
  operator that adding a robot still needs a ROS Bridge restart.
- **Admin → Fleet Config** — single form (interface_name, major_version,
  version, manufacturer) with a warning callout explaining that
  topic-prefix-affecting fields will silence robot firmware listening on the
  old prefix.
- **Deps** — added `@mui/x-data-grid` + `@mui/x-charts` (`^7.20.0`) to
  `frontend/package.json`. Run `npm install` again before `npm run dev`.

**React frontend — Phase 3 v1 screens (2026-05-20, uncommitted).** Dashboard,
Robot Detail (with live map), Dispatch, and Teleop are all real and reachable.
Order History, OEE, and the Admin pages are still Phase 4 placeholders.

- **Foundation** — `helper/angleHelper.ts` (degrees ↔ quaternion, direct port
  of the v1 interface helper); `helper/mqttTopics.ts` (VDA topic builder from
  fleet config); `types/ros.ts` (OccupancyGrid, Pose*, Path, CompressedImage,
  Twist). Rosbridge client extended with `subscribeRosTopic` /
  `acquireRosPublisher`. New hooks: `useRosTopic`, `useRosPublisher`,
  `useRobotState` (REST cold-load + MQTT live merge).
- **MapCanvas** (`components/map/MapCanvas.tsx`) — full custom canvas
  renderer, no `ros2djs`. Subscribes per-robot to `/reference/map`,
  `/amcl_pose`, `/robot_pose_ekf_node/odom_combined`, and the two DWA plan
  topics. ROS Y-flip + offscreen canvas for the bitmap, world→pixel transform
  for overlays. AMCL primary, EKF fallback after 2 s silence; the arrow gets
  an amber fill on fallback so the operator notices. Responsive via
  ResizeObserver. Click → world coordinate (used in Dispatch later).
- **Dashboard** — fleet grid of `RobotTile`. Each tile shows the connection
  state, mode, battery, current orderId, "last seen", map, and per-robot
  rosbridge status. Clicking a tile navigates to `/robots/:serial`.
- **Robot Detail** — MapCanvas left, tabbed side panel (State / Errors /
  Actions) right. Named-location pins drawn on the map from
  `/locations` filtered to the robot's map. Errors tab badge-counts the
  current error list.
- **Dispatch** — robot picker + Named-or-Manual toggle. Named mode adds
  locations from `/locations` (filtered to the robot's map) in order;
  manual mode is one-or-more x/y/θ rows. Below the builder, `ActiveOrderPanel`
  shows the live orderId, remaining `nodeStates`, and the Cancel / Retry /
  Skip buttons (instant actions).
- **Teleop** — robot picker + ENGAGED toggle (gates publishing). Camera
  stream (`/camera/front/image_raw/compressed`) on the left, 3×3 keyboard pad
  on the right. Velocity table inherits the v1 contract — LINEAR 0.3 m/s,
  ANGULAR 0.5 rad/s, 100 ms repeat — QWE/ASD/ZXC layout, mouse + touch +
  keyboard. Releases publish a zero Twist; auto-disengages if rosbridge
  drops.
- **Docs** — `schema/ROS_TOPICS.md` gained a "consumed directly by the React
  frontend" table at the top so the ROS-side contract is one click away.

Next (Phase 4): Order History (`GET /orders`, paged with cursor), OEE charts
(MUI X Charts on `GET /robots/{serial}/oee/*`), and the four Admin pages
(Maps, Locations, Robots, FleetConfig — DataGrid + drawer-style edit forms
on the existing CRUD endpoints).

**React frontend — Phase 2 connectivity layer (2026-05-20, uncommitted).** All
three live channels (REST, MQTT, rosbridge) are wired and the AppBar pills +
Health page show live data. Screens themselves still placeholder — Phase 3
builds the v1 features on top of this.

- **Typed REST client** — `src/api/client.ts` is a single `apiFetch` wrapper
  (base URL, optional `X-API-Key` from `VITE_API_KEY`, JSON body/parse, typed
  `ApiError`). Per-router modules `fleet.ts`, `robots.ts`, `orders.ts`,
  `system.ts`, `maps.ts`, `locations.ts`, `oee.ts` expose one async function
  per endpoint. Response types in `src/types/api.ts` are hand-written to match
  the FastAPI shapes — OpenAPI generation deferred (needs running backend).
- **MQTT singleton** — `src/realtime/mqttClient.ts` opens one WS to
  `VITE_MQTT_WS_URL` lazily on first subscribe/status listener. Reference-counted
  subscriptions, MQTT wildcard matching (`+`/`#`), JSON auto-parse, status
  observable, mqtt.js exponential reconnect with re-subscribe on reconnect.
- **Rosbridge factory** — `src/realtime/rosbridgeClient.ts` keeps one
  `ROSLIB.Ros` per URL, cached. `acquireRos(url)` + `release()` ref-counts
  the connection. `onRosStatus(url, listener)` is the per-robot status
  observable. Custom exponential backoff (1 s → 30 s). Topic / publisher /
  service wrappers deferred to Phase 3.
- **Hooks** — `useFleet` (React Query, `/fleet`), `useSystemStatus` (5 s
  poll, no retries — failure = red pill), `useMqttStatus`, `useMqttTopic`
  (returns `{ payload, topic }`), `useRosStatus(url)`.
- **AppBar pills** — four live pills: **API** (from `useSystemStatus`),
  **MQTT** (from `useMqttStatus`), **DB** + **ROS** (from
  `/system/status` body). Tooltips on each show the underlying state.
- **Health page** — upgraded from placeholder to a real readout: 6 service
  rows (FastAPI, MQTT browser, MQTT backend, Postgres, rosbridge fleet,
  Node-RED) with state pills + descriptive subtext.

Next (Phase 3 — v1 screens):
1. Dashboard — pulls `useFleet` + MQTT `state`+`connection` per robot,
   renders RobotTile grid.
2. Robot detail — map (`/reference/map` over rosbridge), pose arrow
   (AMCL primary, EKF fallback), order path overlays, errors panel.
3. Order dispatcher — click-on-map / named-location / x,y,θ inputs;
   POST + active-order panel with cancel/retry/skip.
4. Teleop — camera + 3×3 keyboard pad publishing `/web_teleop/cmd_vel`
   (LINEAR_SPEED 0.3, ANGULAR_SPEED 0.5, 100 ms repeat — inherited from
   the old interface).

**React frontend — Phase 1 scaffold (2026-05-20, uncommitted).** New `frontend/`
workspace; routes, layout, and branding are reviewable. No data wiring yet —
that lands in Phase 2.

- **Stack:** Vite 6 + React 19 + TypeScript, Tailwind 4 + MUI 7 (Tailwind
  `important: 'html'` so utilities win over MUI's component styles), TanStack
  Query, `mqtt`, `roslib`. Path alias `@/* → src/*`.
- **AppShell** — `components/layout/{AppShell,AppBar,LeftNav}.tsx`. Permanent
  left nav with two sections (Operate, Admin); the AppBar carries the brand
  logo + name and three stub StatusPills (MQTT / DB / ROS) that Phase 2 will
  wire to live data.
- **Branding** — `src/branding/branding.ts` is the single source of truth
  consumed by both Tailwind (build-time via `tailwind.config.ts`) and MUI
  (runtime via `AppProviders.tsx`). Default palette inherits the previous
  interface (slate-900 / indigo-500). Editing one file rebrands the app.
- **Routes** — `/`, `/robots`, `/robots/:serial`, `/dispatch`, `/orders`,
  `/oee`, `/teleop`, `/teleop/:serial`, `/health`, `/admin/{maps,locations,robots,fleet}`,
  `*` (404). Every page is a `PagePlaceholder` shell that names which phase
  will deliver it. The router compiles and navigates without any backend
  running.
- **Dev experience** — Vite proxies `/api/*` → `VITE_API_URL` so the React app
  can call same-origin paths in dev (CORS is still in place on the backend as
  a backup for prod). `.env.example` documents all `VITE_*` vars.
- **Docs** — new `frontend/README.md`; `docs/setup.md` got a step 6 and four
  `VITE_*` rows in the env-vars table.

**Next (Phase 2 — connectivity layer):** add `src/api/*` (typed REST client
wrappers, one per FastAPI router), `src/realtime/{mqttClient,rosbridgeClient}.ts`,
`src/hooks/{useFleet,useRobotState,useMqttTopic,useRosTopic,useSystemStatus}.ts`,
generate `types/openapi.d.ts` from FastAPI's `/openapi.json`, and wire the
three header StatusPills + the Health page to live data. Phase 3 builds the
v1 screens on top.

**React frontend — Phase 0 backend prep (2026-05-20, uncommitted).** Backend
work that unblocks the new React UI; no frontend code yet.

- **G18 closed — CORS.** `main.py` registers `CORSMiddleware`; origins from
  `CORS_ORIGINS` env (comma-separated, default `http://localhost:5173`).
  `.env.example` and `schema/REST_ENDPOINTS.md` document the var. The last open
  audit gap is now resolved.
- **New `GET /orders` endpoint** — paged historical order list for the UI's
  Order History screen. Filters: `serial`, `limit` (1–500, default 50), `before`
  (ISO timestamp cursor). New `routers/orders.py` + `db.fetch_orders()`
  (LEFT JOIN-aggregating `node_count` from `order_nodes`). Registered guarded
  by `X-API-Key` in `main.py`. Documented in `schema/REST_ENDPOINTS.md`.
- **Mosquitto WebSocket listener on port 9001** for the browser MQTT client.
  Added to `mosquitto/mosquitto.conf` (3-line block, `protocol websockets`,
  anonymous), exposed in `docker-compose.yml`. Backend services still use 1883
  unchanged. Documented in `schema/MQTT_TOPICS.md` (new "Broker listeners" §).
- **Tests** — `tests/test_orders.py` (5 SQL-shape + 3 router cases) and
  `tests/test_cors.py` (4 origin / preflight cases). `httpx` added to
  `requirements-dev.txt` for `TestClient`.

Next: Phase 1 — scaffold `frontend/` (Vite + React + TS + Tailwind + MUI), wire
the realtime singletons (REST client, MQTT-over-WS, rosbridge per robot), and
deliver the AppShell + health pills as the first vertical slice. ROS contract
to follow is captured in `docs/old-interface/PROJECT_OVERVIEW.md` (map topic
`/reference/map`, camera `/camera/front/image_raw/compressed`, teleop
`/web_teleop/cmd_vel`, action `/move_base`, degrees-at-UI angle convention).

**Node-RED DB Admin tab + db.py startup-crash fix (2026-05-20, uncommitted).**

- **`fetch_max_order_suffixes` crash on startup.** When seeding the per-robot
  order-suffix counters (G21), `app/db.py` was casting
  `split_part(order_id, '-order-', 2)` to INTEGER for every row in `orders`.
  Legacy / hand-inserted `order_id` values whose suffix wasn't numeric (e.g.
  a row whose suffix happened to be `goal`) made the CAST throw
  `InvalidTextRepresentation` and FastAPI failed to boot. Fixed by filtering rows
  to the canonical template — `WHERE split_part(order_id, '-order-', 2) ~ '^[0-9]+$'`
  — so non-matching rows are ignored.
- **New "DB Admin" tab in `node-red/flows.json`.** Two utility flows:
  - **Reset DB** — `inject` → `file in` reads `docs/schema/schema.sql` from disk
    → `postgresql` node executes it → `debug`. Drops + recreates all 15 tables
    and reseeds `fleet_config`, `maps`, `robots`, `named_locations`.
  - **Run custom SQL** — `inject` (editable SQL payload, preloaded with
    commented examples) → `postgresql` node → `debug`. For ad-hoc inserts.
  - Shared config node `db-pg-config` (host=localhost, db=amr_integration,
    user=postgres, password=admin) targets the same instance as
    `docker-compose.yml`.
- **Dependency:** `node-red-contrib-postgresql` (`~0.15.4`) added to
  `node-red/package.json`. `npm install` in `node-red/` before next Node-RED
  start.
- Docs updated: `docs/gaps.md` (note on G21 fix), `docs/services/node-red.md`
  (Tab 5 added), `docs/setup.md` (step 4b + DB-reset tip).

**Gaps G15–G21 closed except G18 (2026-05-18, uncommitted).** Six of the seven
audit gaps are resolved; **G18 (CORS) was deferred by the user** — not needed until
the React frontend work begins, kept open in [gaps.md](gaps.md).

- **G16 — DB connection pooling.** `app/db.py` serves connections from a lazily
  built `psycopg2.pool.ThreadedConnectionPool`; `_transaction` / `_query` /
  `_execute` borrow + return instead of connect-per-query. New `_execute_returning`
  helper for writes with `RETURNING` (also translates integrity errors). Pool size:
  `DB_POOL_MIN` / `DB_POOL_MAX`. `DatabaseUnavailable` fallback preserved.
- **G21 — counter persistence.** `RobotRegistry` seeds `headerId` / `orderId`
  counters from the DB at startup (`db.fetch_max_header_ids`,
  `db.fetch_max_order_suffixes`) so a restart resumes rather than resets.
- **G20 — ingest validation.** `/ingest/*` routes typed with Pydantic models
  (`IngestStateMessage` etc. in `app/schemas.py`, `extra="allow"` for VDA5050
  arrays); malformed payloads → 422, not 500.
- **G15 — reference-data CRUD.** New `routers/maps.py`, `routers/locations.py`;
  robot CRUD added to `routers/robots.py`; `PUT /fleet` added to `routers/fleet.py`.
  `db.py` CRUD helpers; `IntegrityConflict` → HTTP 409 (FK never cascaded).
  `registry.reload()` after robots / fleet_config writes. Registered in `main.py`.
- **G17 — navigation-failure observability.** `OrderStateMachine` records a
  `navigationFailed` error on a non-`SUCCEEDED` result and exposes `getErrors()`;
  `StateBuilder` merges it into `state.errors`. Cleared on the next node success.
- **G19 — telemetry retention.** `main.py` background task prunes `state_snapshots`
  + `connection_log` older than `TELEMETRY_RETENTION_DAYS` (default 30; 0 disables)
  every 6 h via `db.prune_telemetry`.
- **Tests.** ROS Bridge `npm test` — 19 passing (added G17 cases). FastAPI new
  `tests/test_schemas.py` (8 tests, ingest + CRUD model validation) — passing.

**Gap audit — G15–G21 opened (2026-05-18).** A code review surfaced seven gaps;
see [gaps.md](gaps.md).

**Operational gaps G10/G11/G13/G14 closed (2026-05-18, uncommitted).** The last four
operational-readiness gaps are resolved — all of G1–G14 are now done.

- **G10 — authentication.** New `fastapi-service/app/auth.py`: opt-in `X-API-Key`
  auth via the `API_KEY` env var (unset = open API, the local-dev default). Guards
  the client-facing routers (`robots`, `fleet`, `system`, `oee`); `/ingest/*` is
  left open as the internal Node-RED → DB boundary. The ROS Bridge (`index.js`)
  sends the key on `GET /fleet` when `API_KEY` is set.
- **G11 — rate limiting.** New `fastapi-service/app/ratelimit.py`: a per-client-IP
  sliding-window middleware, `RATE_LIMIT_PER_MINUTE` (default 120, `0` disables).
  `/ingest/*` and docs routes are exempt; over-limit → 429 + `Retry-After`.
- **G13 — tests.** ROS Bridge `node:test` suite under `ros-bridge-service/test/`
  (15 tests, `npm test` — passing locally). FastAPI `pytest` suite under
  `fastapi-service/tests/` (config/auth/ratelimit); needs `requirements-dev.txt`
  installed — **not run locally yet** (pytest not installed in this environment),
  but wired into CI. `mapStatus` was exported from `orderStateMachine.js` for tests.
- **G14 — Docker & CI.** `Dockerfile` for each service, root `docker-compose.yml`
  (full stack, healthcheck-gated start order, auto-applies `schema.sql`),
  `.github/workflows/ci.yml`. `mosquitto/mosquitto.conf` was written (it was empty).
  `node-red/flows.json` MQTT broker host is `${MQTT_HOST}` (a whole-property
  `${ENV}` — Node-RED substitutes those). The `/ingest/*` HTTP URLs are built in
  the validating `function` nodes via `env.get('FASTAPI_HOST')` and passed as
  `msg.url` (the `http request` nodes have a blank `url`) — embedded `${ENV}` in a
  URL string is *not* substituted by Node-RED, so this is the reliable form. Both
  default to `localhost` via `settings.js`; docker-compose overrides them
  (`MQTT_HOST: mosquitto`, `FASTAPI_HOST: fastapi`).

**Real map seed data (2026-05-18, uncommitted).** `docs/schema/schema.sql` —
replaced the `'default'` placeholder map with two real maps, `map-001`
("Default Sim World") and `map-002` ("Office CPR"). `amr001` and all four named
locations re-pointed from `'default'` to `map-001`. Added the `map-NNN`
(zero-padded 3-digit) naming convention so maps stay filterable
(`WHERE map_id LIKE 'map-%'`) and sortable. This resolves the old placeholder-`mapId`
caveat. No code changes — seed data only.

**The VDA5050 migration is fully implemented — Phases 0–7 done** (see
[plans/vda5050-migration.md](plans/vda5050-migration.md)). The project has moved off
the legacy `amr/*` scheme entirely; it now speaks VDA5050 end to end and is
multi-robot capable.

1. **Phase 0** — `docs/schema/VDA5050_MESSAGES.md`; `ros-bridge-service/robots.config.json`.
2. **Phase 1** — `ros-bridge-service` refactored into `Robot` + `FleetManager` classes.
3. **Phases 2 & 3** — `ros-bridge-service` rewritten for VDA5050: `vda5050.js`,
   `orderStateMachine.js`, `stateBuilder.js`; `Robot` subscribes `order`/
   `instantActions`, publishes `state`/`connection` (retained, `CONNECTIONBROKEN`
   Last-Will). `navigation.js`/`navFeedback.js`/`health.js` deleted. Per-robot MQTT
   client.
4. **Phase 4** — `fastapi-service` is the FMS gateway: `app/robots.py`, `app/vda5050.py`,
   robot-scoped routes; `routers/amr.py` deleted; `requirements.txt` added.
5. **Phase 5** — `node-red/flows.json` rewritten: Telemetry Ingestion, Command Audit,
   OEE, Test Harness tabs. Persists via HTTP POST to FastAPI `/ingest/*`.
6. **Phase 6** — `docs/schema/DATABASE_SCHEMA.md` rewritten serial-keyed; FastAPI
   `app/db.py` (lazy psycopg2) + `routers/ingest.py`.
7. **Phase 7** — `robots.config.example.json`; all schema docs + `architecture.md`,
   `status.md`, `gaps.md` updated.
8. **Knowledge-base sync** — `README.md`, `overview.md`, `setup.md`, `decisions.md`,
   `glossary.md`, all three `docs/services/*.md`, and the project memory updated to the
   VDA5050 implementation.
9. **Full database normalization (2026-05-17)** — the schema is now fully normalized
   (1NF-strict, BCNF — 14 tables). `DATABASE_SCHEMA.md` rewritten; `app/db.py` write
   helpers are multi-table transactions; `routers/ingest.py` and `node-red/flows.json`
   unchanged; `decisions.md` + `gaps.md` updated. See § below.

## Current state

- **Code-complete and syntax-checked, NOT end-to-end runtime-tested.**
  - ros-bridge-service: all files `node --check` + module-graph import OK;
    `npm test` (15 `node:test` tests) passing.
  - fastapi-service: all files `py_compile` OK; `pytest` suite written, runs in CI,
    not yet run locally (pytest not installed here).
  - node-red/flows.json: valid JSON, node-graph integrity OK.
- **Gaps G1–G17, G19–G21 resolved; only G18 (CORS) open** ([gaps.md](gaps.md)).
  G18 was deferred by the user until the React frontend work begins.

---

## ✅ DONE: full database normalization (2026-05-17)

The Phase 6 schema stored VDA5050 arrays as **JSONB** (a 1NF violation). It has been
rewritten as a fully normalized, 1NF-strict, BCNF relational schema — **14 tables**,
with real foreign keys (every log table FKs `serial_number` → `robots`).

### Schema — 14 tables

| Group | Tables |
|---|---|
| Reference (3) | `maps`, `robots`, `named_locations` |
| Orders (3) | `orders` (header), `order_nodes` (`nodePosition` flattened in), `order_edges` |
| Instant actions (2) | `instant_action_messages` (header), `instant_actions` |
| State (4) | `state_snapshots` (scalar only), `state_node_states`, `state_action_states`, `state_errors` |
| Connection + OEE (2) | `connection_log`, `oee_cycles` |

- The JSONB `order_log` table is gone; the JSONB columns on `state_snapshots` are gone.
- VDA5050 subset: order/edge `actions[]`, state `edgeStates[]`, `actionParameters[]`
  are always empty — no tables for them (documented in `DATABASE_SCHEMA.md`).
- Trade-off: each `state` message is now a multi-row transaction; `state_node_states`
  is the fastest-growing table. Fine for the FYP; documented.

### What changed

- `docs/schema/DATABASE_SCHEMA.md` — rewritten for the 14-table schema + Normalization §.
- `fastapi-service/app/db.py` — `insert_state()` / `_insert_order()` /
  `_insert_instant_actions()` are multi-table transactions via a new `_transaction()`
  context manager; `fetch_latest_state()` joins child tables back. `py_compile` OK.
- `fastapi-service/app/routers/ingest.py` — **unchanged** (`insert_command(kind, msg)`
  signature kept; dispatch is internal to `db.py`).
- `node-red/flows.json` — **unchanged**.
- `docs/decisions.md` + `gaps.md` — updated.
- `docs/schema/schema.sql` — added as the runnable copy of the schema (also drops the
  legacy `order_log` table).

## ✅ DONE: G7 + G8 + G9 (2026-05-17)

- **G7 — `/system/status` roslib + Node-RED.** FastAPI's MQTT client (`app/mqtt.py`)
  now subscribes the retained `connection` topics; `roslib_status()` infers rosbridge
  liveness from them. `node_red` is a best-effort HTTP probe of `NODE_RED_URL` (default
  `http://localhost:1880`). Neither field is `unknown` in normal operation.
- **G8 — named locations from the DB.** `POST /robots/{serial}/order/named` now reads
  the `named_locations` table via `db.fetch_named_locations()`; `app/data.py` deleted.
  `theta` is read straight from the table (radians) — the old degrees→radians
  conversion is gone.
- **G9 — env-var validation + `.env.example`.** FastAPI validates required vars at
  startup via `app/config.py` (`validate_env()` in `main.py`); the ROS Bridge checks
  in `index.js`. Both fail fast with a clear message. `.env.example` committed for both
  services.

## ✅ DONE: database as single source of truth (2026-05-17)

The fleet definition was duplicated — `robots.config.json` *and* a hand-copied DB seed.
It now lives **only in the database**:

- New `fleet_config` single-row table (interfaceName/majorVersion/version/manufacturer);
  `robots.manufacturer` column dropped. Schema is now **15 tables**.
- FastAPI `RobotRegistry` (`app/robots.py`) loads the fleet from the DB at startup via
  `db.fetch_fleet_config()` + `db.fetch_robots()`.
- New `GET /fleet` endpoint (`app/routers/fleet.py`).
- ROS Bridge `index.js` fetches `GET /fleet` from `FLEET_API_URL` at startup;
  `FleetManager` takes the config object instead of reading a file.
- `robots.config.json` + `robots.config.example.json` **deleted**; `ROBOTS_CONFIG`
  env var gone; ROS Bridge gains `FLEET_API_URL`.
- **Start order now matters:** PostgreSQL → FastAPI → ROS Bridge (startup deps, not
  retried).

### NEXT: runtime-test the pipeline

- **Runtime-test the pipeline** — needs MQTT broker, rosbridge + a robot, PostgreSQL.
  Either `docker compose up --build` (brings up the whole stack in order and
  auto-applies the schema), or manually: `pip install -r fastapi-service/requirements.txt`;
  create the DB + apply `docs/schema/schema.sql`; start services **in order**
  (Postgres → FastAPI → ROS Bridge → Node-RED). Then `POST /robots/amr001/order` and
  verify auto-advance, instant actions, and the retained `CONNECTIONBROKEN`.
- Run the FastAPI `pytest` suite once `requirements-dev.txt` is installed.
- All gaps G1–G14 are resolved. The reference-data CRUD API (G15) is the next
  feature — see the PLANNED section below.

---

## ✅ DONE: CRUD API for reference data (G15) — 2026-05-18

Per-row CRUD for the reference tables is implemented as designed below. Endpoints:
`maps` (`routers/maps.py`), `named_locations` (`routers/locations.py`), robot CRUD on
`routers/robots.py`, `PUT /fleet` on `routers/fleet.py`. FK / unique violations →
HTTP 409 via `db.IntegrityConflict` (never cascaded); `registry.reload()` runs after
robots / fleet_config writes. The original design follows for reference.

### Endpoints to add

| Resource | Routes | Router file |
|---|---|---|
| Maps | `GET /maps`, `GET /maps/{map_id}`, `POST /maps`, `PUT /maps/{map_id}`, `DELETE /maps/{map_id}` | new `routers/maps.py` |
| Named locations | `GET /locations`, `GET /locations/{id}`, `POST /locations`, `PUT /locations/{id}`, `DELETE /locations/{id}` | new `routers/locations.py` |
| Robots | add `GET /robots/{serial}`, `POST /robots`, `PUT /robots/{serial}`, `DELETE /robots/{serial}` (`GET /robots` exists) | extend `routers/robots.py` |
| Fleet config | add `PUT /fleet` to update the single `fleet_config` row (`GET /fleet` exists) | extend `routers/fleet.py` |

### Files to change

1. `fastapi-service/app/db.py` — add write helpers: `insert_map`/`update_map`/
   `delete_map`, `insert_robot`/`update_robot`/`delete_robot`,
   `insert_named_location`/`update_named_location`/`delete_named_location`,
   `update_fleet_config`. Single-row read helpers (`fetch_map`, `fetch_robot`, …) as
   needed. Reads `fetch_robots`/`fetch_named_locations`/`fetch_fleet_config` exist.
2. `fastapi-service/app/schemas.py` — Pydantic create/update models
   (`MapIn`, `RobotIn`, `NamedLocationIn`, `FleetConfigIn`).
3. `fastapi-service/app/routers/maps.py`, `locations.py` — new; register in `main.py`.
4. `fastapi-service/app/routers/robots.py`, `fleet.py` — add the robot / fleet routes.
5. `docs/schema/REST_ENDPOINTS.md`, `DATABASE_SCHEMA.md` — document the new endpoints.

### Cross-cutting concerns (must handle)

- **FK conflicts → HTTP 409.** Deleting a `map` that `robots` or `named_locations`
  still reference, or a `robot` that already has telemetry rows, raises a Postgres FK
  violation. Catch it and return **409 Conflict** with a clear message — do **not**
  cascade-delete (that would wipe telemetry history).
- **Registry refresh.** FastAPI's `RobotRegistry` loads the fleet **once at startup**.
  After any `robots` / `fleet_config` write, call a new `registry.reload()` (re-runs
  `fetch_fleet_config()` + `fetch_robots()`; keeps the in-memory `headerId`/`orderId`
  counters). Otherwise the new robot is invisible until a restart.
- **ROS Bridge still needs a restart for a new robot.** It instantiates one `Robot`
  per `GET /fleet` entry **at boot**. CRUD makes the DB live-editable, but a newly
  added robot only starts running after the ROS Bridge restarts. Document this; a
  later improvement could have the ROS Bridge re-poll `/fleet`.
- **Validation.** Enforce existing constraints at the API layer too — e.g. a robot's
  `mapId` must reference an existing map; reject before hitting the DB for a clearer
  error.

### Suggested sequencing

`maps` + `named_locations` first (simplest — no registry refresh, only delete needs
the 409 guard), then `robots` (FK + `registry.reload()`), then `fleet_config` (just a
`PUT`). Best done **after** the runtime test, so CRUD is built on a verified pipeline.

## Watch out for

- **Nothing has been committed** — the user pushes via GitHub Desktop.
- **Start order** — PostgreSQL must be up before FastAPI (it loads the fleet from the
  DB at boot, no DB = no start); FastAPI before the ROS Bridge (it fetches `GET /fleet`).
- **Node-RED userDir** — Node-RED defaults to `C:\Users\aimno\.node-red\` (old April
  flows). Start it with `node-red --userDir "d:\FYP\integration-system\node-red"`, and
  fully stop any old instance first or it overwrites `flows.json` on deploy.
- FastAPI DB env vars (defaults): `DB_HOST` localhost, `DB_PORT` 5432, `DB_NAME`
  amr_integration, `DB_USER` postgres, `DB_PASSWORD` admin.
- Node-RED's `/ingest/*` calls assume FastAPI at `http://localhost:8000`; the ROS
  Bridge's `FLEET_API_URL` defaults to `http://localhost:8000/fleet`.
- Maps now use the `map-NNN` convention (`map-001`, `map-002`) — seeded in
  `schema.sql`. Add new maps with the next `map-NNN` id and a human-readable `label`.

## Canonical docs

[overview.md](overview.md) · [architecture.md](architecture.md) ·
[status.md](status.md) · [gaps.md](gaps.md) ·
[plans/vda5050-migration.md](plans/vda5050-migration.md) ·
[schema/VDA5050_MESSAGES.md](schema/VDA5050_MESSAGES.md) ·
[schema/MQTT_TOPICS.md](schema/MQTT_TOPICS.md) ·
[schema/REST_ENDPOINTS.md](schema/REST_ENDPOINTS.md) ·
[schema/DATABASE_SCHEMA.md](schema/DATABASE_SCHEMA.md)

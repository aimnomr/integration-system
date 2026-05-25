# Manual spot-check checklist — grouped by service

Companion to [`manual-test-checklist.md`](manual-test-checklist.md). That file
walks the whole stack phase-by-phase; this one re-groups the items by the
**service** they exercise, so you can pick a service at random and verify it
without scrolling through unrelated steps.

Only items **not** already covered by automation appear here. (For the full
phase narrative, including everything that automation already replays, see
the phase-ordered checklist.) Each item is annotated with:

- `[robot]` — needs a live robot/sim publishing
- `[chaos]` — needs you to stop or restart a service mid-flight
- `[UI]` — visual / interaction test you have to eyeball
- `[ops]` — config / log inspection

When you have the full stack up, run automation first:

```powershell
.\scripts\test\run-all.ps1          # backend + Newman + pytest + node:test
cd frontend; npm run e2e             # Playwright (non-robot frontend)
```

Then dip into any service section below to spot-check the leftover manual
items. Each section is independent.

---

## 1. Mosquitto (MQTT broker)

The fast bits (broker reachable, WS listener on :9001, malformed-payload-dropped)
are automated by `scripts\test\test-ingest.ps1` and `scripts\test\test-misc.ps1`.
What's left:

- `[ops]` `mosquitto.conf` actually contains the `listener 9001` + `protocol websockets` block (Phase 9).
- `[ops]` Mosquitto log shows two listeners on start-up (one TCP, one WS).
- `[chaos]` Stop Mosquitto → `/system/status` `mosquitto` flips to `disconnected`; FastAPI / Node-RED / ROS Bridge log reconnection attempts.
- `[chaos]` Restart Mosquitto → all three reconnect on their own; no manual intervention.
- `[robot]` Kill the ROS Bridge process → its retained `connection` topic flips to `CONNECTIONBROKEN` (Last-Will); `/system/status` `roslib` reflects it.
- `[UI]` Browser → DevTools → Network → WS tab: one WebSocket to `ws://localhost:9001/mqtt` in `connected` state with heartbeat frames.

---

## 2. PostgreSQL

Schema CRUD, retention prune, and ingest paths are covered by Newman, pytest,
and `scripts\test\test-retention.ps1`. What's left:

- `[ops]` `schema.sql` matches what's in the running DB (no drift):
  `psql -d amr_integration -c "\dt"` lists `robots, maps, named_locations, fleet_config, orders, order_nodes, state_snapshots, node_states, action_states, error_states, connection_log, oee_cycles`.
- `[ops]` `node_count` field on `/orders` matches `SELECT count(*) FROM order_nodes WHERE order_pk=<id>` for a sampled row.
- `[chaos]` With FastAPI running, stop PostgreSQL:
  - `GET /robots/amr001/state` → **503** `Database unavailable: ...`.
  - `GET /system/status` `database` reports `unavailable` (no crash).
  - `POST /robots/amr001/order` → still **200** (publishes to MQTT; doesn't need DB).
- `[chaos]` Restart PostgreSQL → reads return **200** again on next call (pool rebuilds).
- `[ops]` FastAPI **will not start** with PostgreSQL down — confirm the boot order Postgres → FastAPI.
- `[ops]` `SELECT count(*) FROM pg_stat_activity WHERE datname='amr_integration';` stays at/below `DB_POOL_MAX` under load (G16 manual variant; the automated 30-request burst is already covered).

---

## 3. FastAPI gateway

The whole REST surface is automated by `docs/postman/` (Newman), the Pydantic
schemas + middleware (auth, CORS, rate-limit, retention lifecycle) are covered
by `fastapi-service/tests/`, and ingest + chaos misc by `scripts\test\`.
What's left:

- `[ops]` Phase 1 boot: `Uvicorn running on http://...:8000` printed; no traceback in the FastAPI window.
- `[ops]` Swagger UI at <http://localhost:8000/docs> renders the full route set (robots / fleet / maps / locations / oee / system / ingest / orders).
- `[ops]` G21 restart: insert a legacy `amr001-order-goal` row, **stop FastAPI**, restart it → starts without `psycopg2.errors.InvalidTextRepresentation`, log line `telemetry retention enabled days=30` visible. (SQL safety is auto-covered; only the restart proves the registry seed path works end-to-end.)
- `[ops]` G19 restart with `TELEMETRY_RETENTION_DAYS=0` → startup log does **not** print `telemetry retention enabled`.
- `[ops]` Confirm `CORS_ORIGINS=http://localhost:9999` (in `fastapi-service/.env`) restricts allowed origins; restoring it restores Vite-dev access.
- `[ops]` ROS Bridge auth handshake: with `API_KEY=test-key` on both `.env`s, ROS Bridge logs `Fleet loaded:` rather than `401` at boot.

---

## 4. Node-RED

The MQTT-routed paths (state ingest, malformed drops, connection log) are
automated by `scripts\test\test-ingest.ps1`. The remaining items are all
UI / inspection of the runtime workspace:

- `[UI]` Workspace at <http://localhost:1880> shows the five tabs: **Command Routing**, **Telemetry Ingestion**, **Test Harness**, **Command Audit**, **DB Admin**. Every MQTT node shows "connected".
- `[UI]` **Test Harness** → click "order: single goal" → "Command Audit" debug pane prints `order logged`.
- `[UI]` **Telemetry Ingestion** → the `validateState` node shows a green status after a real `state` publish; the `state persisted` debug pane prints `{"status":"ok"}`.
- `[UI]` **DB Admin** tab (Phase 9):
  - Stop FastAPI + ROS Bridge first (per the tab's docstring).
  - `npm install` has been run in `node-red/` (workspace shows no red "missing type").
  - Click **Reset DB** inject → debug pane shows a result; no error fill.
  - After reset: `SELECT count(*) FROM state_snapshots` = 0; `SELECT * FROM robots` still lists `amr001` (re-seeded).
  - **Run custom SQL** inject (edited to `INSERT INTO maps (...) VALUES ('map-009','Test') ON CONFLICT DO NOTHING;`) → after FastAPI restart, `GET /maps` lists `map-009`.

---

## 5. ROS Bridge Service

Almost entirely robot-gated. Unit tests in `ros-bridge-service/test/` cover the
state builder, order state machine, and VDA5050 schema; everything else needs
a real robot or sim:

- `[robot]` ROS Bridge log shows one rosbridge connection per robot on startup.
- `[robot]` `POST /robots/amr001/order` → log line `Order accepted` → `Node goal sent`; robot moves.
- `[robot]` Two-node order auto-advances on `SUCCEEDED` (second node sent without manual prompt).
- `[robot]` Force a nav failure (unreachable goal or e-stop mid-order) → `GET /robots/amr001/state` `errors` contains `error_type: navigationFailed`, `error_level: WARNING`.
- `[robot]` Send a reachable goal that succeeds → the `navigationFailed` error clears (may need a second successful nav before clearance).
- `[robot]` Submit a new order while one is mid-execution → new order replaces the current one cleanly.
- `[chaos]` Mid-execution, stop Mosquitto → ROS Bridge logs reconnection; once broker is back, no runaway commands.

---

## 6. Frontend — React console

Almost every non-robot screen is automated by Playwright in
`frontend/tests/e2e/`. The leftovers are:

### Pills under live transitions
- `[chaos]` All four pills green within 5 s of full-stack boot.
- `[chaos]` Stop FastAPI → API / DB / ROS go red within 5 s; MQTT stays green.
- `[chaos]` Restart FastAPI → all three flip back to green; no page reload.
- `[chaos]` Stop Mosquitto → MQTT pill goes yellow ("reconnecting") then red ("offline").
- `[chaos]` Restart Mosquitto → MQTT goes yellow → green; browser auto-reconnects.

### Dashboard
- `[robot]` Each tile fills fields: connection pill, mode, battery, orderId, "last seen", map, rosbridge.
- `[robot]` After a `state` message arrives, "last seen" resets to "0s ago" and ticks upward. (G26 fixed 2026-05-25 — pending re-test.)
- `[UI]` No robots in fleet → "No robots in the fleet" hint with pointer to Admin → Robots. (Hard to engineer without deleting amr001 first.)

### Robot Detail — Map
- `[robot]` Without `/reference/map` publishing: canvas shows "Waiting for /reference/map…"; no crash.
- `[robot]` Once map is publishing: occupancy grid renders (free white, occupied dark, unknown grey).
- `[UI]` Resize the window → canvas resizes with it (no stretching).
- `[robot]` Robot arrow appears at the AMCL pose; rotates with yaw.
- `[robot]` Top-right overlay reads `pose: AMCL`.
- `[robot]` Stop AMCL publisher for >2 s → overlay flips to `pose: EKF (fallback)`; arrow turns amber.
- `[robot]` Resume AMCL → overlay returns to AMCL on next message; arrow back to blue.
- `[robot]` `/move_base_node/DWAPlannerROS/global_plan` → sky-blue polyline on map.
- `[robot]` `/move_base_node/DWAPlannerROS/local_plan` → red polyline.
- `[robot]` Named locations on the robot's map appear as violet pins with labels. (G27 fixed 2026-05-25 — labels render in a slate-900 pill so they read on white free-space cells.)

### Robot Detail — Side panel
- `[robot]` **State** tab updates in real time.
- `[robot]` **Errors** tab: no errors → "No errors reported."; with errors → level (colour-coded), errorType, description.
- `[robot]` **Actions** tab lists every `actionStates[]` entry with status.
- `[robot]` Connection pill reflects the retained `connection` topic (`ONLINE` / `OFFLINE` / `CONNECTIONBROKEN`).

### Dispatch
- `[UI]` Dropdown lists only locations whose `map_id` matches the robot's `mapId` (filter behaviour).
- `[UI]` Add a second location → list grows; "remove" button works; remove disabled at one row.
- `[UI]` 4xx response from named POST → inline error text under the builder; no toast loop.
- `[robot]` Active order panel: nodes shrink as robot completes them; panel collapses to "No active order" when empty.
- `[robot]` Cancel / Retry / Skip from the active-order panel — backend logs the instant action, panel reacts.
- `[UI]` Cancel/Retry/Skip while no order is active — buttons disabled (or panel hidden — confirm there's no way to send a stray instant action).

### Teleop  (all `[robot]`)
- `[robot]` Robot picker; ENGAGED switch disabled until rosbridge `connected`.
- `[robot]` Camera stream appears in the left pane; topic name shown in corner overlay.
- `[robot]` `W` moves forward; `S` stops; `D` rotates. 3×3 grid maps to QWE / ASD / ZXC.
- `[robot]` Release key → zero Twist published (robot stops within 100 ms).
- `[robot]` Click-and-hold a button works for mouse + touch.
- `[robot]` Disengage → keys are inert; buttons show disabled-grey style; no Twist published.
- `[robot]` Mid-teleop kill rosbridge → ENGAGED auto-disengages within reconnect window; no runaway after reconnect.
- `[UI]` Deep-link `/teleop/amr001` directly → loads with `amr001` pre-selected.

### Order History
- `[UI]` Change page size → list refetches.
- `[UI]` Scroll to bottom, click **Load older** → older rows appended; cursor advances; "End of history" eventually disables the button.
- `[UI]` Each row format: time (localised), robot, order_id (mono font), update, node count, header id.

### OEE — populated (`[robot]`)
- `[robot]` Run a couple of successful orders end-to-end; cards show totals + avg duration.
- `[robot]` Success-rate hint under "Succeeded" reads `XX.X% success`.
- `[robot]` Availability bar fills proportionally; raw count text on the right.
- `[robot]` BarChart renders bars one per cycle; oldest on the left.
- `[robot]` Cycles log: `SUCCEEDED` green, otherwise red; duration formatted to one decimal.

### Snackbar / toast
- `[UI]` Trigger any 4xx (e.g. delete `map-001`) → red toast with API error message.
- `[UI]` Two saves in quick succession → toasts queue (one shows after the previous closes), no overlap.

### Admin
- `[UI]` Edit any existing map / location / robot → drawer; ID field disabled; other fields editable; Save → toast.
- `[UI]` Admin → Locations: click on embedded MapCanvas → x and y fields snap to clicked world coords; pin appears at click position.
- `[UI]` Admin → Locations: switch the form's map dropdown → embedded canvas re-subscribes to that map's rosbridge.
- `[UI]` Admin → Robots: after adding a robot, new tile appears on Dashboard; MQTT topics for that serial start being subscribed to.
- `[UI]` Admin → Fleet Config: change `version` to `2.0.1` → save → refresh page → new value sticks.

---

## 7. Integration / cross-service smoke (Phase 13)

These touch ≥3 services so live by themselves:

- `[ops]` `docker compose up --build` or `start-all.ps1` brings the whole stack up cleanly. React app loads at `http://localhost:5173/`; all four pills green within 10 s.
- `[robot]` Robot is publishing; Dashboard tile shows ONLINE + battery.
- `[robot]` Robot Detail: map + arrow + pins render.
- `[robot]` Dispatch → send a named-location order → ActiveOrderPanel shows orderId; robot moves; no errors during clean run.
- `[robot]` After order completes: OEE cycle appears at `/oee`; order shows up at `/orders` (refresh).
- `[robot]` Teleop in another tab → ENGAGED → drive briefly → release → robot stops.
- `[UI]` Add a map + location in Admin → appears in Dispatch's named-location list within React Query's staleTime (≤30 s) or after a refresh.
- `[chaos]` Stop FastAPI → pills flag the outage; existing MQTT live data (Dashboard tiles) keeps updating (independent channel). Restart FastAPI → pills go green, no manual refresh.

---

## How to pick

If you have **15 minutes**: run `.\scripts\test\run-all.ps1` + `npm run e2e`,
then pick **one service section** above and walk it end-to-end. Rotate which
service you pick each session.

If you have **an hour**: do the automated pass, then sections **1 (Mosquitto)**,
**2 (PostgreSQL)**, and **6 (Frontend chaos pills)** — they're the highest-
leverage non-robot manual checks because they prove the live-state wiring
that automation can't easily reach.

If a **robot/sim is connected**: prioritise sections **5 (ROS Bridge)** and
**6 → Robot Detail / Teleop / OEE populated** — none of those have any
automation surrogate.

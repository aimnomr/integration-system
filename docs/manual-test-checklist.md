# Manual Test Checklist

A step-by-step manual verification of the AMR Integration System — happy paths,
the G15–G21 gap fixes, and extreme / failure cases.

> Conventions
> - **For backend HTTP smoke-testing, prefer `.\docs\postman\run-newman.ps1`** —
>   it replays the Postman collection (`docs/postman/`) and writes a
>   pass/fail HTML report. The checklist below stays useful for behavioural
>   scenarios Newman can't easily express (multi-step flows, robot interactions,
>   restart-survives, etc.).
> - HTTP examples use `curl.exe` (PowerShell aliases bare `curl` to a different
>   command — always type `curl.exe`). The Swagger UI at
>   <http://localhost:8000/docs> is an easier alternative for every FastAPI call.
> - If `API_KEY` is set in `fastapi-service/.env`, add `-H "X-API-Key: <key>"` to
>   every `/robots/*`, `/fleet`, `/system/*`, `/maps/*`, `/locations/*` call.
> - DB inspection: `psql -U postgres -d amr_integration -c "<SQL>"`.
> - MQTT publishing: `mosquitto_pub` (ships with Mosquitto).
> - Tests marked **[robot]** need a live `rosbridge_server` + robot (or sim).
>   Everything else runs without one.

---

## Phase 0 — Prerequisites

- [x] PostgreSQL running; `amr_integration` DB created and `schema.sql` applied.
- [x] `fastapi-service/.env` and `ros-bridge-service/.env` exist.
- [x] `fastapi-service/venv` has `requirements.txt` installed.
- [x] `ros-bridge-service` has `npm install` done.
- [x] Mosquitto and Node-RED are on `PATH`.

---

## Phase 1 — Startup & health

- [x] Run `.\start-all.ps1` — four windows open (Mosquitto, FastAPI, ROS Bridge, Node-RED).
- [x] FastAPI window: no traceback; `Uvicorn running on http://...:8000`.
- [x] Open <http://localhost:8000/docs> — Swagger lists robots / fleet / maps /
      locations / oee / system / ingest routes.
- [x] `curl.exe -s http://localhost:8000/system/status` → `mosquitto` and
      `database` both report `connected`.
- [x] Node-RED window: `Connected to broker`, `Started flows`, **no `ENOTFOUND`**.
- [x] Open <http://localhost:1880> — MQTT nodes show "connected".
- [x] **[robot]** ROS Bridge window logs a rosbridge connection per robot.

---

## Phase 2 — Reference-data CRUD (G15)

### Maps
- [x] `GET /maps` → lists `map-001`, `map-002`.
- [x] `POST /maps` body `{"map_id":"map-003","label":"Test Map"}` → **201**.
- [x] `GET /maps/map-003` → returns the new map.
- [x] `PUT /maps/map-003` body `{"label":"Renamed"}` → 200, label updated.
- [x] `DELETE /maps/map-003` → 200 `{"status":"ok","deleted":"map-003"}`.

### Named locations
- [x] `GET /locations` → lists the 4 seeded locations.
- [x] `POST /locations` body `{"id":99,"map_id":"map-001","label":"Dock","x":1,"y":2}`
      → **201**, `theta` defaults to `0.0`.
- [x] `PUT /locations/99` → 200, fields updated.
- [x] `DELETE /locations/99` → 200.

### Robots
- [x] `GET /robots/amr001` → returns the robot row.
  > **REMARK (Newman run 2026-05-21):** endpoint returns HTTP 200 but the
  > response body does **not** include a top-level `serialNumber` field — the
  > Newman assertion `expected ... to deeply equal 'amr001'` failed against
  > `undefined`. Likely the route returns the snake_case row (`serial_number`)
  > or wraps it under another key. Worth eyeballing the actual response shape
  > in Swagger / a Postman run before declaring this fully green.
- [x] `POST /robots` body `{"serial_number":"amr002","rosbridge_url":"ws://localhost:9091","map_id":"map-001"}`
      → **201**.
- [x] `GET /robots` → now lists `amr002` too (registry reloaded — **no restart needed**).
- [x] `PUT /robots/amr002` → 200.
- [x] `DELETE /robots/amr002` → 200; `GET /robots` no longer lists it.

### Fleet config
- [x] `GET /fleet` → current identity.
- [x] `PUT /fleet` body `{"interface_name":"amr","major_version":"v2","version":"2.0.0","manufacturer":"moverobotic"}`
      → 200.

---

## Phase 3 — Orders & instant actions

- [x] `POST /robots/amr001/order` body `{"nodes":[{"x":1.0,"y":0.5,"theta":0.0}]}`
      → 200 `{"status":"ok","orderId":"amr001-order-N","nodeCount":1}`.
- [x] `POST /robots/amr001/order/named` body `{"location_ids":[1,2]}` → 200, nodeCount 2.
- [x] `POST /robots/amr001/instant-actions` body `{"action_type":"cancelOrder"}`
      → 200 with an `actionId`.
- [x] In Node-RED **Test Harness** tab, click "order: single goal" — the order is
      published; the "Command Audit" tab debug shows `order logged`. {It shows status ok for order logged}
- [x] **[robot]** ROS Bridge logs `Order accepted` → `Node goal sent`; the robot moves.
- [x] **[robot]** A 2-node order auto-advances to the second node on `SUCCEEDED`.

---

## Phase 4 — Telemetry ingestion pipeline

Without a robot, fake a `state` message. Escaping JSON inline in PowerShell is
fragile — put the payload in a file and publish with `-f`:

**What this phase does:** fakes the telemetry a robot would normally publish, so
you can confirm the ingestion pipeline (Mosquitto → Node-RED → FastAPI →
PostgreSQL) works end-to-end without needing a robot.

**Step-by-step (no robot):**

1. Open a PowerShell terminal in any folder (e.g. `D:\FYP\integration-system\`).
2. Save a state message to disk — copy/paste this exact block:

   ```powershell
   '{"headerId":1,"timestamp":"2026-05-18T12:00:00Z","serialNumber":"amr001","orderId":"","orderUpdateId":0,"lastNodeId":"","lastNodeSequenceId":0,"nodeStates":[],"edgeStates":[],"actionStates":[],"agvPosition":{"x":1.0,"y":2.0,"theta":0,"mapId":"map-001","positionInitialized":true},"velocity":{"vx":0,"vy":0,"omega":0},"driving":false,"operatingMode":"AUTOMATIC","errors":[],"safetyState":{"eStop":"NONE","fieldViolation":false}}' | Out-File -Encoding ascii state.json
   ```
3. Publish it:
   ```powershell
   mosquitto_pub -h localhost -t "amr/v2/moverobotic/amr001/state" -f state.json
   ```
4. Now run the four assertions below.

- [ ] **In Node-RED** (<http://localhost:1880>) → **Telemetry Ingestion** tab:
      the `validateState` node briefly shows a green status; the
      `state persisted` debug pane prints `{"status":"ok"}`.
- [ ] Open another terminal: `psql -U postgres -d amr_integration -c "SELECT count(*) FROM state_snapshots;"`
      → count is **higher** than before the publish.
- [ ] Repeat with a connection message:
      ```powershell
      '{"headerId":1,"timestamp":"2026-05-18T12:00:00Z","serialNumber":"amr001","connectionState":"ONLINE"}' | Out-File -Encoding ascii conn.json
      mosquitto_pub -h localhost -t "amr/v2/moverobotic/amr001/connection" -f conn.json
      ```
      Then `psql ... -c "SELECT count(*) FROM connection_log;"` increased.
- [ ] **[robot]** With a real robot publishing, the same rows appear
      automatically — no need to run `mosquitto_pub` manually.

---

## Phase 5 — State & OEE reads

- [x] `GET /robots/amr001/state` → latest snapshot with `node_states`,
      `action_states`, `errors` arrays.
- [x] `GET /robots/amr001/oee/summary` → totals (0 cycles until an order completes).
- [X] `GET /robots/amr001/oee/cycles` → `{"cycles":[...]}`.
- [x] `GET /robots/amr001/oee/availability` → `driving_samples` / `total_samples`.

---

## Phase 6 — Gap fixes G16–G21

### G20 — ingest validation (422, not 500)
- [x] `POST /ingest/state` body `{"timestamp":"t"}` (no `serialNumber`)
      → **422**, response names `serialNumber`. (Was a 500 before.)
- [x] `POST /ingest/connection` body with `connectionState":"BOGUS"` → **422**.
- [ ] `POST /ingest/state` with a full valid body → **200**.
      **Use exactly the body from Phase 4 step 2** (save it to `state.json`),
      then:
      ```powershell
      curl.exe -X POST -H "Content-Type: application/json" -d "@state.json" http://localhost:8000/ingest/state
      ```
      Expected: `{"status":"ok"}`. If you got a 500, it usually means the JSON
      was malformed (PowerShell sometimes adds a UTF-8 BOM — that's why the
      Phase 4 example uses `-Encoding ascii`). Alternative without a file:
      ```powershell
      curl.exe -X POST -H "Content-Type: application/json" `
        -d "{\"headerId\":1,\"timestamp\":\"2026-05-18T12:00:00Z\",\"serialNumber\":\"amr001\",\"orderId\":\"\",\"orderUpdateId\":0,\"lastNodeId\":\"\",\"lastNodeSequenceId\":0,\"nodeStates\":[],\"edgeStates\":[],\"actionStates\":[],\"agvPosition\":{\"x\":1.0,\"y\":2.0,\"theta\":0,\"mapId\":\"map-001\",\"positionInitialized\":true},\"velocity\":{\"vx\":0,\"vy\":0,\"omega\":0},\"driving\":false,\"operatingMode\":\"AUTOMATIC\",\"errors\":[],\"safetyState\":{\"eStop\":\"NONE\",\"fieldViolation\":false}}" `
        http://localhost:8000/ingest/state
      ```
      The Swagger UI at <http://localhost:8000/docs> → `POST /ingest/state` →
      *Try it out* is the easiest version — it pre-fills a valid body.

### G17 — navigation failure visible **[robot]**
- [x] Force a nav failure (send the robot an unreachable goal, or e-stop mid-order).
- [x] `GET /robots/amr001/state` → `errors` contains an entry with
      `error_type: "navigationFailed"`, `error_level: "WARNING"`.
- [x] Send a reachable goal that succeeds → the `navigationFailed` error clears. {Second time send nav then only its cleared}

### G21 — counters survive a restart
- [x] `POST /robots/amr001/order` twice — note the suffixes (`-order-0`, `-order-1`).
- [x] Confirm both orders reached the `orders` table (Command Audit tab / `psql`).
- [x] Stop and restart **only** FastAPI.
- [x] `POST /robots/amr001/order` again → orderId is `-order-2` (**not** `-order-0`).
- [x] `psql ... -c "SELECT order_id, header_id FROM orders ORDER BY id;"` →
      `header_id` is non-decreasing across the restart.

### G16 — connection pooling
- [x] Fire ~30 quick reads: `for ($i=0;$i -lt 30;$i++){ curl.exe -s http://localhost:8000/robots/amr001/state > $null }` — all succeed, no slowdown.
- [x] `psql ... -c "SELECT count(*) FROM pg_stat_activity WHERE datname='amr_integration';"`
      → connection count stays at/below `DB_POOL_MAX` (default 10), not one-per-request. {It stays at 2 before, during and after the command runs}

### G19 — telemetry retention

**What this phase does:** verifies the background task that prunes telemetry
rows older than `TELEMETRY_RETENTION_DAYS` actually works. The trick is to
plant a deliberately-old row, then restart FastAPI and check it's gone.

**Step-by-step:**

1. With FastAPI running, open a PowerShell terminal and **plant a 90-day-old row**:
   ```powershell
   psql -U postgres -d amr_integration -c "INSERT INTO state_snapshots (serial_number,ts,header_id) VALUES ('amr001', now() - interval '90 days', 999);"
   ```
2. **Stop FastAPI** (Ctrl+C in its window).
3. **Set the retention window** to 30 days for this restart:
   ```powershell
   $env:TELEMETRY_RETENTION_DAYS = "30"
   uvicorn main:app --reload --port 8000      # from fastapi-service/, venv activated
   ```
   (Or just edit `fastapi-service/.env` to add `TELEMETRY_RETENTION_DAYS=30`
   and restart normally — same effect.)
4. Watch the FastAPI startup log — within a few seconds you should see a line
   like `telemetry pruned {"deleted":{...}}`.
5. Now run the assertions:

- [ ] FastAPI log printed a `telemetry pruned` line within ~6 hours of startup.
      (The background task fires at boot + every 6 h after; the boot one is
      the one you see now.)
- [ ] `psql ... -c "SELECT count(*) FROM state_snapshots WHERE header_id=999;"`
      → `0`. The 90-day-old row is gone.
- [ ] `psql ... -c "SELECT count(*) FROM state_snapshots WHERE ts > now() - interval '1 day';"`
      → unchanged from before the restart. Recent rows untouched.
- [ ] Restart FastAPI again with `TELEMETRY_RETENTION_DAYS=0` — the startup
      log does **not** print `telemetry retention enabled`; the prune task
      doesn't start.
- [ ] Reset `TELEMETRY_RETENTION_DAYS` back to `30` (or remove it) after testing.

---

## Phase 7 — Auth & rate limiting (G10 / G11)

**Setup:** add these two lines to `fastapi-service/.env`, then restart FastAPI:
```
API_KEY=test-key
RATE_LIMIT_PER_MINUTE=5
```

- [x] `GET /robots` with no header → **401**.
- [x] `GET /robots` with `-H "X-API-Key: wrong"` → **401**.
- [x] `GET /robots` with `-H "X-API-Key: test-key"` → 200.
- [ ] `POST /ingest/state` with **no `X-API-Key` header** (but a full valid
      body — same body the Phase 4 example uses) → **200** with
      `{"status":"ok"}`. The point of this test is that `/ingest/*` is
      deliberately **exempt** from the auth check (it's the internal
      Node-RED → DB boundary). Example:
      ```powershell
      curl.exe -X POST -H "Content-Type: application/json" -d "@state.json" http://localhost:8000/ingest/state
      ```
      (Reuse `state.json` from Phase 4 step 2 — that's the "full valid body".)
- [x] Fire 7 requests quickly → the 6th/7th return **429** with a `Retry-After` header.
- [ ] **[robot] How to test:** you don't make this call yourself — the **ROS
      Bridge Service** does it automatically at startup. With `API_KEY=test-key`
      set on FastAPI:
        1. Edit `ros-bridge-service/.env`, add `API_KEY=test-key`.
        2. Restart the ROS Bridge.
        3. Look at its startup log — you should see `Fleet loaded:` (success)
           rather than `401`. If the keys mismatch the bridge logs the 401 and
           exits.
- [ ] **Cleanup:** remove `API_KEY` and reset `RATE_LIMIT_PER_MINUTE=120` (or
      delete the lines) in both `.env` files; restart both services. Otherwise
      every subsequent test that doesn't send the key will fail with 401.

---

## Phase 8 — Extreme / failure cases

### Bad input
- [x] `POST /robots/amr001/order` body `{"nodes":[]}` → **422** (empty order).
- [x] `POST /robots/amr001/order` body `{"nodes":[{"x":1}]}` → **422** (`y` missing).
- [x] `POST /robots/UNKNOWN/order` → **404** (robot not registered).
- [x] `POST /robots/amr001/order/named` body `{"location_ids":[9999]}` → **404**.
- [x] `POST /robots/amr001/instant-actions` body `{"action_type":"fly"}` → **422**.

### CRUD conflicts (G15 — no cascade)
> ✅ `DELETE /maps/map-001` 409 verified by Newman run 2026-05-21 02:37.
- [ ] `POST /maps` with an existing `map_id` → **409** (duplicate).
- [x] `DELETE /maps/map-001` while a robot/location references it → **409**;
      `map-001` is **not** deleted, telemetry untouched.
- [ ] `POST /robots` with `map_id":"map-404"` (nonexistent) → **422**.
- [ ] `DELETE /robots/amr001` after it has telemetry/orders → **409**.
- [ ] `GET /maps/nope`, `PUT /maps/nope`, `DELETE /maps/nope` → **404** each.

### Database loss (runtime)
- [ ] With FastAPI running, **stop PostgreSQL**.
- [ ] `GET /robots/amr001/state` → **503** `Database unavailable: ...`.
- [ ] `GET /system/status` → `database` reports `unavailable` (no crash).
- [ ] `POST /robots/amr001/order` → still **200** (publishes to MQTT; doesn't need DB).
- [ ] Restart PostgreSQL → reads return **200** again (pool rebuilds on next call).
- [ ] Note: FastAPI will **not start** with PostgreSQL down — the fleet is loaded
      from the DB at boot. Start order stays Postgres → FastAPI.

### Broker / connectivity loss
- [ ] Stop Mosquitto → `GET /system/status` `mosquitto` reports `disconnected`.
- [ ] Restart Mosquitto → FastAPI, Node-RED, ROS Bridge reconnect automatically.
- [ ] **[robot]** Kill the ROS Bridge process → its retained `connection` topic
      flips to `CONNECTIONBROKEN` (Last-Will); `/system/status` `roslib` reflects it.

### Malformed MQTT / Node-RED
- [ ] `mosquitto_pub` a non-JSON payload to `amr/v2/moverobotic/amr001/state`
      → Node-RED `validateState` errors, drops it; no DB row, no crash.
- [ ] `mosquitto_pub` a state message missing `serialNumber` → validator rejects it.

### Ordering / concurrency
- [ ] Submit 5 orders rapidly → 5 distinct `orderId` suffixes, no duplicates.
- [ ] **[robot]** Submit a new order while one is mid-execution → behaviour is
      defined (new order replaces current); confirm it matches expectation.

---

## Phase 9 — Recent backend additions

### G21 startup-crash fix — non-numeric order suffix
- [ ] Insert a legacy-style order row whose suffix isn't numeric:
      `psql ... -c "INSERT INTO orders (serial_number, ts, header_id, order_id, order_update_id) VALUES ('amr001', now(), 1, 'amr001-order-goal', 0);"`
- [ ] Stop FastAPI; restart it.
- [ ] FastAPI **starts without traceback** (was `psycopg2.errors.InvalidTextRepresentation` before).
- [ ] `GET /robots/amr001/state` works; counters keep ticking.
- [ ] Clean up the row: `psql ... -c "DELETE FROM orders WHERE order_id='amr001-order-goal';"`

### Node-RED DB Admin tab
- [ ] Open `http://localhost:1880` → **DB Admin** tab is visible (5th tab).
- [ ] `npm install` has been run in `node-red/` (pulls `node-red-contrib-postgresql`).
- [ ] Stop FastAPI + ROS Bridge first (per the tab's docstring).
- [ ] Click **Reset DB** inject → the postgresql node debug shows a result; no error fill.
- [ ] `psql ... -c "SELECT count(*) FROM state_snapshots;"` → `0` (reset wiped telemetry).
- [ ] Reseeded tables are back: `psql ... -c "SELECT * FROM robots;"` → `amr001`.
- [ ] Edit the **Run custom SQL** inject payload to:
      `INSERT INTO maps (map_id, label) VALUES ('map-009','Test') ON CONFLICT DO NOTHING;`
- [ ] Press inject → `GET /maps` (after FastAPI restart) lists `map-009`.
- [ ] If npm dep is missing, the workspace shows red "missing type" — that's the
      tell that `npm install` wasn't run.

### Phase 0 backend prep — CORS (G18)
- [ ] FastAPI started with default env → `curl.exe -H "Origin: http://localhost:5173" -I http://localhost:8000/system/status`
      returns `access-control-allow-origin: http://localhost:5173`.
- [ ] Same request with `Origin: http://evil.example` → **no** `access-control-allow-origin` header.
- [ ] Restart FastAPI with `CORS_ORIGINS=http://localhost:9999` → only that origin
      is now allowed; the Vite dev server (`5173`) is blocked. Reset afterwards.

### Phase 0 — GET /orders endpoint
> ✅ First four items verified by Newman run 2026-05-21 02:37.
- [x] `curl.exe http://localhost:8000/orders` → `{"orders":[...], "count":N}`.
- [x] `curl.exe "http://localhost:8000/orders?serial=amr001&limit=2"` → at most 2 rows, all for amr001.
- [x] `curl.exe "http://localhost:8000/orders?serial=ghost"` → **404**.
- [x] `curl.exe "http://localhost:8000/orders?limit=0"` → **422** (limit must be ≥ 1).
- [ ] `curl.exe "http://localhost:8000/orders?limit=501"` → **422** (limit clamped to 500).
- [ ] With `serial=amr001`, page through using `before=<ts>` — second call returns
      strictly older rows; reaches an empty list once exhausted.
- [ ] `node_count` matches `psql ... -c "SELECT count(*) FROM order_nodes WHERE order_pk=<id>;"`.

### Phase 0 — Mosquitto WebSocket listener on :9001
- [ ] `mosquitto.conf` has the `listener 9001` + `protocol websockets` block.
- [ ] Mosquitto logs (or `docker compose logs mosquitto`) show two listeners.
- [ ] `netstat -an | findstr ":9001"` (or `ss -lnt | grep 9001` in WSL) shows
      mosquitto listening.
- [ ] Browser → DevTools → Network → WS tab: with the React app open, you see
      one WebSocket to `ws://localhost:9001/mqtt` in connected state. (`Frames`
      tab shows the heartbeat / messages.)

---

## Phase 10 — Frontend smoke (scaffold + connectivity)

### Build & dev server
- [ ] `cd frontend && npm install` completes without errors.
      (If MUI / TS peer-dep warnings: `npm install --legacy-peer-deps`.)
- [ ] `npm run dev` prints `Local: http://localhost:5173/`; no compile errors.
- [ ] If `optimizeDeps` complaint on first run: delete `node_modules/.vite/`,
      re-run `npm run dev`.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run build` produces `dist/` without errors.

### AppShell + routing
- [ ] Open `http://localhost:5173/` → AppBar with logo + "AMR Console", four
      pills (API / MQTT / DB / ROS), LeftNav with Operate + Admin sections.
- [ ] Click each LeftNav entry — URL updates; main pane swaps. The currently
      selected item is highlighted indigo.
- [ ] Manually visit `/this-is-not-a-route` → "404 — Not found" page with a
      back-to-dashboard link.
- [ ] Hovering each pill shows a descriptive tooltip (e.g. "Mosquitto WebSocket: connected").

### Health pills — live state transitions
- [ ] All services running → API + MQTT + DB + ROS all green within 5 s.
- [ ] Stop FastAPI → within 5 s: API red, DB red, ROS red. MQTT stays green
      (different connection).
- [ ] Restart FastAPI → all three flip back to green.
- [ ] Stop Mosquitto → MQTT pill cycles yellow ("reconnecting") then red ("offline").
- [ ] Restart Mosquitto → MQTT goes yellow then green; browser auto-reconnects.
- [ ] **[robot]** Stop ROS Bridge while a robot was online → after the broker's
      retention window, ROS pill flips red.

### Health page
- [ ] Navigate to **Health** in LeftNav → six rows (FastAPI, MQTT browser, MQTT
      backend, PostgreSQL, rosbridge fleet, Node-RED), each with the right pill
      and a descriptive subtitle.
- [ ] The FastAPI row shows "Last response at HH:MM:SS"; refreshes every 5 s.

### CORS (browser side)
- [ ] DevTools → Console: no `blocked by CORS policy` errors after page loads.
- [ ] Network tab: requests to `localhost:8000/*` carry `Origin:
      http://localhost:5173` and get back `access-control-allow-origin` matching.

---

## Phase 11 — Frontend v1 screens

### Dashboard
- [ ] `/` shows one tile per robot from `GET /fleet` (just `amr001` if you haven't
      added more).
- [ ] Each tile fields populate: connection pill, mode, battery, orderId,
      "last seen", map, rosbridge status. Empty fields show `—` (no `undefined`).
- [ ] After a `state` MQTT message arrives, "last seen" resets to "0s ago" and
      ticks upward.
- [ ] Click a tile → navigates to `/robots/<serial>`.
- [ ] No robots in fleet → "No robots in the fleet" hint with a pointer to
      Admin → Robots.

### Robot Detail — Map
- [ ] `/robots/amr001` shows the MapCanvas on the left.
- [ ] **[robot]** Without anyone publishing `/reference/map`: canvas shows
      "Waiting for /reference/map…"; no crash.
- [ ] **[robot]** Once map is publishing: occupancy grid renders (free white,
      occupied dark, unknown grey). Aspect ratio preserved.
- [ ] **[robot]** Resize the window — the canvas resizes with it (no stretching).
- [ ] **[robot]** Robot arrow appears at the AMCL pose; rotates with yaw.
- [ ] **[robot]** Top-right overlay reads `pose: AMCL`.
- [ ] **[robot]** Stop the AMCL publisher (e.g. `rosnode kill /amcl`) for >2 s →
      overlay flips to `pose: EKF (fallback)`; arrow turns amber.
- [ ] **[robot]** Resume AMCL → overlay returns to AMCL after the next message;
      arrow back to blue.
- [ ] **[robot]** `/move_base_node/DWAPlannerROS/global_plan` published → sky-blue
      polyline appears on the map.
- [ ] **[robot]** `/move_base_node/DWAPlannerROS/local_plan` → red polyline.
- [ ] Named locations on the robot's map appear as violet pins with labels.

### Robot Detail — Side panel
- [ ] **State** tab shows the VDA5050 field readout updating in real time.
- [ ] **Errors** tab: with no errors, "No errors reported."; with errors, each
      one shows level (colour-coded), errorType, and description.
- [ ] **Actions** tab lists every `actionStates[]` entry with its status.
- [ ] Connection pill (top-right) reflects the retained `connection` topic
      (`ONLINE` / `OFFLINE` / `CONNECTIONBROKEN`).

### Dispatch — Named mode
- [ ] `/dispatch` → robot picker; pick `amr001`.
- [ ] **Named** toggle selected by default.
- [ ] Dropdown lists locations whose `map_id` matches the robot's `mapId`. Empty
      if no locations match.
- [ ] Pick a location → it appears in the ordered list below the dropdown.
- [ ] Add a second location → list grows; "remove" button works.
- [ ] **Send order** → toast "Order created" (or similar); the ActiveOrderPanel
      below updates to show the new orderId and pending nodes.
- [ ] If named POST returns 4xx (e.g. wrong location id) → error text under the
      builder; no toast loop.

### Dispatch — Manual mode
- [ ] Toggle to **Manual** → empty row at x=0, y=0, θ=0.
- [ ] Edit numeric values; add a second node; remove returns to one row;
      remove button disabled at one row.
- [ ] **Send order** → new orderId in the panel.

### Active order panel
- [ ] orderId shown in monospace; "N nodes remaining" reflects `state.nodeStates`.
- [ ] **[robot]** As the robot completes nodes, `nodeStates` shrinks; once empty,
      the panel collapses to "No active order".
- [ ] **Cancel** → toast; the panel clears once the robot returns to no-orderId.
- [ ] **Retry** sends a retryNode instant action; backend logs the call.
- [ ] **Skip** sends a skipNode; backend logs the call.
- [ ] Cancel/Retry/Skip while no order is active → button disabled? (currently
      the panel is hidden — confirm there's no way to send a stray instant
      action.)

### Teleop
- [ ] `/teleop` → robot picker; ENGAGED switch is disabled until rosbridge is
      `connected` for the picked robot.
- [ ] **[robot]** Connect → switch enabled; flip ENGAGED → switch label flips to
      "ENGAGED — robot will move".
- [ ] **[robot]** Camera stream appears in the left pane; topic name shown in
      the corner overlay.
- [ ] **[robot]** Press `W` → robot moves forward; `S` stops; `D` rotates; etc.
      The 3×3 grid maps to QWE / ASD / ZXC.
- [ ] **[robot]** Release key → zero Twist published (robot stops within 100 ms).
- [ ] **[robot]** Click-and-hold a button works for mouse + touch.
- [ ] **[robot]** Disengage → keys are inert; clicking a button shows the
      disabled-grey style; no Twist published.
- [ ] **[robot]** Mid-teleop, kill rosbridge → ENGAGED auto-disengages within
      the reconnect window; no runaway after reconnect.
- [ ] Deep-link `/teleop/amr001` directly → loads with `amr001` pre-selected.

---

## Phase 12 — Frontend analytics + admin

### Order History
- [ ] `/orders` shows the most recent N orders, newest first.
- [ ] Filter by robot → list narrows to that robot only.
- [ ] Change page size — list refetches.
- [ ] Scroll to bottom, click **Load older** → older rows appended; cursor
      advances; eventually button says **End of history** and is disabled.
- [ ] Each row shows: time (localised), robot, order_id (mono font), update,
      node count, header id.

### OEE — empty state
- [ ] `/oee` with no cycles → cards show `0` / `—`; "No cycles yet" in the chart
      area; the cycles log shows the empty-grid hint.

### OEE — populated **[robot]**
- [ ] Run a couple of successful orders end-to-end (or insert OEE rows
      manually).
- [ ] Cards show totals and avg duration.
- [ ] Success-rate hint under "Succeeded" reads `XX.X% success`.
- [ ] Availability bar fills proportionally; raw count text on the right.
- [ ] BarChart renders bars one per cycle; oldest on the left.
- [ ] Cycles log table shows the rows; `SUCCEEDED` green, otherwise red;
      duration formatted to one decimal.

### Snackbar / toast
- [ ] Trigger any admin save → a green toast appears bottom-right, auto-hides in 4 s.
- [ ] Trigger any 4xx → red toast with the API error message.
- [ ] Two saves in quick succession → toasts queue (one shows after the previous
      closes), no overlap.

### Admin — Maps
- [ ] `/admin/maps` lists `map-001`, `map-002`.
- [ ] **+ Add** → drawer; enter `map-test` / `Test Map` → toast "Map created";
      grid refetches; new row visible.
- [ ] Edit `map-test` (pencil) → drawer; label disabled-fields show ID; change
      label; Save → toast updated; grid reflects new label.
- [ ] Delete `map-test` (trash) → confirm dialog; confirm → toast deleted; row gone.
- [ ] Try to delete `map-001` (used by `amr001`) → red toast
      "Cannot delete: still in use" (HTTP 409). `map-001` still present.

### Admin — Named Locations
- [ ] `/admin/locations` lists the seeded four.
- [ ] **+ Add** → drawer with form + embedded MapCanvas of the chosen map's
      robot rosbridge.
- [ ] Click on the embedded canvas → x and y fields snap to the clicked world
      coords; pin appears at the click position.
- [ ] Save → toast; new row in grid.
- [ ] Edit an existing location → ID field disabled; map / label / x / y / θ
      editable; clicking on canvas re-positions the pin.
- [ ] Delete a location not referenced by any order → succeeds.
- [ ] Switch the form's map dropdown → the embedded canvas re-subscribes to that
      map's rosbridge (you may see a momentary "Waiting…" then the new grid).

### Admin — Robots
- [ ] `/admin/robots` lists current robots.
- [ ] **+ Add** → drawer; serial `amr002`, URL `ws://localhost:9091`, pick a map.
      Save → toast "Robot created — restart the ROS Bridge to pick it up".
- [ ] `GET /fleet` now lists `amr002` (registry auto-reloaded).
- [ ] Edit `amr002` → ID field disabled; change URL; Save → toast.
- [ ] Delete `amr002` (no telemetry yet) → succeeds.
- [ ] Try to delete `amr001` (has telemetry) → red toast with 409; row stays.
- [ ] **[robot]** After adding a robot, the new tile appears on Dashboard;
      MQTT topics for that serial start being subscribed to.

### Admin — Fleet Config
- [ ] `/admin/fleet` form pre-populated from current `/fleet`.
- [ ] Save unchanged → toast "Fleet config updated — registry reloaded".
- [ ] Change `version` to `2.0.1` → save → toast; refresh page → new value sticks.
- [ ] **Warning banner** reads correctly with the current `interface_name`,
      `major_version`, `manufacturer` interpolated in the example topic.
- [ ] Restore original values when done.

---

## Phase 13 — End-to-end smoke

A scripted "everything works together" run.

- [ ] Start the full stack (`docker compose up --build` or the manual route).
- [ ] React app loads at `http://localhost:5173/`. All four pills green within 10 s.
- [ ] **[robot]** Robot is publishing; Dashboard tile shows ONLINE + battery.
- [ ] **[robot]** Open Robot Detail; map + arrow + pins render.
- [ ] **[robot]** Dispatch → send a named-location order → ActiveOrderPanel
      shows the orderId. Robot moves.
- [ ] **[robot]** On the same page, errors panel stays empty during a clean run.
- [ ] **[robot]** Once order completes, an OEE cycle appears at `/oee` and the
      order shows up at `/orders` (refresh).
- [ ] **[robot]** Open Teleop in another tab → ENGAGED → drive briefly → release →
      robot stops.
- [ ] Add a map + location in Admin → it appears in Dispatch's named-location
      list within a few seconds (React Query staleTime 30 s, or hit Refresh).
- [ ] Stop FastAPI → pills flag the outage; existing MQTT live data (Dashboard
      tiles) keeps updating (independent channel).
- [ ] Restart FastAPI → no manual refresh needed; pills return to green.

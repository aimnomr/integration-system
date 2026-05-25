# Manual Test Checklist

A step-by-step manual verification of the AMR Integration System — happy paths,
the G15–G21 gap fixes, and extreme / failure cases.

> **Automated suite status (2026-05-22):** all green.
> - `.\scripts\test\run-all.ps1`: Phase 4 ingestion 6/6, Phase 6 G19 retention 6/6, Phase 8/9 misc 4/4, Newman **66/66 assertions**, pytest **41/41** (+5 G24 cases in `test_db_unavailable.py`), node:test **19/19**.
> - Playwright (`cd frontend && npm run e2e`): **24/24 passed**, 0 skipped, 0 failed (2.2 min).
>
> Every item tagged `[auto: …]` below was confirmed passing in those runs.

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

## Status legend

| Tag | What it means |
|---|---|
| `[auto: newman]` | Covered by the Postman/Newman collection at `docs/postman/`. Run `.\docs\postman\run-newman.ps1`. |
| `[auto: pytest]` | Covered by a unit test under `fastapi-service/tests/`. Run `pytest` from `fastapi-service/`. |
| `[auto: node]` | Covered by a unit test under `ros-bridge-service/test/`. Run `npm test`. |
| `[auto: ps]` | Covered by a PowerShell integration script under `scripts/test/`. Run individually or via `scripts\test\run-all.ps1`. |
| `[auto: e2e]` | Covered by Playwright under `frontend/tests/e2e/`. Run `npm run e2e` from `frontend/`. |
| `[robot]` | Requires a live robot or sim — must be done by hand. |
| _no tag_ | Manual — either chaos (service stop/start) or UI-only interaction. |

Run everything automatable in one go from the repo root:
```powershell
.\scripts\test\run-all.ps1
```
For a guided manual spot-check organised by service rather than by phase, see
[`docs/manual-test-by-service.md`](manual-test-by-service.md).

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
      `database` both report `connected`. `[auto: newman]`
- [x] Node-RED window: `Connected to broker`, `Started flows`, **no `ENOTFOUND`**.
- [x] Open <http://localhost:1880> — MQTT nodes show "connected".
- [x] **[robot]** ROS Bridge window logs a rosbridge connection per robot.

---

## Phase 2 — Reference-data CRUD (G15)

### Maps  `[auto: newman]`
- [x] `GET /maps` → lists `map-001`, `map-002`.
- [x] `POST /maps` body `{"map_id":"map-003","label":"Test Map"}` → **201**.
- [x] `GET /maps/map-003` → returns the new map.
- [x] `PUT /maps/map-003` body `{"label":"Renamed"}` → 200, label updated.
- [x] `DELETE /maps/map-003` → 200 `{"status":"ok","deleted":"map-003"}`.

### Named locations  `[auto: newman]`
- [x] `GET /locations` → lists the 4 seeded locations.
- [x] `POST /locations` body `{"id":99,"map_id":"map-001","label":"Dock","x":1,"y":2}`
      → **201**, `theta` defaults to `0.0`.
- [x] `PUT /locations/99` → 200, fields updated.
- [x] `DELETE /locations/99` → 200.

### Robots  `[auto: newman]`
- [x] `GET /robots/amr001` → returns the robot row.
  > **RESOLVED (G23, 2026-05-21):** `GET/POST/PUT /robots/{serial}` now
  > return camelCase (`serialNumber`, `rosbridgeUrl`, `mapId`), matching
  > `GET /robots` (list). A `_to_camel(row)` helper was added to
  > `app/routers/robots.py`. The Newman assertion now passes.
- [x] `POST /robots` body `{"serial_number":"amr002","rosbridge_url":"ws://localhost:9091","map_id":"map-001"}`
      → **201**.
- [x] `GET /robots` → now lists `amr002` too (registry reloaded — **no restart needed**).
- [x] `PUT /robots/amr002` → 200.
- [x] `DELETE /robots/amr002` → 200; `GET /robots` no longer lists it.

### Fleet config  `[auto: newman]`
- [x] `GET /fleet` → current identity.
- [x] `PUT /fleet` body `{"interface_name":"amr","major_version":"v2","version":"2.0.0","manufacturer":"moverobotic"}`
      → 200.

---

## Phase 3 — Orders & instant actions

- [x] `POST /robots/amr001/order` body `{"nodes":[{"x":1.0,"y":0.5,"theta":0.0}]}`
      → 200 `{"status":"ok","orderId":"amr001-order-N","nodeCount":1}`. `[auto: newman]`
- [x] `POST /robots/amr001/order/named` body `{"location_ids":[1,2]}` → 200, nodeCount 2.
- [x] `POST /robots/amr001/instant-actions` body `{"action_type":"cancelOrder"}`
      → 200 with an `actionId`. `[auto: newman]`
- [x] In Node-RED **Test Harness** tab, click "order: single goal" — the order is
      published; the "Command Audit" tab debug shows `order logged`. {It shows status ok for order logged}
- [x] **[robot]** ROS Bridge logs `Order accepted` → `Node goal sent`; the robot moves.
- [x] **[robot]** A 2-node order auto-advances to the second node on `SUCCEEDED`.

---

## Phase 4 — Telemetry ingestion pipeline

> `[auto: ps]` — `scripts\test\test-ingest.ps1` replays every assertion in
> this phase (baseline-vs-after row counts for state_snapshots and
> connection_log, malformed-payload-dropped, full valid /ingest/state body).
> The manual procedure below stays useful for debugging when the script fails.

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

- [x] **In Node-RED** (<http://localhost:1880>) → **Telemetry Ingestion** tab:
      the `validateState` node briefly shows a green status; the
      `state persisted` debug pane prints `{"status":"ok"}`.
      _(Visual UI check — automation can't see the debug pane, but the
      end-to-end row-count delta is verified by `test-ingest.ps1`.)_
- [x] Open another terminal: `psql -U postgres -d amr_integration -c "SELECT count(*) FROM state_snapshots;"`
      → count is **higher** than before the publish.
- [x] Repeat with a connection message:
      ```powershell
      '{"headerId":1,"timestamp":"2026-05-18T12:00:00Z","serialNumber":"amr001","connectionState":"ONLINE"}' | Out-File -Encoding ascii conn.json
      mosquitto_pub -h localhost -t "amr/v2/moverobotic/amr001/connection" -f conn.json
      ```
      Then `psql ... -c "SELECT count(*) FROM connection_log;"` increased.
- [x] **[robot]** With a real robot publishing, the same rows appear
      automatically — no need to run `mosquitto_pub` manually.

---

## Phase 5 — State & OEE reads  `[auto: newman]`

- [x] `GET /robots/amr001/state` → latest snapshot with `node_states`,
      `action_states`, `errors` arrays.
- [x] `GET /robots/amr001/oee/summary` → totals (0 cycles until an order completes).
- [X] `GET /robots/amr001/oee/cycles` → `{"cycles":[...]}`.
- [x] `GET /robots/amr001/oee/availability` → `driving_samples` / `total_samples`.

---

## Phase 6 — Gap fixes G16–G21

### G20 — ingest validation (422, not 500)  `[auto: newman]` `[auto: ps]`
- [x] `POST /ingest/state` body `{"timestamp":"t"}` (no `serialNumber`)
      → **422**, response names `serialNumber`. (Was a 500 before.)
- [x] `POST /ingest/connection` body with `connectionState":"BOGUS"` → **422**.
- [x] `POST /ingest/state` with a full valid body → **200**.
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

### G21 — counters survive a restart  `[auto: pytest]`
- [x] `POST /robots/amr001/order` twice — note the suffixes (`-order-0`, `-order-1`).
- [x] Confirm both orders reached the `orders` table (Command Audit tab / `psql`).
- [x] Stop and restart **only** FastAPI.
- [x] `POST /robots/amr001/order` again → orderId is `-order-2` (**not** `-order-0`).
- [x] `psql ... -c "SELECT order_id, header_id FROM orders ORDER BY id;"` →
      `header_id` is non-decreasing across the restart.

### G16 — connection pooling  `[auto: pytest]`
- [x] Fire ~30 quick reads: `for ($i=0;$i -lt 30;$i++){ curl.exe -s http://localhost:8000/robots/amr001/state > $null }` — all succeed, no slowdown.
- [x] `psql ... -c "SELECT count(*) FROM pg_stat_activity WHERE datname='amr_integration';"`
      → connection count stays at/below `DB_POOL_MAX` (default 10), not one-per-request. {It stays at 2 before, during and after the command runs}

### G19 — telemetry retention  `[auto: ps]` `[auto: pytest]`

> `scripts\test\test-retention.ps1` plants a 90-day-old sentinel row and runs
> the prune SQL directly; `fastapi-service/tests/test_retention.py` covers
> the lifespan-hook disable-when-zero logic. The full manual procedure below
> is kept for the case where you want to see the FastAPI log line yourself.

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

- [x] FastAPI log printed a `telemetry pruned` line within ~6 hours of startup.
      (The background task fires at boot + every 6 h after; the boot one is
      the one you see now.) _(Log-message check — manual; the prune SQL
      itself is verified by `test-retention.ps1`.)_
- [ ] `psql ... -c "SELECT count(*) FROM state_snapshots WHERE header_id=999;"`
      → `0`. The 90-day-old row is gone. {Selected to check, but still there. Telemetry retention is set to 1. amr_integration=# SELECT serial_number as sn, ts, header_id as id FROM state_snapshots WHERE header_id=999;
   sn   |             ts             | id
--------+----------------------------+-----
 amr001 | 2026-05-21 12:47:53.744+08 | 999
(1 row)}
- [x] `psql ... -c "SELECT count(*) FROM state_snapshots WHERE ts > now() - interval '1 day';"`
      → unchanged from before the restart. Recent rows untouched.
- [x] Restart FastAPI again with `TELEMETRY_RETENTION_DAYS=0` — the startup
      log does **not** print `telemetry retention enabled`; the prune task
      doesn't start. _(Covered by `tests/test_retention.py::test_retention_loop_disabled_when_days_zero`.)_
- [x] Reset `TELEMETRY_RETENTION_DAYS` back to `30` (or remove it) after testing.

---

## Phase 7 — Auth & rate limiting (G10 / G11)  `[auto: pytest]`

> Pytest covers the header-required / wrong-key / good-key / rate-limit
> matrix (`tests/test_auth.py`, `tests/test_ratelimit.py`). The manual
> steps below remain useful for live-environment smoke against a running
> stack that already has `API_KEY` set.

**Setup:** add these two lines to `fastapi-service/.env`, then restart FastAPI:
```
API_KEY=test-key
RATE_LIMIT_PER_MINUTE=5
```

- [x] `GET /robots` with no header → **401**.
- [x] `GET /robots` with `-H "X-API-Key: wrong"` → **401**.
- [x] `GET /robots` with `-H "X-API-Key: test-key"` → 200.
- [x] `POST /ingest/state` with **no `X-API-Key` header** (but a full valid
      body — same body the Phase 4 example uses) → **200** with
      `{"status":"ok"}`. The point of this test is that `/ingest/*` is
      deliberately **exempt** from the auth check (it's the internal
      Node-RED → DB boundary). _(Verified by Newman section 10
      "POST /ingest/state — full valid body" — no auth header is sent.)_ Example:
      ```powershell
      curl.exe -X POST -H "Content-Type: application/json" -d "@state.json" http://localhost:8000/ingest/state
      ```
      (Reuse `state.json` from Phase 4 step 2 — that's the "full valid body".)
- [x] Fire 7 requests quickly → the 6th/7th return **429** with a `Retry-After` header.
- [x] **[robot] How to test:** you don't make this call yourself — the **ROS
      Bridge Service** does it automatically at startup. With `API_KEY=test-key`
      set on FastAPI:
        1. Edit `ros-bridge-service/.env`, add `API_KEY=test-key`.
        2. Restart the ROS Bridge.
        3. Look at its startup log — you should see `Fleet loaded:` (success)
           rather than `401`. If the keys mismatch the bridge logs the 401 and
           exits.
- [x] **Cleanup:** remove `API_KEY` and reset `RATE_LIMIT_PER_MINUTE=120` (or
      delete the lines) in both `.env` files; restart both services. Otherwise
      every subsequent test that doesn't send the key will fail with 401.

---

## Phase 8 — Extreme / failure cases

### Bad input  `[auto: newman]`
- [x] `POST /robots/amr001/order` body `{"nodes":[]}` → **422** (empty order).
- [x] `POST /robots/amr001/order` body `{"nodes":[{"x":1}]}` → **422** (`y` missing).
- [x] `POST /robots/UNKNOWN/order` → **404** (robot not registered).
- [x] `POST /robots/amr001/order/named` body `{"location_ids":[9999]}` → **404**.
- [x] `POST /robots/amr001/instant-actions` body `{"action_type":"fly"}` → **422**.

### CRUD conflicts (G15 — no cascade)  `[auto: newman]`  (delete-amr001 `[auto: e2e]`)
- [x] `POST /maps` with an existing `map_id` → **409** (duplicate).
- [x] `DELETE /maps/map-001` while a robot/location references it → **409**;
      `map-001` is **not** deleted, telemetry untouched.
- [x] `POST /robots` with `map_id":"map-404"` (nonexistent) → **422**.
- [x] `DELETE /robots/amr001` after it has telemetry/orders → **409**.
- [x] `GET /maps/nope`, `PUT /maps/nope`, `DELETE /maps/nope` → **404** each.

### Database loss (runtime)
- [x] With FastAPI running, **stop PostgreSQL**.
- [ ] `GET /robots/amr001/state` → **503** `Database unavailable: ...`. {500 : Internal Server Error}
      > **FIXED (G24, 2026-05-22) — pending re-test.** Root cause: `db.py`'s
      > lazy pool only translated psycopg2 errors at pool-build time; once
      > built, runtime `OperationalError` propagated unwrapped as 500. The
      > five helpers (`_query`, `_execute`, `_execute_returning`,
      > `_transaction`, `fetch_latest_state`) now catch
      > `(psycopg2.OperationalError, psycopg2.InterfaceError)` and re-raise
      > as `DatabaseUnavailable` — caught by the router's existing 503 guard.
      > Pool is also invalidated so the next request rebuilds. Verified via
      > `tests/test_db_unavailable.py` (5 cases). Manual re-test: stop
      > Postgres, hit this endpoint; expect 503 with body
      > `{"status":"error","message":"Database unavailable: ..."}`.
- [ ] `GET /system/status` → `database` reports `unavailable` (no crash). {500 : Internal Server Error}
      > **FIXED (G24, 2026-05-22) — pending re-test.** Same fix as above —
      > `db.ping()` was raising `OperationalError` past its
      > `except DatabaseUnavailable` guard. `ping()` now runs `SELECT 1`
      > through the wrapped `_query` helper. The endpoint should now stay
      > **200** with `database.status == "unavailable"` (the other fields
      > unaffected) — the contract the frontend Health page needs.
- [x] `POST /robots/amr001/order` → still **200** (publishes to MQTT; doesn't need DB). 
- [x] Restart PostgreSQL → reads return **200** again (pool rebuilds on next call).
- [x] Note: FastAPI will **not start** with PostgreSQL down — the fleet is loaded
      from the DB at boot. Start order stays Postgres → FastAPI.

### Broker / connectivity loss
- [x] Stop Mosquitto → `GET /system/status` `mosquitto` reports `disconnected`.
- [x] Restart Mosquitto → FastAPI, Node-RED, ROS Bridge reconnect automatically.
- [x] **[robot]** Kill the ROS Bridge process → its retained `connection` topic
      flips to `CONNECTIONBROKEN` (Last-Will); `/system/status` `roslib` reflects it.

### Malformed MQTT / Node-RED  `[auto: ps]`
- [x] `mosquitto_pub` a non-JSON payload to `amr/v2/moverobotic/amr001/state`
      → Node-RED `validateState` errors, drops it; no DB row, no crash.
- [x] `mosquitto_pub` a state message missing `serialNumber` → validator rejects it.

### Ordering / concurrency  `[auto: ps]`
- [x] Submit 5 orders rapidly → 5 distinct `orderId` suffixes, no duplicates.
- [x] **[robot]** Submit a new order while one is mid-execution → behaviour is
      defined (new order replaces current); confirm it matches expectation. {Directly goes to exec the next order. Abandoning the current order}

---

## Phase 9 — Recent backend additions

### G21 startup-crash fix — non-numeric order suffix  `[auto: ps]`
> `scripts\test\test-misc.ps1` plants the legacy row, runs the registry-seed
> aggregation SQL verbatim, and cleans up. The end-to-end FastAPI restart
> (below) only matters if you want to see startup logs.
- [x] Insert a legacy-style order row whose suffix isn't numeric:
      `psql ... -c "INSERT INTO orders (serial_number, ts, header_id, order_id, order_update_id) VALUES ('amr001', now(), 1, 'amr001-order-goal', 0);"`
- [ ] Stop FastAPI; restart it. _(Manual restart; SQL safety verified by
      `test-misc.ps1` running the registry-seed aggregation query
      against a planted legacy row.)_ {Quite unsure with what is needed here. Need to test using test-misc? Or just manual restart}
      > **What to do:** if `scripts\test\test-misc.ps1` has already passed
      > in this session, this manual step is **redundant** — the script
      > runs the exact `fetch_max_order_suffixes` aggregation SQL against
      > a planted legacy row, which is the only thing this restart is
      > probing. Do the manual restart **only if** you want to read the
      > FastAPI startup log with your own eyes and confirm no
      > `psycopg2.errors.InvalidTextRepresentation` traceback. Steps:
      > 1. Plant the legacy row (the line above).
      > 2. Ctrl+C the FastAPI window; re-launch via `start-all.ps1` or
      >    `uvicorn main:app --reload --port 8000` from the venv.
      > 3. Look for a clean `Uvicorn running on ...` line — no traceback
      >    above it.
- [x] FastAPI **starts without traceback** (was `psycopg2.errors.InvalidTextRepresentation` before).
      _(Manual; the regex filter in `fetch_max_order_suffixes` is exercised
      via the SQL re-run in `test-misc.ps1`.)_
- [x] `GET /robots/amr001/state` works; counters keep ticking.
- [x] Clean up the row: `psql ... -c "DELETE FROM orders WHERE order_id='amr001-order-goal';"`

### Node-RED DB Admin tab
- [x] Open `http://localhost:1880` → **DB Admin** tab is visible (5th tab).
- [x] `npm install` has been run in `node-red/` (pulls `node-red-contrib-postgresql`).
- [x] Stop FastAPI + ROS Bridge first (per the tab's docstring).
- [x] Click **Reset DB** inject → the postgresql node debug shows a result; no error fill.
- [x] `psql ... -c "SELECT count(*) FROM state_snapshots;"` → `0` (reset wiped telemetry).
- [x] Reseeded tables are back: `psql ... -c "SELECT * FROM robots;"` → `amr001`.
- [x] Edit the **Run custom SQL** inject payload to:
      `INSERT INTO maps (map_id, label) VALUES ('map-009','Test') ON CONFLICT DO NOTHING;`
- [x] Press inject → `GET /maps` (after FastAPI restart) lists `map-009`.
- [x] If npm dep is missing, the workspace shows red "missing type" — that's the
      tell that `npm install` wasn't run.

### Phase 0 backend prep — CORS (G18)  `[auto: newman]` `[auto: pytest]` `[auto: e2e]`
- [x] FastAPI started with default env → `curl.exe -H "Origin: http://localhost:5173" -I http://localhost:8000/system/status`
      returns `access-control-allow-origin: http://localhost:5173`.
- [x] Same request with `Origin: http://evil.example` → **no** `access-control-allow-origin` header.
- [x] Restart FastAPI with `CORS_ORIGINS=http://localhost:9999` → only that origin
      is now allowed; the Vite dev server (`5173`) is blocked. Reset afterwards. {API stays dead to the interface}

### Phase 0 — GET /orders endpoint  `[auto: newman]`
> ✅ First four items verified by Newman run 2026-05-21 02:37.
- [x] `curl.exe http://localhost:8000/orders` → `{"orders":[...], "count":N}`.
- [x] `curl.exe "http://localhost:8000/orders?serial=amr001&limit=2"` → at most 2 rows, all for amr001.
- [x] `curl.exe "http://localhost:8000/orders?serial=ghost"` → **404**.
- [x] `curl.exe "http://localhost:8000/orders?limit=0"` → **422** (limit must be ≥ 1).
- [x] `curl.exe "http://localhost:8000/orders?limit=501"` → **422** (limit clamped to 500).
- [x] With `serial=amr001`, page through using `before=<ts>` — second call returns
      strictly older rows; reaches an empty list once exhausted.
- [ ] `node_count` matches `psql ... -c "SELECT count(*) FROM order_nodes WHERE order_pk=<id>;"`. {Not sure what is asked here}
      > **What to do:** this confirms the LEFT JOIN aggregation in
      > `fetch_orders` (returns `node_count`) agrees with the raw child
      > table. Steps:
      > 1. `curl.exe "http://localhost:8000/orders?limit=1"` → pick one row;
      >    note its `id` (the orders table primary key) and `node_count`.
      > 2. `psql -U postgres -d amr_integration -c "SELECT count(*) FROM order_nodes WHERE order_pk=<id-from-step-1>;"`
      > 3. The count from the SQL must equal `node_count` from step 1.
      > Why it matters: the API computes `node_count` via a LEFT JOIN +
      > GROUP BY so the UI can show waypoint count without a second request;
      > if the join logic ever drifts, this check catches it.

### Phase 0 — Mosquitto WebSocket listener on :9001  `[auto: ps]` `[auto: e2e]`

> **Why this section exists.** The React app runs in the browser, which
> can't open raw TCP — it speaks MQTT over a WebSocket. So Mosquitto needs
> a second listener on `:9001` with `protocol websockets`, alongside its
> normal `:1883` TCP listener for the backend services. These four checks
> verify the listener is configured, started, listening on the port, and
> actually reachable from the React app.

- [ ] `mosquitto.conf` has the `listener 9001` + `protocol websockets` block.
      _(How to check: open `D:\FYP\integration-system\mosquitto\mosquitto.conf`
      and grep for `listener 9001`; you should see two `listener` directives —
      one for `1883` and one for `9001` — with the 9001 block carrying
      `protocol websockets` and `allow_anonymous true`.)_
- [ ] Mosquitto logs (or `docker compose logs mosquitto`) show two listeners.
      _(How to check: in the Mosquitto window at startup, you'll see two
      `Opening ipv4 listen socket on port …` lines — one for 1883, one for
      9001. If running via docker compose: `docker compose logs mosquitto |
      Select-String "listen socket"`.)_
- [x] `netstat -an | findstr ":9001"` (or `ss -lnt | grep 9001` in WSL) shows
      mosquitto listening.
- [ ] Browser → DevTools → Network → WS tab: with the React app open, you see
      one WebSocket to `ws://localhost:9001/mqtt` in connected state. (`Frames`
      tab shows the heartbeat / messages.)
      _(How to check: open `http://localhost:5173/` in a browser. Hit F12 →
      **Network** tab → click the **WS** filter button at the top of the
      request list. You should see one row whose URL ends in `:9001/mqtt`
      and whose status is `101 Switching Protocols` (= WS upgrade success).
      Click the row → **Messages** sub-tab → as the MQTT broker delivers
      `state` / `connection` topics you'll see frames flow.)_

---

## Phase 10 — Frontend smoke (scaffold + connectivity)

### Build & dev server
- [x] `cd frontend && npm install` completes without errors. {No errors just npm warn}
      (If MUI / TS peer-dep warnings: `npm install --legacy-peer-deps`.)
- [x] `npm run dev` prints `Local: http://localhost:5173/`; no compile errors.
- [ ] If `optimizeDeps` complaint on first run: delete `node_modules/.vite/`,
      re-run `npm run dev`. {No complaints}
- [x] `npm run typecheck` exits 0. {Originally found 8 errors (captured in frontend/typecheck.txt 2026-05-21); fixed in session 2026-05-22 — see CONTINUATION.md entry "Frontend typecheck zero-errored…". `tsc -b --noEmit` now exits 0 cleanly.}
- [x] `npm run build` produces `dist/` without errors. {Only some warnings}

### AppShell + routing  `[auto: e2e]`
- [x] Open `http://localhost:5173/` → AppBar with logo + "AMR Console", four
      pills (API / MQTT / DB / ROS), LeftNav with Operate + Admin sections.
- [x] Click each LeftNav entry — URL updates; main pane swaps. The currently
      selected item is highlighted indigo.
- [x] Manually visit `/this-is-not-a-route` → "404 — Not found" page with a
      back-to-dashboard link.
- [x] Hovering each pill shows a descriptive tooltip (e.g. "Mosquitto WebSocket: connected").

### Health pills — live state transitions
- [x] All services running → API + MQTT + DB + ROS all green within 5 s.
- [ ] Stop FastAPI → within 5 s: API red, DB red, ROS red. MQTT stays green
      (different connection). {Only API turns red, others stays green. On refresh others turn idle and api turns red and mqtt stays green}
      > **FIXED (G25, 2026-05-22) — pending re-test.** Root cause:
      > `useSystemStatus` returns TanStack Query's default `data` retention
      > across errors, so when the 5 s poll failed, `sys.data` still held
      > the last successful body and DB / ROS / Node-RED pills stayed green.
      > Fix: every pill derived from `sys.data` is now gated on
      > `sys.isError` (AppBar DB + ROS; Health page MQTT-backend, PostgreSQL,
      > rosbridge-fleet, Node-RED rows). When the poll errors they collapse
      > to **idle** (grey, not red — we genuinely don't know their state),
      > with tooltip "unknown — API unreachable." Re-test: stop FastAPI;
      > within 5 s API → red, DB + ROS + Node-RED → grey/idle, MQTT
      > unchanged (separate WS).
- [x] Restart FastAPI → all three flip back to green.
- [x] Stop Mosquitto → MQTT pill cycles yellow ("reconnecting") then red ("offline").
- [x] Restart Mosquitto → MQTT goes yellow then green; browser auto-reconnects.
- [x] **[robot]** Stop ROS Bridge while a robot was online → after the broker's
      retention window, ROS pill flips red.

### Health page  `[auto: e2e]`
- [x] Navigate to **Health** in LeftNav → six rows (FastAPI, MQTT browser, MQTT
      backend, PostgreSQL, rosbridge fleet, Node-RED), each with the right pill
      and a descriptive subtitle.
- [x] The FastAPI row shows "Last response at HH:MM:SS"; refreshes every 5 s.

### CORS (browser side)  `[auto: e2e]`
- [x] DevTools → Console: no `blocked by CORS policy` errors after page loads.
- [ ] Network tab: requests to `localhost:8000/*` carry `Origin:
      http://localhost:5173` and get back `access-control-allow-origin` matching. {Not sure what is asked here}
      > **How to check:**
      > 1. Open `http://localhost:5173/` → F12 → **Network** tab.
      > 2. Pick any request to `localhost:8000` (the easiest: the
      >    `/system/status` poll fires every 5 s, or the `/fleet` call
      >    that runs on mount).
      > 3. Click the request → **Headers** sub-panel.
      > 4. Under **Request Headers** confirm:
      >    `Origin: http://localhost:5173`.
      > 5. Under **Response Headers** confirm:
      >    `access-control-allow-origin: http://localhost:5173`.
      >
      > Both present and matching = CORS is working. If you only see the
      > Origin request header but no `access-control-allow-origin` in the
      > response, the FastAPI `CORS_ORIGINS` env var doesn't include
      > `5173` and the browser would block the response.

---

## Phase 11 — Frontend v1 screens

### Dashboard  `[auto: e2e]` (static render + click-through)
- [x] `/` shows one tile per robot from `GET /fleet` (just `amr001` if you haven't
      added more).
- [x] Each tile fields populate: connection pill, mode, battery, orderId,
      "last seen", map, rosbridge status. Empty fields show `—` (no `undefined`).
- [ ] After a `state` MQTT message arrives, "last seen" resets to "0s ago" and
      ticks upward. {FIXED 2026-05-25 (G26) — pending re-test. RobotTile now
      drives a 1 s ticker so the label re-evaluates between messages.}
- [x] Click a tile → navigates to `/robots/<serial>`.
- [ ] No robots in fleet → "No robots in the fleet" hint with a pointer to
      Admin → Robots. {Not sure what is asked here}
      > **How to emulate:** this is the empty-fleet state. It's a
      > destructive check — to truly empty the fleet you'd need to delete
      > all telemetry FK refs first, then DELETE the robots. Two safer
      > ways:
      > 1. **Read-only sim** (recommended): temporarily edit
      >    `frontend/src/api/fleet.ts`'s `listFleet` to return
      >    `{ robots: [] }` for one render, then revert. Confirms the
      >    empty-state UI exists.
      > 2. **Full DB reset path:** Node-RED → DB Admin → **Reset DB**
      >    button → BEFORE pressing Run custom SQL to re-seed `robots`,
      >    refresh the Dashboard. You should see the empty hint with a
      >    link to Admin → Robots. Then press the seed inject to restore.
      > Mark this `[x]` only if you've actually seen the empty hint
      > render.

### Robot Detail — Map
- [x] `/robots/amr001` shows the MapCanvas on the left.
- [ ] **[robot]** Without anyone publishing `/reference/map`: canvas shows
      "Waiting for /reference/map…"; no crash. {Not sure how to emulate this}
      > **How to emulate (two paths):**
      > 1. **Cheapest:** in Admin → Robots, edit `amr001`'s `rosbridgeUrl`
      >    to a port that has no rosbridge (e.g. `ws://localhost:9092`).
      >    Reload `/robots/amr001` → the canvas can't subscribe → shows
      >    the waiting message. Restore the URL when done.
      > 2. **Closer to real:** on the robot/sim, stop just the map
      >    publisher (`rosnode kill /map_server` if you used map_server)
      >    while leaving rosbridge running. The MapCanvas remains
      >    subscribed but no message arrives → "Waiting for /reference/map…".
- [ ] **[robot]** Once map is publishing: occupancy grid renders (free white,
      occupied dark, unknown grey). Aspect ratio preserved. {Current map is square, not yet tested with random map size}
- [x] **[robot]** Resize the window — the canvas resizes with it (no stretching). {Resizes as expected}
- [x] **[robot]** Robot arrow appears at the AMCL pose; rotates with yaw.
- [x] **[robot]** Top-right overlay reads `pose: AMCL`.
- [x] **[robot]** Stop the AMCL publisher (e.g. `rosnode kill /amcl`) for >2 s →
      overlay flips to `pose: EKF (fallback)`; arrow turns amber.
- [x] **[robot]** Resume AMCL → overlay returns to AMCL after the next message;
      arrow back to blue.
- [x] **[robot]** `/move_base_node/DWAPlannerROS/global_plan` published → sky-blue
      polyline appears on the map.
- [x] **[robot]** `/move_base_node/DWAPlannerROS/local_plan` → red polyline.
- [x] Named locations on the robot's map appear as violet pins with labels. {FIXED 2026-05-25 (G27) — pending re-test. Labels now render inside a slate-900 pill with a pin-coloured stroke and slate-100 text; pin circle has a slate-900 outline so it's visible on bright cells too.}

### Robot Detail — Side panel
- [x] **State** tab shows the VDA5050 field readout updating in real time.
- [x] **Errors** tab: with no errors, "No errors reported."; with errors, each
      one shows level (colour-coded), errorType, and description.
- [x] **Actions** tab lists every `actionStates[]` entry with its status.
- [ ] Connection pill (top-right) reflects the retained `connection` topic
      (`ONLINE` / `OFFLINE` / `CONNECTIONBROKEN`). {Correct when online, but when robot sim is stopped. It doesnt reflect from online to offline. Only reflects when rosbridge is stopped. However error shows connection error }
      > **GAP G39 — needs investigation.** See [gaps.md#g39](gaps.md).
      > May be expected VDA5050 behaviour (the bridge publishes
      > `connection` on the robot's behalf and can't detect a sim
      > shutdown unless rosbridge dies). But "error shows connection
      > error" suggests another channel sees it — the pill could plausibly
      > bind to that. Could resolve as EXPECTED after investigation.

### Dispatch — Named mode  `[auto: e2e]` (happy path)
- [x] `/dispatch` → robot picker; pick `amr001`.
- [x] **Named** toggle selected by default.
- [x] Dropdown lists locations whose `map_id` matches the robot's `mapId`. Empty
      if no locations match.
- [x] Pick a location → it appears in the ordered list below the dropdown.
- [x] Add a second location → list grows; "remove" button works.
- [ ] **Send order** → toast "Order created" (or similar); the ActiveOrderPanel
      below updates to show the new orderId and pending nodes. {Dont see any toast showing up, but send order is working. The robot moved as asked}
- [ ] If named POST returns 4xx (e.g. wrong location id) → error text under the
      builder; no toast loop. {Not sure how to emulate}
      > **How to emulate via the UI:**
      > 1. Open `/dispatch`; pick `amr001`; Named mode.
      > 2. In another tab, `DELETE /locations/<id>` for a location currently
      >    in your dropdown.
      > 3. Switch back to the dispatch tab — the dropdown still has the
      >    now-stale location in its already-loaded list. Add it, hit
      >    **Send order**.
      > 4. The backend returns 404 (location not found) → expect inline
      >    error text under the builder, **no** retry toast loop. Restore
      >    the location after.
      >
      > **Simpler path** (already covered by Newman): the 404 behavior
      > itself is verified in `docs/postman/amr-integration.postman_collection.json`
      > Phase 8 ("Bad input" → `POST /robots/amr001/order/named` with
      > `{"location_ids":[9999]}` → 404). The manual step here is purely
      > UI behavior on a 4xx (graceful error vs. toast spam).

### Dispatch — Manual mode  `[auto: e2e]` (single-node happy path)
- [x] Toggle to **Manual** → empty row at x=0, y=0, θ=0.
- [ ] Edit numeric values; add a second node; remove returns to one row;
      remove button disabled at one row. {Good, but currently when inputing number. The placeholder number doesnt go away. Meaning the default is 0. When i type 2. It becomes 02 instead of 2. Adding and remove node works as expected}
      > **FIXED (G36 + G38, 2026-05-22) — pending re-test.** New
      > `NumberField` component in
      > `frontend/src/components/common/NumberField.tsx` wraps MUI
      > TextField: selects all on focus (so "2" replaces "0", not "02")
      > and keeps a string buffer mid-typing so `-` and `.` don't reset
      > the parent state. Swapped into OrderBuilder (Manual mode) and the
      > Locations editor. Re-test: focus an x field; the existing "0"
      > should highlight; typing "2" yields "2". Typing "-1.5" should
      > also work end-to-end.
- [x] **Send order** → new orderId in the panel.

### Active order panel
- [x] orderId shown in monospace; "N nodes remaining" reflects `state.nodeStates`.
- [x] **[robot]** As the robot completes nodes, `nodeStates` shrinks; once empty,
      the panel collapses to "No active order".
- [ ] **Cancel** → toast; the panel clears once the robot returns to no-orderId. {No toast, returns [object Object] in the active order panel instead}
      > **FIXED (G34, 2026-05-22) — pending re-test.** Three-part fix:
      > (1) `postInstantAction` was sending `{"action":"cancel"}` but
      > FastAPI expected `{"action_type":"cancelOrder"}` — every call
      > was returning 422. Wire format corrected via a translation map
      > (G22-style). (2) The 422 `detail` is an array, so the old
      > `String(detail)` formatter produced `[object Object]` — a new
      > `formatErrorMessage` in `api/client.ts` handles array shapes.
      > (3) `ActiveOrderPanel` now fires `toast.success("Cancel sent")`
      > / `toast.error(...)`. Re-test: click Cancel on an active order →
      > expect green "Cancel sent" toast; click Retry / Skip → same
      > behaviour with their labels.
- [ ] **Retry** sends a retryNode instant action; backend logs the call. {Not sure what is expected here, elaborate. Behaviour is similar to cancelling. Returns object Object in the active order panel}
      > **What "retryNode" means.** It's a VDA5050 instant action that
      > tells the robot to re-attempt the **current** node after a
      > navigation failure — e.g. an obstacle blocked the path, robot
      > paused, you cleared the obstacle, now click Retry.
      >
      > **Expected behavior:**
      > 1. Active order is paused on a failed node (the State tab shows
      >    an `errors[]` entry with `navigationFailed` — G17).
      > 2. Click **Retry** → frontend calls
      >    `POST /robots/amr001/instant-actions` with
      >    `{"action_type":"retryNode"}`.
      > 3. Backend publishes an `instantActions` MQTT message; Node-RED
      >    **Command Audit** tab debug shows the action logged.
      > 4. Toast "Action sent: retryNode" appears. ROS Bridge applies it
      >    and re-publishes the failed node's goal; the robot resumes.
      >
      > The reported `[object Object]` toast string is a **separate
      > frontend bug** (toast renderer is stringifying the API response
      > body instead of using its `actionType` field). Worth filing
      > separately — recommend `G34: instant-action toast shows
      > "[object Object]"` if it isn't tracked yet.
- [ ] **Skip** sends a skipNode; backend logs the call. {Not sure what is expected here, elaborate. Behaviour is similar to cancelling. Returns object Object in the active order panel}
      > **What "skipNode" means.** Abandon the current node and advance
      > to the **next** node in the order. Useful when a waypoint is
      > unreachable but the rest of the route is still valid.
      >
      > **Expected behavior:**
      > 1. With a multi-node order active (e.g. 3 waypoints, robot stuck
      >    on the first).
      > 2. Click **Skip** → frontend calls
      >    `POST /robots/amr001/instant-actions` with
      >    `{"action_type":"skipNode"}`.
      > 3. ROS Bridge marks node 1 done and immediately publishes the
      >    goal for node 2; `state.nodeStates` shrinks by one.
      > 4. Toast "Action sent: skipNode". The active order panel's
      >    "N nodes remaining" decrements live.
      >
      > Same `[object Object]` toast bug as Retry — see note above.
- [ ] Cancel/Retry/Skip while no order is active → button disabled? (currently
      the panel is hidden — confirm there's no way to send a stray instant
      action.) {Order is completed. The active order is still there with the button can still be clicked}
      > **FIXED (G37, 2026-05-22) — pending re-test.** `ActiveOrderPanel`
      > now sets `done = nodeStates.length === 0`; Cancel / Retry / Skip
      > are gated on `disabled={busy || done}` and a subtext reads
      > "Order complete — instant actions disabled. Submit a new order
      > to re-enable." Re-test: complete an order; confirm the three
      > buttons render disabled-grey and clicking does nothing.

### Teleop
- [x] `/teleop` → robot picker; ENGAGED switch is disabled until rosbridge is
      `connected` for the picked robot. 
- [x] **[robot]** Connect → switch enabled; flip ENGAGED → switch label flips to
      "ENGAGED — robot will move".
- [x] **[robot]** Camera stream appears in the left pane; topic name shown in
      the corner overlay.
- [x] **[robot]** Press `W` → robot moves forward; `S` stops; `D` rotates; etc.
      The 3×3 grid maps to QWE / ASD / ZXC.
- [x] **[robot]** Release key → zero Twist published (robot stops within 100 ms).
- [x] **[robot]** Click-and-hold a button works for mouse + touch.
- [x] **[robot]** Disengage → keys are inert; clicking a button shows the
      disabled-grey style; no Twist published.
- [x] **[robot]** Mid-teleop, kill rosbridge → ENGAGED auto-disengages within
      the reconnect window; no runaway after reconnect.
- [x] Deep-link `/teleop/amr001` directly → loads with `amr001` pre-selected.

---

## Phase 12 — Frontend analytics + admin

### Order History  `[auto: e2e]` (render + serial filter) {Not sure what update, nodes and hdr means in the header of the table}

> **Column legend** (abbreviated for table density — full names live in
> [`schema/VDA5050_MESSAGES.md`](schema/VDA5050_MESSAGES.md)):
> - **time** — `ts` (when the order was accepted; localised in the browser).
> - **robot** — `serial_number`.
> - **order_id** — `{serial}-order-N` (mono font for easy diff).
> - **update** — `order_update_id`. VDA5050 lets you replace an in-flight
>   order with a higher `order_update_id`; this column shows which version
>   of the order this row represents. New orders start at `0`.
> - **nodes** — `node_count`. How many waypoints the order had.
> - **hdr** — `header_id`. The monotonic VDA5050 message counter for the
>   `order` topic; useful for ordering when timestamps are equal.
- [x] `/orders` shows the most recent N orders, newest first.
- [x] Filter by robot → list narrows to that robot only.
- [x] Change page size — list refetches.
- [x] Scroll to bottom, click **Load older** → older rows appended; cursor
      advances; eventually button says **End of history** and is disabled.
- [x] Each row shows: time (localised), robot, order_id (mono font), update,
      node count, header id.

### OEE — empty state  `[auto: e2e]`
- [x] `/oee` with no cycles → cards show `0` / `—`; "No cycles yet" in the chart
      area; the cycles log shows the empty-grid hint.

### OEE — populated **[robot]**
- [x] Run a couple of successful orders end-to-end (or insert OEE rows
      manually).
- [x] Cards show totals and avg duration.
- [ ] Success-rate hint under "Succeeded" reads `XX.X% success`.
- [ ] Availability bar fills proportionally; raw count text on the right.
- [ ] BarChart renders bars one per cycle; oldest on the left.
- [ ] Cycles log table shows the rows; `SUCCEEDED` green, otherwise red;
      duration formatted to one decimal.

### Snackbar / toast
- [x] Trigger any admin save → a green toast appears bottom-right, auto-hides in 4 s.
- [ ] Trigger any 4xx → red toast with the API error message. {not sure how to emulate}
      > **Easy ways to emulate a 4xx from the UI:**
      > 1. Admin → Maps → **+ Add** with `map_id = "map-001"` (already
      >    exists) → backend returns **409** → expect a red toast like
      >    "Map already exists".
      > 2. Admin → Robots → **+ Add** with `mapId = "map-404"` (no such
      >    map) → backend returns **422** → expect a red toast naming the
      >    field.
      > 3. Admin → Robots → try to **Delete** `amr001` (has telemetry) →
      >    **409** → red toast "Cannot delete: still in use".
- [ ] Two saves in quick succession → toasts queue (one shows after the previous
      closes), no overlap. {Not sure how to emulate}
      > **How to emulate:**
      > 1. Admin → Maps → **+ Add** → `map-test-a` / "A" → Save.
      > 2. Without waiting for the green toast to disappear (~4 s window),
      >    click + Add again → `map-test-b` / "B" → Save.
      > 3. You should see the first toast hide, then the second slides in
      >    — never both stacked on top of each other.
      > Clean up by deleting both rows after.

### Admin — Maps  `[auto: e2e]`
- [x] `/admin/maps` lists `map-001`, `map-002`.
- [x] **+ Add** → drawer; enter `map-test` / `Test Map` → toast "Map created"; {Toast is good}
      grid refetches; new row visible.
- [x] Edit `map-test` (pencil) → drawer; label disabled-fields show ID; change
      label; Save → toast updated; grid reflects new label.
- [ ] Delete `map-test` (trash) → confirm dialog; confirm → toast deleted; row gone. {Cannot delete, no option to delete. Tried to click three dots but is directed to edit instead. Cannot click triple dot}
      > **FIXED (G35, 2026-05-22) — pending re-test.** There was never a
      > triple-dot menu in the code; the row had two MUI `Button`s
      > overflowing the 110px-wide actions column (Button `minWidth=64`
      > × 2 = 128 > 110), so Delete was clipped and clicks landed on
      > Edit. Swapped to `IconButton` (sized to its icon) wrapped in
      > `Tooltip`. Applied to Maps + Locations + Robots admin grids.
      > Re-test: hover the row → both pencil and trash visible; click
      > trash → confirm dialog opens.
- [ ] Try to delete `map-001` (used by `amr001`) → red toast
      "Cannot delete: still in use" (HTTP 409). `map-001` still present.

### Admin — Named Locations
- [x] `/admin/locations` lists the seeded four.
- [x] **+ Add** → drawer with form + embedded MapCanvas of the chosen map's
      robot rosbridge.
- [ ] Click on the embedded canvas → x and y fields snap to the clicked world
      coords; pin appears at the click position. {Able to get location, but not rotation. Also unable to input negative coordinate number. The same for manual dispatch}
      > **FIXED (G38, 2026-05-22) — pending re-test.** Resolved in the
      > same patch as G36 via the new `NumberField` component — see the
      > G36 note above. The "no rotation on click" behaviour is **by
      > design** (canvas click only sets x/y; θ stays editable separately
      > in its own input).
- [x] Save → toast; new row in grid.
- [x] Edit an existing location → ID field disabled; map / label / x / y / θ
      editable; clicking on canvas re-positions the pin.
- [ ] Delete a location not referenced by any order → succeeds. {Same problem with the previous triple dot problem}
      > **FIXED (G35, 2026-05-22) — pending re-test.** Same IconButton
      > swap as on Maps — see note above.
- [ ] Switch the form's map dropdown → the embedded canvas re-subscribes to that
      map's rosbridge (you may see a momentary "Waiting…" then the new grid). {unable to emulate, since it reads directly from current rosbridge connection. It still shows the current map}
      > **Verdict: expected behavior, not a bug — rewrite this item.**
      > The current architecture binds rosbridge URLs to **robots**, not
      > maps (see `robots.rosbridge_url`). The canvas subscribes to the
      > rosbridge of whichever robot owns the picked map. So switching the
      > map dropdown doesn't change rosbridge — there's nothing to
      > re-subscribe to.
      >
      > This check should either be **deleted** or **rewritten** to: "Switch
      > the form's map dropdown → the canvas re-renders using the same
      > rosbridge but expects `/reference/map` for the new map. Without a
      > robot publishing that map, the canvas shows 'Waiting…'." Mark
      > N/A for now.

### Admin — Robots  `[auto: e2e]`
- [x] `/admin/robots` lists current robots.
- [x] **+ Add** → drawer; serial `amr002`, URL `ws://localhost:9091`, pick a map.
      Save → toast "Robot created — restart the ROS Bridge to pick it up".
- [x] `GET /fleet` now lists `amr002` (registry auto-reloaded).
- [x] Edit `amr002` → ID field disabled; change URL; Save → toast.
- [x] Delete `amr002` (no telemetry yet) → succeeds.
- [x] Try to delete `amr001` (has telemetry) → red toast with 409; row stays.
- [ ] **[robot]** After adding a robot, the new tile appears on Dashboard;
      MQTT topics for that serial start being subscribed to. {The additional tile is there, but not sure how to see the mqtt topics. since there's no robot to connect to even from sim}
      > **How to see the MQTT subscriptions** (no robot needed):
      > 1. Open `http://localhost:5173/` → F12 → **Network** tab →
      >    **WS** filter → click the `:9001/mqtt` row → **Messages**
      >    sub-tab.
      > 2. Add the new robot in Admin → Robots (e.g. `amr002`).
      > 3. Refresh the Dashboard; watch the WS Messages pane. You'll see
      >    new SUBSCRIBE frames go out for topics like
      >    `amr/v2/moverobotic/amr002/state` and
      >    `amr/v2/moverobotic/amr002/connection`.
      > 4. The new tile appears on Dashboard with all fields showing `—`
      >    (no messages because no robot is publishing). That's the
      >    "subscribed but no data yet" state — exactly what this check
      >    verifies.
      > **Optional confirmation via broker:** `mosquitto_sub -h localhost
      > -t '$SYS/broker/clients/connected'` shows the broker's client
      > count tick up by one when the React app subscribes.

### Admin — Fleet Config  `[auto: e2e]` (render + save no-op)
- [x] `/admin/fleet` form pre-populated from current `/fleet`.
- [x] Save unchanged → toast "Fleet config updated — registry reloaded".
- [x] Change `version` to `2.0.1` → save → toast; refresh page → new value sticks.
- [x] **Warning banner** reads correctly with the current `interface_name`,
      `major_version`, `manufacturer` interpolated in the example topic.
- [x] Restore original values when done.

---

## Phase 13 — End-to-end smoke

A scripted "everything works together" run.

- [x] Start the full stack (`docker compose up --build` or the manual route).
- [x] React app loads at `http://localhost:5173/`. All four pills green within 10 s.
- [x] **[robot]** Robot is publishing; Dashboard tile shows ONLINE + battery. {No battery topic to sub to, battery is -}
- [ ] **[robot]** Open Robot Detail; map + arrow + pins render. {/dashboard and /robots is showing the same page? /robot/serial is working as usual}
      > **Clarification — "Robot Detail" = `/robots/{serial}`, NOT
      > `/robots`.** That's why `/dashboard` (which is `/`) and `/robots`
      > look similar — both are fleet-wide tile views. Robot Detail is
      > the per-robot screen at `/robots/amr001` with the live MapCanvas
      > on the left and the State/Errors/Actions side panel on the right.
      > Steps: from Dashboard (`/`) click any tile → URL changes to
      > `/robots/<serial>` → confirm map + arrow + named-location pins
      > all render.
- [x] **[robot]** Dispatch → send a named-location order → ActiveOrderPanel
      shows the orderId. Robot moves.
- [ ] **[robot]** On the same page, errors panel stays empty during a clean run. {same page as in dispatch? No error panel in sight}
      > **Clarification — "same page" refers back to Robot Detail, not
      > Dispatch.** The errors panel lives in the Robot Detail right-side
      > tabs (`State` / **`Errors`** / `Actions`). Dispatch only has the
      > order builder + ActiveOrderPanel — no errors tab there. Steps:
      > navigate to `/robots/amr001` → click the **Errors** tab → during
      > a clean run it reads "No errors reported." If a `navigationFailed`
      > (G17) appears mid-order, the tab's badge counter ticks up and the
      > error shows level, type, description.
- [x] **[robot]** Once order completes, an OEE cycle appears at `/oee` and the
      order shows up at `/orders` (refresh).
- [x] **[robot]** Open Teleop in another tab → ENGAGED → drive briefly → release →
      robot stops.
- [x] Add a map + location in Admin → it appears in Dispatch's named-location
      list within a few seconds (React Query staleTime 30 s, or hit Refresh).
- [x] Stop FastAPI → pills flag the outage; existing MQTT live data (Dashboard
      tiles) keeps updating (independent channel). {API red, MQTT green, DB and ROS grey}
- [x] Restart FastAPI → no manual refresh needed; pills return to green.

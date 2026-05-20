# Manual Test Checklist

A step-by-step manual verification of the AMR Integration System — happy paths,
the G15–G21 gap fixes, and extreme / failure cases.

> Conventions
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

- [ ] PostgreSQL running; `amr_integration` DB created and `schema.sql` applied.
- [ ] `fastapi-service/.env` and `ros-bridge-service/.env` exist.
- [ ] `fastapi-service/venv` has `requirements.txt` installed.
- [ ] `ros-bridge-service` has `npm install` done.
- [ ] Mosquitto and Node-RED are on `PATH`.

---

## Phase 1 — Startup & health

- [ ] Run `.\start-all.ps1` — four windows open (Mosquitto, FastAPI, ROS Bridge, Node-RED).
- [ ] FastAPI window: no traceback; `Uvicorn running on http://...:8000`.
- [ ] Open <http://localhost:8000/docs> — Swagger lists robots / fleet / maps /
      locations / oee / system / ingest routes.
- [ ] `curl.exe -s http://localhost:8000/system/status` → `mosquitto` and
      `database` both report `connected`.
- [ ] Node-RED window: `Connected to broker`, `Started flows`, **no `ENOTFOUND`**.
- [ ] Open <http://localhost:1880> — MQTT nodes show "connected".
- [ ] **[robot]** ROS Bridge window logs a rosbridge connection per robot.

---

## Phase 2 — Reference-data CRUD (G15)

### Maps
- [ ] `GET /maps` → lists `map-001`, `map-002`.
- [ ] `POST /maps` body `{"map_id":"map-003","label":"Test Map"}` → **201**.
- [ ] `GET /maps/map-003` → returns the new map.
- [ ] `PUT /maps/map-003` body `{"label":"Renamed"}` → 200, label updated.
- [ ] `DELETE /maps/map-003` → 200 `{"status":"ok","deleted":"map-003"}`.

### Named locations
- [ ] `GET /locations` → lists the 4 seeded locations.
- [ ] `POST /locations` body `{"id":99,"map_id":"map-001","label":"Dock","x":1,"y":2}`
      → **201**, `theta` defaults to `0.0`.
- [ ] `PUT /locations/99` → 200, fields updated.
- [ ] `DELETE /locations/99` → 200.

### Robots
- [ ] `GET /robots/amr001` → returns the robot row.
- [ ] `POST /robots` body `{"serial_number":"amr002","rosbridge_url":"ws://localhost:9091","map_id":"map-001"}`
      → **201**.
- [ ] `GET /robots` → now lists `amr002` too (registry reloaded — **no restart needed**).
- [ ] `PUT /robots/amr002` → 200.
- [ ] `DELETE /robots/amr002` → 200; `GET /robots` no longer lists it.

### Fleet config
- [ ] `GET /fleet` → current identity.
- [ ] `PUT /fleet` body `{"interface_name":"amr","major_version":"v2","version":"2.0.0","manufacturer":"moverobotic"}`
      → 200.

---

## Phase 3 — Orders & instant actions

- [ ] `POST /robots/amr001/order` body `{"nodes":[{"x":1.0,"y":0.5,"theta":0.0}]}`
      → 200 `{"status":"ok","orderId":"amr001-order-N","nodeCount":1}`.
- [ ] `POST /robots/amr001/order/named` body `{"location_ids":[1,2]}` → 200, nodeCount 2.
- [ ] `POST /robots/amr001/instant-actions` body `{"action_type":"cancelOrder"}`
      → 200 with an `actionId`.
- [ ] In Node-RED **Test Harness** tab, click "order: single goal" — the order is
      published; the "Command Audit" tab debug shows `order logged`.
- [ ] **[robot]** ROS Bridge logs `Order accepted` → `Node goal sent`; the robot moves.
- [ ] **[robot]** A 2-node order auto-advances to the second node on `SUCCEEDED`.

---

## Phase 4 — Telemetry ingestion pipeline

Without a robot, fake a `state` message. Escaping JSON inline in PowerShell is
fragile — put the payload in a file and publish with `-f`:

```powershell
# save as state.json
'{"headerId":1,"timestamp":"2026-05-18T12:00:00Z","serialNumber":"amr001","orderId":"","orderUpdateId":0,"lastNodeId":"","lastNodeSequenceId":0,"nodeStates":[],"edgeStates":[],"actionStates":[],"agvPosition":{"x":1.0,"y":2.0,"theta":0,"mapId":"map-001","positionInitialized":true},"velocity":{"vx":0,"vy":0,"omega":0},"driving":false,"operatingMode":"AUTOMATIC","errors":[],"safetyState":{"eStop":"NONE","fieldViolation":false}}' | Out-File -Encoding ascii state.json

mosquitto_pub -h localhost -t "amr/v2/moverobotic/amr001/state" -f state.json
```

- [ ] Node-RED "Telemetry Ingestion" tab — `validateState` shows green status; the
      `state persisted` debug shows `{"status":"ok"}`.
- [ ] `psql ... -c "SELECT count(*) FROM state_snapshots;"` → count increased.
- [ ] Publish a `connection` message: save
      `{"headerId":1,"timestamp":"2026-05-18T12:00:00Z","serialNumber":"amr001","connectionState":"ONLINE"}`
      to `conn.json`, then `mosquitto_pub -h localhost -t "amr/v2/moverobotic/amr001/connection" -f conn.json`
      → `connection_log` row added.
- [ ] **[robot]** With a real robot, the same rows appear automatically from the
      ROS Bridge's published `state`/`connection`.

---

## Phase 5 — State & OEE reads

- [ ] `GET /robots/amr001/state` → latest snapshot with `node_states`,
      `action_states`, `errors` arrays.
- [ ] `GET /robots/amr001/oee/summary` → totals (0 cycles until an order completes).
- [ ] `GET /robots/amr001/oee/cycles` → `{"cycles":[...]}`.
- [ ] `GET /robots/amr001/oee/availability` → `driving_samples` / `total_samples`.

---

## Phase 6 — Gap fixes G16–G21

### G20 — ingest validation (422, not 500)
- [ ] `POST /ingest/state` body `{"timestamp":"t"}` (no `serialNumber`)
      → **422**, response names `serialNumber`. (Was a 500 before.)
- [ ] `POST /ingest/connection` body with `connectionState":"BOGUS"` → **422**.
- [ ] `POST /ingest/state` with a full valid body → **200**.

### G17 — navigation failure visible **[robot]**
- [ ] Force a nav failure (send the robot an unreachable goal, or e-stop mid-order).
- [ ] `GET /robots/amr001/state` → `errors` contains an entry with
      `error_type: "navigationFailed"`, `error_level: "WARNING"`.
- [ ] Send a reachable goal that succeeds → the `navigationFailed` error clears.

### G21 — counters survive a restart
- [ ] `POST /robots/amr001/order` twice — note the suffixes (`-order-0`, `-order-1`).
- [ ] Confirm both orders reached the `orders` table (Command Audit tab / `psql`).
- [ ] Stop and restart **only** FastAPI.
- [ ] `POST /robots/amr001/order` again → orderId is `-order-2` (**not** `-order-0`).
- [ ] `psql ... -c "SELECT order_id, header_id FROM orders ORDER BY id;"` →
      `header_id` is non-decreasing across the restart.

### G16 — connection pooling
- [ ] Fire ~30 quick reads: `for ($i=0;$i -lt 30;$i++){ curl.exe -s http://localhost:8000/robots/amr001/state > $null }` — all succeed, no slowdown.
- [ ] `psql ... -c "SELECT count(*) FROM pg_stat_activity WHERE datname='amr_integration';"`
      → connection count stays at/below `DB_POOL_MAX` (default 10), not one-per-request.

### G19 — telemetry retention
- [ ] Insert an old row:
      `psql ... -c "INSERT INTO state_snapshots (serial_number,ts,header_id) VALUES ('amr001', now() - interval '90 days', 999);"`
- [ ] Stop FastAPI; restart it with `TELEMETRY_RETENTION_DAYS=30` set.
- [ ] The startup prune runs immediately — FastAPI log shows `telemetry pruned`.
- [ ] `psql ... -c "SELECT count(*) FROM state_snapshots WHERE header_id=999;"` → `0`.
- [ ] Recent rows are untouched.
- [ ] With `TELEMETRY_RETENTION_DAYS=0` the log shows no retention task started.

---

## Phase 7 — Auth & rate limiting (G10 / G11)

Set `API_KEY=test-key` and `RATE_LIMIT_PER_MINUTE=5` in `fastapi-service/.env`,
restart FastAPI.

- [ ] `GET /robots` with no header → **401**.
- [ ] `GET /robots` with `-H "X-API-Key: wrong"` → **401**.
- [ ] `GET /robots` with `-H "X-API-Key: test-key"` → 200.
- [ ] `POST /ingest/state` with no header → still works (ingest is unguarded).
- [ ] Fire 7 requests quickly → the 6th/7th return **429** with a `Retry-After` header.
- [ ] **[robot]** ROS Bridge can still `GET /fleet` — it needs `API_KEY=test-key`
      in `ros-bridge-service/.env` to match.
- [ ] Reset both env vars afterwards.

---

## Phase 8 — Extreme / failure cases

### Bad input
- [ ] `POST /robots/amr001/order` body `{"nodes":[]}` → **422** (empty order).
- [ ] `POST /robots/amr001/order` body `{"nodes":[{"x":1}]}` → **422** (`y` missing).
- [ ] `POST /robots/UNKNOWN/order` → **404** (robot not registered).
- [ ] `POST /robots/amr001/order/named` body `{"location_ids":[9999]}` → **404**.
- [ ] `POST /robots/amr001/instant-actions` body `{"action_type":"fly"}` → **422**.

### CRUD conflicts (G15 — no cascade)
- [ ] `POST /maps` with an existing `map_id` → **409** (duplicate).
- [ ] `DELETE /maps/map-001` while a robot/location references it → **409**;
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

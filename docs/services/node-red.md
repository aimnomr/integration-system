# Service Reference: Node-RED

Node-RED is the **telemetry sink**: it ingests the VDA5050 `state` / `connection`
topics, audits commands, derives OEE, and persists everything to PostgreSQL via the
FastAPI `/ingest/*` API. It is **no longer in the command path** — FastAPI publishes
`order` / `instantActions` directly.

The flow lives in `node-red/flows.json`, organised into **5 tabs**. Run it with
`node-red --settings settings.js --userDir .` (UI at `http://localhost:1880`). All
MQTT nodes use the shared `Local MQTT` broker config (`localhost:1883`); all topic
subscriptions use `+` wildcards so they capture every robot.

> **Persistence design:** the runtime telemetry tabs (1–3) write by POSTing to
> FastAPI `/ingest/*` (core `http request` node) rather than holding their own
> PostgreSQL connection — this keeps the SQL in one place (`fastapi-service/app/db.py`).
> The **DB Admin** tab is the one exception: it uses the `node-red-contrib-postgresql`
> palette node to talk to Postgres directly for schema reset and ad-hoc admin SQL,
> bypassing FastAPI entirely. See migration plan §8a.

---

## Tab 1 — Telemetry Ingestion

```
amr/v2/+/+/state       → validateState      → POST /ingest/state       → debug
amr/v2/+/+/connection  → validateConnection → POST /ingest/connection  → debug
```

Validates each VDA5050 `state` / `connection` message, shows live status, and POSTs
it to FastAPI for persistence (`state_snapshots`, `connection_log`).

## Tab 2 — Command Audit

```
amr/v2/+/+/order           → tagOrder          → POST /ingest/command → debug
amr/v2/+/+/instantActions  → tagInstantActions → POST /ingest/command → debug
```

A **passive tap** on the command topics — it observes a copy of every `order` /
`instantActions` message and logs it to `order_log`. Because MQTT is pub/sub, this
sits *parallel* to the command path and cannot block or delay delivery to the robot.

## Tab 3 — OEE

```
amr/v2/+/+/state → deriveCycle → POST /ingest/oee-cycle → debug
```

`deriveCycle` tracks per-robot order state in flow context. It emits one trip cycle
when an active order's `nodeStates` empties (`SUCCEEDED`) or its `orderId` clears
mid-order (`ABORTED`), and POSTs it to `oee_cycles`.

## Tab 4 — Test Harness

Manual VDA5050 injectors for `amr001`, plus outbound debug:

- inject `order` (single goal) / `order` (2-node sequence) → `amr/v2/moverobotic/amr001/order`
- inject `instantActions` (cancel / retry / skip) → `amr/v2/moverobotic/amr001/instantActions`
- `amr/v2/+/+/state` and `amr/v2/+/+/connection` → debug

Lets you exercise the robot directly, skipping FastAPI.

## Tab 5 — DB Admin

```
Reset DB         → file in (schema.sql)        → postgresql node → debug
Run custom SQL   → (inject payload as msg.payload) → postgresql node → debug
```

Two utility flows that talk straight to PostgreSQL via the shared `db-pg-config`
config node (host=localhost, port=5432, db=amr_integration, user=postgres,
password=admin — matching `docker-compose.yml`):

- **Reset DB** — reads `docs/schema/schema.sql` from disk and executes it in one
  call. This drops + recreates all 15 tables and reseeds `fleet_config`, `maps`,
  `robots`, and `named_locations` — i.e. brings the database back to its
  pre-runtime default. Stop FastAPI and the ROS Bridge first; both will crash if
  they query while tables are dropped.
- **Run custom SQL** — the inject node's payload is preloaded with commented
  examples (add a named location, add a second robot, add a map, wipe telemetry
  only). Double-click the inject node, replace the payload with whatever SQL you
  want, and hit the button. Multi-statement payloads are supported; only the
  result of the last statement comes back in the debug pane.

> **Requires** the `node-red-contrib-postgresql` palette package (declared in
> `node-red/package.json`). Run `npm install` in the `node-red/` folder, or install
> via *Manage palette → Install* in the Node-RED UI.

---

## Notes

- The `/ingest/*` calls target `http://localhost:8000` — edit the `http request` node
  URLs if FastAPI runs elsewhere.
- If FastAPI or PostgreSQL is down the `http request` nodes error quietly
  (`senderr: false`); telemetry is simply not persisted — nothing else is affected.
- The legacy Command Router, State/Health/OEE handler tabs, the orphaned
  `handleBattery` tab, and the Library Init tab have all been removed.

# Service Reference: Node-RED

Node-RED is a **passive viewer / dev tool**. It subscribes the VDA5050 `state` /
`connection` / `order` / `instantActions` topics to **display them live** (node
status + debug sidebar) for observation and debugging — it **no longer writes to
the database**. Telemetry persistence (state, connection, command audit, OEE
derivation) moved into FastAPI's own MQTT subscriber on 2026-06-09
(`fastapi-service/app/mqtt.py` → `app/ingest_service.py`), so **the stack fully
functions whether Node-RED is running or not**. It was already out of the command
path — FastAPI publishes `order` / `instantActions` directly.

The flow lives in `node-red/flows.json`, organised into **5 tabs**. Run it with
`node-red --settings settings.js --userDir .` (UI at `http://localhost:1880`). All
MQTT nodes use the shared `Local MQTT` broker config (`localhost:1883`); all topic
subscriptions use `+` wildcards so they capture every robot.

> **No DB writes from the runtime tabs (1–3).** They subscribe, validate/derive for
> the live status display, and end at a debug node — the former `http request`
> POST-to-`/ingest/*` nodes were removed. The `deriveCycle` node still computes OEE
> cycles for display, but nothing is persisted from here.
>
> **The DB Admin tab is the one exception:** it uses the `node-red-contrib-postgresql`
> palette node to talk to Postgres directly for schema reset and ad-hoc admin SQL,
> bypassing FastAPI entirely. See migration plan §8a.

---

> **Tabs 1–3 are view-only.** They end at a debug node, not an HTTP POST — FastAPI
> persists these same topics over MQTT (see `app/ingest_service.py`). The `validate*`
> / `tag*` / `deriveCycle` function nodes are kept only for the live status display.

## Tab 1 — Telemetry (view-only)

```
amr/v2/+/+/state       → validateState      → debug   (state seen)
amr/v2/+/+/connection  → validateConnection → debug   (connection seen)
```

Validates each VDA5050 `state` / `connection` message and shows live status. **No DB
write** — FastAPI persists `state_snapshots` / `connection_log` from its own MQTT
subscriber.

## Tab 2 — Command Audit (view-only)

```
amr/v2/+/+/order           → tagOrder          → debug   (order seen)
amr/v2/+/+/instantActions  → tagInstantActions → debug   (instantActions seen)
```

A **passive tap** on the command topics — observes a copy of every `order` /
`instantActions` message for live display. Because MQTT is pub/sub, this sits
*parallel* to the command path and cannot block delivery. The command audit log
(`orders` / `instant_action_messages`) is now written by FastAPI's MQTT subscriber.

## Tab 3 — OEE (view-only)

```
amr/v2/+/+/state → deriveCycle → debug   (cycle derived)
```

`deriveCycle` tracks per-robot order state in flow context and emits one trip cycle
when an active order's `nodeStates` empties (`SUCCEEDED`) or its `orderId` clears
mid-order (`ABORTED`) — for display only. The authoritative copy of this logic is
ported to Python in `fastapi-service/app/ingest_service.py`, which persists
`oee_cycles`.

## Tab 4 — Test Harness

Manual VDA5050 injectors for `amr001`, plus outbound debug:

- inject `order` (single goal) / `order` (2-node sequence) → `amr/v2/moverobotic/amr001/order`
- inject `instantActions` (cancel / retry / skip) → `amr/v2/moverobotic/amr001/instantActions`
- `amr/v2/+/+/state` and `amr/v2/+/+/connection` → debug

Lets you exercise the robot directly, skipping FastAPI.

## Tab 5 — DB Admin

```
Reset DB (A)     → Reset Schema (DDL)         → Setup Tables (seed) → debug
Reset DB (B)     → Apply full schema (DDL+seed)                     → debug
Row Counts       → SELECT counts UNION ALL …                        → debug
View <table>     → SELECT * FROM <table> ORDER BY … LIMIT 20         → debug
Run custom SQL   → (inject payload as msg.payload) → postgresql node → debug
```

Three utility flows that talk straight to PostgreSQL via the shared
`db-pg-config` config node (host=localhost, port=5432, db=amr_integration,
user=postgres, password=admin — matching `docker-compose.yml`):

- **Reset DB (Pipeline A)** — two `postgresql` nodes wired in sequence. The
  first holds all `DROP` + `CREATE TABLE` + `CREATE INDEX` statements inline
  in its `query` field; the second holds the `INSERT` seed rows. No filesystem
  dependency. Use this if the driver dislikes mixing DDL and DML in one batch.
- **Reset DB (Pipeline B)** — single `postgresql` node with the full schema
  (DDL + seed) baked into its `query` field. Same end state as Pipeline A;
  use this to compare behaviour against A. (Both pipelines exist side-by-side
  so you can verify which the driver handles correctly — once you settle on
  one, delete the other.)
- Both pipelines drop + recreate all 15 tables and reseed `fleet_config`,
  `maps`, `robots`, `named_locations`. **Stop FastAPI and the ROS Bridge
  first**; both will crash if they query while tables are dropped.
- **The inline SQL in these nodes is a hand-maintained copy of
  `docs/schema/schema.sql`.** If you change the schema there, update the two
  nodes' `query` fields (Pipeline A's "Reset Schema" + "Setup Tables", or
  Pipeline B's "Apply full schema") to keep them in sync.
- **Row Counts** — fires one SQL statement that `UNION ALL`s `COUNT(*)` across
  all 15 tables. Useful for a quick "did anything update?" check after dispatching
  an order or driving the robot. Result lands in the debug pane as a single
  payload of 15 `{tbl, rows}` rows.
- **View &lt;table&gt;** — one inject button per live table (11 buttons:
  `orders`, `order_nodes`, `order_edges`, `instant_action_messages`,
  `instant_actions`, `state_snapshots`, `state_node_states`,
  `state_action_states`, `state_errors`, `connection_log`, `oee_cycles`).
  Each runs `SELECT * FROM <table> ORDER BY ts DESC LIMIT 20` (or by `id` for
  tables without `ts`). The reference tables (`fleet_config`, `maps`,
  `robots`, `named_locations`) are intentionally omitted — they almost never
  change at runtime; use the `Run custom SQL` flow if you need to inspect
  them.
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

- Tabs 1–3 no longer make HTTP calls — they are MQTT-in → function → debug only.
  Persistence is FastAPI's job now (`app/mqtt.py` + `app/ingest_service.py`), so
  whether Node-RED is up, down, or disconnected from FastAPI has **no effect on what
  gets recorded**.
- The legacy Command Router, State/Health/OEE handler tabs, the orphaned
  `handleBattery` tab, and the Library Init tab have all been removed.

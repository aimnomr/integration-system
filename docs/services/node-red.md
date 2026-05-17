# Service Reference: Node-RED

Node-RED is the **telemetry sink**: it ingests the VDA5050 `state` / `connection`
topics, audits commands, derives OEE, and persists everything to PostgreSQL via the
FastAPI `/ingest/*` API. It is **no longer in the command path** — FastAPI publishes
`order` / `instantActions` directly.

The flow lives in `node-red/flows.json`, organised into **4 tabs**. Run it with
`node-red --settings settings.js --userDir .` (UI at `http://localhost:1880`). All
MQTT nodes use the shared `Local MQTT` broker config (`localhost:1883`); all topic
subscriptions use `+` wildcards so they capture every robot.

> **Persistence design:** Node-RED writes by POSTing to FastAPI `/ingest/*` (core
> `http request` node) rather than holding its own PostgreSQL connection. No
> PostgreSQL Node-RED contrib node is installed; this keeps the SQL in one place
> (`fastapi-service/app/db.py`). See migration plan §8a.

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

---

## Notes

- The `/ingest/*` calls target `http://localhost:8000` — edit the `http request` node
  URLs if FastAPI runs elsewhere.
- If FastAPI or PostgreSQL is down the `http request` nodes error quietly
  (`senderr: false`); telemetry is simply not persisted — nothing else is affected.
- The legacy Command Router, State/Health/OEE handler tabs, the orphaned
  `handleBattery` tab, and the Library Init tab have all been removed.

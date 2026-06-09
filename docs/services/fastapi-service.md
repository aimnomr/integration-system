# Service Reference: fastapi-service

> As-built reference for the current implementation (VDA5050 FMS gateway).

FastAPI is the **FMS gateway**: it builds and publishes VDA5050 `order` /
`instantActions`, serves PostgreSQL-backed state/OEE, and **ingests telemetry by
subscribing the VDA5050 topics over MQTT** (state / connection / order /
instantActions) and persisting them to PostgreSQL. This ingestion used to be
Node-RED's job (it POSTed to `/ingest/*`); as of 2026-06-09 FastAPI's own MQTT
client does it, so Node-RED is an optional passive viewer.

## Structure

```
fastapi-service/
├── main.py                   # app creation + router registration
├── requirements.txt          # fastapi, uvicorn, paho-mqtt, python-dotenv,
│                             #   pydantic, psycopg2-binary
└── app/
    ├── __init__.py
    ├── robots.py             # RobotRegistry — loads the fleet from the DB + counters
    ├── vda5050.py            # build_order(), build_instant_actions(), topic_for()
    ├── mqtt.py               # MQTT client: publish_order / publish_instant_actions
    │                         #   + subscribes & ingests the 4 telemetry topics
    ├── ingest_service.py     # shared persistence (state/connection/command/OEE)
    │                         #   — called by mqtt.py AND routers/ingest.py
    ├── db.py                 # PostgreSQL access (lazy psycopg2) — reads + writes
    ├── config.py             # startup env-var validation (validate_env)
    ├── schemas.py            # Pydantic request models
    ├── logging_config.py     # JSON-line logging
    └── routers/
        ├── __init__.py
        ├── robots.py         # /robots/* — FMS gateway routes
        ├── fleet.py          # /fleet — fleet definition (read by the ROS Bridge)
        ├── system.py         # /system/status
        ├── oee.py            # /robots/{serial}/oee/*
        └── ingest.py         # /ingest/* — HTTP ingest (secondary; tests/manual)
```

## Module Responsibilities

### `main.py`
`load_dotenv()` first, then `validate_env()`, then creates the app and mounts the five
routers.

### `app/robots.py` — `RobotRegistry`
Loads the fleet from the **database** (`fleet_config` + `robots` tables) at startup —
the DB is the single source of truth. If the DB is unavailable the service cannot
start. Exposes the fleet list, a `fleet()` view for `GET /fleet`, and the per-robot
monotonic counters — `headerId` (per topic) and `orderId`.

### `app/vda5050.py`
`build_order()` (positions → a VDA5050 order with auto-generated edges),
`build_instant_actions()`, `topic_for()`, and the shared-header builder.

### `app/mqtt.py`
The MQTT client (`loop_start`). Publishes — `publish_order(serial, order)` and
`publish_instant_actions(serial, message)` → `amr/v2/moverobotic/{serial}/...`.
**Subscribes & ingests** — the four telemetry topics (`state`, `connection`,
`order`, `instantActions`); `_on_message` dispatches each to `app/ingest_service.py`.
DB / archive errors are swallowed on this thread so one bad message can't kill the
loop (telemetry is best-effort). Also keeps `_connection_states` current for
`/system/status`.

### `app/ingest_service.py`
The single persistence layer shared by the MQTT subscriber and the HTTP `/ingest/*`
routes: `persist_state` / `persist_connection` / `persist_command` /
`persist_oee_cycle`, plus the OEE `deriveCycle` state machine ported from Node-RED.
Refuses archived serials (`ArchivedRobot`). The SQL itself stays in `app/db.py`.

### `app/db.py`
PostgreSQL access. `psycopg2` is imported **lazily**; queries raise
`DatabaseUnavailable` → HTTP 503 when the DB is down. Provides write helpers
(`insert_state`/`insert_connection`/`insert_command`/`insert_oee_cycle`) and read
helpers (`fetch_fleet_config`, `fetch_robots`, `fetch_named_locations`,
`fetch_latest_state`, `fetch_oee_*`, `ping`). Note: `RobotRegistry` reads the fleet
through this module at startup, so a live DB is required for the service to boot.

### `app/schemas.py`
`Node`, `OrderRequest`, `NamedOrderRequest`, `InstantActionRequest`.

### `app/routers/robots.py`
`/robots`, `/robots/{serial}/order`, `/order/named`, `/instant-actions`, `/state`.

### `app/routers/fleet.py`
`GET /fleet` — the full fleet definition (`interfaceName`, `majorVersion`, `version`,
`manufacturer`, `robots[]`). The ROS Bridge Service fetches it at startup.

### `app/routers/system.py`
`/system/status` — MQTT + database connectivity. (The legacy `/system/connect|
disconnect` endpoints were removed — the rosbridge URL is fixed config.)

### `app/routers/oee.py`
`/robots/{serial}/oee/summary|cycles|availability` — PostgreSQL-backed.

### `app/routers/ingest.py`
`/ingest/state|connection|command|oee-cycle` — a **secondary** HTTP path (manual
injection, the Node-RED Test Harness, the Newman smoke suite). The live ingest path
is the MQTT subscriber above; both delegate to `app/ingest_service.py`. Maps
`ArchivedRobot` → 410 and `DatabaseUnavailable` → 503.

## Dependency Graph (no cycles)

```
main.py
  └── app/routers/
        ├── robots.py  ← robots, vda5050, mqtt, db, schemas
        ├── fleet.py   ← robots
        ├── system.py  ← mqtt, db
        ├── oee.py     ← db, robots
        └── ingest.py  ← db
  (vda5050 ← robots ; mqtt ← vda5050, robots ; robots ← db)
```

## Notes

- `/order/named` resolves location IDs from the `named_locations` table via
  `db.fetch_named_locations()`. The table stores `theta` in radians (map frame), so it
  is used directly — no conversion.
- `app/config.py` runs `validate_env()` from `main.py` at startup, failing fast if a
  required env var (`MQTT_BROKER`, `MQTT_PORT`) is missing or invalid.

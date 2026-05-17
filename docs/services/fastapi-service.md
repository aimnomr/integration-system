# Service Reference: fastapi-service

> As-built reference for the current implementation (VDA5050 FMS gateway).

FastAPI is the **FMS gateway**: it builds and publishes VDA5050 `order` /
`instantActions`, serves PostgreSQL-backed state/OEE, and accepts telemetry ingestion
from Node-RED.

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
    ├── mqtt.py               # MQTT client + publish_order / publish_instant_actions
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
        └── ingest.py         # /ingest/* — telemetry ingestion from Node-RED
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
The MQTT client (`loop_start`) plus `publish_order(serial, order)` and
`publish_instant_actions(serial, message)` → `amr/v2/moverobotic/{serial}/...`.

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
`/ingest/state|connection|command|oee-cycle` — Node-RED POSTs VDA5050 telemetry here;
the router delegates to `app/db.py`.

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

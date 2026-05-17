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
    ├── robots.py             # RobotRegistry — loads robots.config.json + counters
    ├── vda5050.py            # build_order(), build_instant_actions(), topic_for()
    ├── mqtt.py               # MQTT client + publish_order / publish_instant_actions
    ├── db.py                 # PostgreSQL access (lazy psycopg2) — reads + writes
    ├── data.py               # NAMED_LOCATIONS
    ├── schemas.py            # Pydantic request models
    ├── logging_config.py     # JSON-line logging
    └── routers/
        ├── __init__.py
        ├── robots.py         # /robots/* — FMS gateway routes
        ├── system.py         # /system/status
        ├── oee.py            # /robots/{serial}/oee/*
        └── ingest.py         # /ingest/* — telemetry ingestion from Node-RED
```

## Module Responsibilities

### `main.py`
`load_dotenv()` first (before `app.mqtt` imports, which read env vars at module
level), then creates the app and mounts the four routers.

### `app/robots.py` — `RobotRegistry`
Loads `ros-bridge-service/robots.config.json` (path overridable via `ROBOTS_CONFIG`).
Exposes the fleet list and holds the per-robot monotonic counters — `headerId` (per
topic) and `orderId`.

### `app/vda5050.py`
`build_order()` (positions → a VDA5050 order with auto-generated edges),
`build_instant_actions()`, `topic_for()`, and the shared-header builder.

### `app/mqtt.py`
The MQTT client (`loop_start`) plus `publish_order(serial, order)` and
`publish_instant_actions(serial, message)` → `amr/v2/moverobotic/{serial}/...`.

### `app/db.py`
PostgreSQL access. `psycopg2` is imported **lazily** — the service boots without the
driver or a live DB; queries then raise `DatabaseUnavailable` → HTTP 503. Provides
write helpers (`insert_state`/`insert_connection`/`insert_command`/`insert_oee_cycle`)
and read helpers (`fetch_latest_state`, `fetch_oee_*`, `ping`).

### `app/schemas.py`
`Node`, `OrderRequest`, `NamedOrderRequest`, `InstantActionRequest`.

### `app/routers/robots.py`
`/robots`, `/robots/{serial}/order`, `/order/named`, `/instant-actions`, `/state`.

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
        ├── robots.py  ← robots, vda5050, mqtt, db, schemas, data
        ├── system.py  ← mqtt, db
        ├── oee.py     ← db, robots
        └── ingest.py  ← db
  (vda5050 ← robots ; mqtt ← vda5050)
```

## Notes

- `app/data.py` still holds `NAMED_LOCATIONS` hardcoded — sourcing it from the
  `named_locations` table is open gap **G8**.
- Named-location headings are stored in degrees; `/order/named` converts them to
  radians (`math.radians`) for the VDA5050 `theta`.

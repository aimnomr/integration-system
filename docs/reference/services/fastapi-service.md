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
    ├── auth.py               # require_api_key dependency (G10 — X-API-Key gate)
    ├── ratelimit.py          # per-IP sliding-window rate limiter (G11)
    ├── config.py             # startup env-var validation (validate_env)
    ├── schemas.py            # Pydantic request models
    ├── logging_config.py     # JSON-line logging
    └── routers/
        ├── __init__.py
        ├── robots.py         # /robots/* — FMS gateway + robot CRUD/archive
        ├── fleet.py          # /fleet — fleet definition (read by the ROS Bridge)
        ├── system.py         # /system/status
        ├── oee.py            # /robots/{serial}/oee/*
        ├── orders.py         # /orders, /orders/{order_id} — order history
        ├── maps.py           # /maps — reference-data CRUD (G15)
        ├── locations.py      # /locations — reference-data CRUD (G15)
        └── ingest.py         # /ingest/* — HTTP ingest (secondary; tests/manual)
```

## Module Responsibilities

### `main.py`
`load_dotenv()` first, then `validate_env()`, then creates the app and mounts the
**eight** routers. Wires the cross-cutting middleware: `CORSMiddleware` (origins from
`CORS_ORIGINS`) and the `rate_limit_middleware`. Every client-facing router is mounted
with `dependencies=[Depends(require_api_key)]`; only `ingest.router` is left open (the
internal telemetry boundary).

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
`DatabaseUnavailable` → HTTP 503 when the DB is down, and `IntegrityConflict` → HTTP
409 on a constraint clash. Provides telemetry writes
(`insert_state`/`insert_connection`/`insert_command`/`insert_oee_cycle`), read helpers
(`fetch_fleet_config`, `fetch_robots`, `fetch_named_locations`, `fetch_latest_state`,
`fetch_oee_*`, `fetch_orders`/`fetch_order`, `ping`), and the reference-data CRUD +
archive helpers (`insert_/update_/delete_map`, `..._robot`, `..._named_location`,
`archive_robot`/`restore_robot`, `update_fleet_config`). Note: `RobotRegistry` reads
the fleet through this module at startup, so a live DB is required for the service to
boot.

### `app/auth.py`
`require_api_key` — the FastAPI dependency behind the **G10** API-key gate. A no-op
when `API_KEY` is unset (the local-dev default); when set, every guarded request must
carry a matching `X-API-Key` header or it is rejected with **401**. Mounted on all
client-facing routers from `main.py`.

### `app/ratelimit.py`
`rate_limit_middleware` — the **G11** per-client-IP sliding-window limiter.
`RATE_LIMIT_PER_MINUTE` requests per 60 s (default 120; `0` disables). Over-limit
returns **429** with a `Retry-After` header. The `/ingest/*` and docs routes are
exempt.

### `app/schemas.py`
The Pydantic request models — `Node`, `OrderRequest`, `NamedOrderRequest`,
`InstantActionRequest`; the `Ingest*` models for `/ingest/*`; and the reference-data
CRUD bodies (`MapIn`/`MapUpdate`, `RobotIn`/`RobotUpdate`,
`NamedLocationIn`/`NamedLocationUpdate`, `FleetConfigIn`).

### `app/routers/robots.py`
The FMS gateway routes — `/robots/{serial}/order`, `/order/named`, `/instant-actions`,
`/state` — plus the robot **registry CRUD**: `GET /robots` (with `include_archived`),
`GET/POST/PUT/DELETE /robots/{serial}`, and `POST /robots/{serial}/archive|restore`
(soft-delete; archived serials return **410** on command/ingest paths). Reloads the
in-memory `RobotRegistry` after any write.

### `app/routers/fleet.py`
`GET /fleet` — the full fleet definition (`interfaceName`, `majorVersion`, `version`,
`manufacturer`, `robots[]`). The ROS Bridge Service fetches it at startup.

### `app/routers/system.py`
`/system/status` — MQTT + database connectivity. (The legacy `/system/connect|
disconnect` endpoints were removed — the rosbridge URL is fixed config.)

### `app/routers/oee.py`
`/robots/{serial}/oee/summary|cycles|availability` — PostgreSQL-backed.

### `app/routers/orders.py`
`GET /orders` (paged, filterable by serial) and `GET /orders/{order_id}` (header +
joined nodes/edges) — backs the Order History screen.

### `app/routers/maps.py` / `app/routers/locations.py`
Reference-data CRUD (**G15**) for the `maps` and `named_locations` tables, so editing
them no longer means re-applying `schema.sql`. A `DELETE` that an existing foreign key
still references is refused with **409** (the FK is never cascaded).

### `app/routers/ingest.py`
`/ingest/state|connection|command|oee-cycle` — a **secondary** HTTP path (manual
injection, the Node-RED Test Harness, the Newman smoke suite). The live ingest path
is the MQTT subscriber above; both delegate to `app/ingest_service.py`. Maps
`ArchivedRobot` → 410 and `DatabaseUnavailable` → 503.

## Dependency Graph (no cycles)

```
main.py  (+ auth, ratelimit, CORS middleware)
  └── app/routers/
        ├── robots.py     ← robots, vda5050, mqtt, db, schemas
        ├── fleet.py      ← robots, db, schemas
        ├── system.py     ← mqtt, db
        ├── oee.py        ← db, robots
        ├── orders.py     ← db
        ├── maps.py       ← db, schemas
        ├── locations.py  ← db, schemas
        └── ingest.py     ← ingest_service, db
  (vda5050 ← robots ; mqtt ← vda5050, robots, ingest_service ; robots ← db)
```

## Notes

- `/order/named` resolves location IDs from the `named_locations` table via
  `db.fetch_named_locations()`. The table stores `theta` in radians (map frame), so it
  is used directly — no conversion.
- `app/config.py` runs `validate_env()` from `main.py` at startup, failing fast if a
  required env var (`MQTT_BROKER`, `MQTT_PORT`) is missing or invalid.

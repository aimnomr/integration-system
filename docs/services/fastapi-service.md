# Service Reference: fastapi-service

> As-built reference for the current implementation.

## Structure

```
fastapi-service/
├── main.py                    # app creation + router registration (~10 lines)
└── app/
    ├── __init__.py
    ├── mqtt.py                # MQTT client singleton + publish_raw()
    ├── schemas.py             # all 6 Pydantic models
    ├── data.py                # NAMED_LOCATIONS (future: DB layer goes here)
    └── routers/
        ├── __init__.py
        ├── amr.py             # /amr/* (7 nav endpoints + 3 DB stubs)
        ├── system.py          # /system/* (connect, disconnect, status)
        └── oee.py             # /oee/* (3 DB stubs)
```

## Module Responsibilities

### `main.py`
Calls `load_dotenv()` first (before any app imports, since `app/mqtt.py` reads env vars
at module level), then creates the FastAPI app and mounts the three routers.

### `app/mqtt.py`
- Owns `mqtt_client` singleton (connect + `loop_start`).
- Exports `publish_raw(command, payload)` and `mqtt_client`.
- `publish_raw` is used by `amr.py`; `mqtt_client` is used directly by `system.py`.

### `app/schemas.py`
All 6 Pydantic models: `Angle`, `GoalRequest`, `NamedGoalRequest`, `Waypoint`,
`WaypointsRequest`, `ConnectRequest`.

### `app/data.py`
`NAMED_LOCATIONS` dict. When DB is integrated, this file becomes the DB access
layer — routers don't change, only this file does.

### `app/routers/amr.py`
`APIRouter(prefix="/amr")` — navigation commands + DB-stub state queries.

### `app/routers/system.py`
`APIRouter(prefix="/system")` — publishes directly to `amr/system/*` MQTT topics
(not via `publish_raw`).

### `app/routers/oee.py`
`APIRouter(prefix="/oee")` — all 503 stubs until DB is integrated.

## Dependency Graph (no cycles)

```
main.py
  ├── app/mqtt.py          (no deps)
  ├── app/schemas.py       (no deps)
  ├── app/data.py          (no deps)
  └── app/routers/
        ├── amr.py      ← mqtt.py, schemas.py, data.py
        ├── system.py   ← mqtt.py, schemas.py
        └── oee.py      (no deps)
```

## Notes

- `db_unavailable()` is defined locally in `amr.py` and `oee.py` — it's a temporary
  stub that disappears when real DB queries replace it, so no shared module needed.
- `load_dotenv()` placement is intentional: it must precede `from app.routers import ...`
  to ensure env vars are set before `app/mqtt.py` connects.

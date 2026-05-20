# Implementation Status

> **This is a point-in-time snapshot and decays.** Last updated: 2026-05-18.
> When in doubt, the code is authoritative.

---

## Working

The system speaks **VDA5050** end to end (migration Phases 0–7 complete — see
[plans/vda5050-migration.md](plans/vda5050-migration.md)).

- **FastAPI — FMS gateway.** Robot-scoped routes: `GET /robots`, `GET /fleet`,
  `POST /robots/{serial}/order`, `/order/named`, `/instant-actions`,
  `GET /robots/{serial}/state`, `/oee/summary|cycles|availability`,
  `GET /system/status` (MQTT, database, roslib, Node-RED connectivity), and internal
  `/ingest/*` telemetry endpoints. Publishes VDA5050 `order` / `instantActions`
  directly to MQTT. Loads the fleet from the database at startup.
- **ROS Bridge Service — fleet-capable.** `FleetManager` fetches the fleet from
  FastAPI's `GET /fleet` at startup and runs one isolated `Robot` per entry (own MQTT
  client, own rosbridge connection). Each robot:
  - subscribes its VDA5050 `order` / `instantActions` topics;
  - the `OrderStateMachine` drives `/move_base_simple/goal` node-by-node, auto-advancing
    on each `/move_base/result`, and applies `cancelOrder` / `retryNode` / `skipNode`;
  - publishes the consolidated VDA5050 `state` message (position from `/amcl_pose`,
    motion from `/diff_controller/odom`) on change + 5 s heartbeat;
  - publishes the retained `connection` topic (`ONLINE` / `OFFLINE`, plus a
    `CONNECTIONBROKEN` MQTT Last-Will).
- **Node-RED — telemetry sink + DB admin.** Ingests `state` / `connection` and the
  `order` / `instantActions` audit tap, derives OEE cycles from order-completion
  transitions, and persists everything via the FastAPI `/ingest/*` API. A separate
  **DB Admin** tab uses the `node-red-contrib-postgresql` palette node to reset the
  schema (run `docs/schema/schema.sql`) and run ad-hoc admin SQL directly against
  Postgres — bypassing FastAPI, for setup/maintenance only.
- **Structured logging** — ROS Bridge Service and FastAPI emit JSON-line logs.
- **Authentication & rate limiting** — FastAPI supports opt-in `X-API-Key` auth
  (`API_KEY`) on the client-facing API and a per-client rate limiter
  (`RATE_LIMIT_PER_MINUTE`); both are off/permissive by default for local dev.
- **Tests** — per-service suites: `node:test` for the ROS Bridge (`npm test`),
  `pytest` for FastAPI; both run in CI.
- **Docker & CI** — per-service `Dockerfile`s, a root `docker-compose.yml` for the
  full stack, and a GitHub Actions workflow (`.github/workflows/ci.yml`).
- **Mosquitto** — configured on `localhost:1883`.
- **Database schema — fully normalized.** 15-table relational schema (1NF-strict,
  BCNF): VDA5050's variable-length arrays live in child tables, not JSONB. FastAPI
  `app/db.py` writes each `state` / `order` / `instantActions` message as a multi-table
  transaction and joins the child tables back on read.
- **Database is the single source of truth for the fleet.** `fleet_config` + `robots`
  define the fleet; FastAPI loads it at startup and the ROS Bridge fetches it via
  `GET /fleet`. There is no `robots.config.json`.
- **Schema documentation** — VDA5050 messages, MQTT topics, REST endpoints, ROS topics,
  database schema, all current.

---

## Verified vs. not

- **Syntax-checked / structurally verified:** all ROS Bridge Service files
  (`node --check`), all FastAPI files (`py_compile`), `flows.json` (JSON + node-graph
  integrity). The FastAPI registry now loads the fleet from the database at import, so
  it can no longer be run-tested without a live DB.
- **Unit-tested:** the ROS Bridge `node:test` suite (15 tests) passes locally and
  covers `vda5050.js`, `stateBuilder.js`, and `orderStateMachine.js` helpers. The
  FastAPI `pytest` suite covers `config.py`, `auth.py`, and `ratelimit.py` — it runs
  in CI but has not been run locally (pytest not yet installed in this environment).
- **Not yet end-to-end tested:** the live pipeline needs an MQTT broker, rosbridge + a
  robot, and PostgreSQL. The persistence path additionally needs the `psycopg2-binary`
  dependency (`pip install -r fastapi-service/requirements.txt`) and the schema applied
  (`docs/schema/DATABASE_SCHEMA.md`).

---

## Not yet implemented

G1–G17 and G19–G21 are resolved. The 2026-05-18 audit gaps are closed except
**G18 (CORS)**, which the user deferred until the React frontend work begins — the
reference-data CRUD API (G15), DB connection pooling (G16), navigation-failure
observability (G17), telemetry retention (G19), ingest error handling (G20), and
VDA5050 counter persistence (G21) all landed in this round. G18 remains tracked in
**[gaps.md](gaps.md)**.

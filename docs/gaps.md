# Gaps & Flagged Items

Open items not yet addressed, consolidated for visibility. For what *is* working see
[status.md](status.md). Resolved gaps are listed at the bottom.

> Last updated: 2026-05-22 (G24–G27 surfaced by the manual-checklist walkthrough
> on 2026-05-22; consolidated remarks in `manual-test-remarks.md`).
> Severity is a rough triage (High = blocks core function, Medium = limits
> usefulness, Low = polish / hardening). Gap IDs are stable — resolved ones
> keep their number rather than being renumbered.

## At a glance

| # | Gap | Area | Severity |
|---|---|---|---|
| G24 | DB-down returns HTTP 500 instead of 503 from `GET /robots/{serial}/state` and `GET /system/status` | FastAPI | Medium |
| G25 | Health pills don't degrade live when `/system/status` poll fails — DB / ROS stay green until refresh | Frontend | Medium |
| G26 | Dashboard tile "last seen" timer stuck at `0s ago`; doesn't tick upward | Frontend | Low |
| G27 | Named-location pin labels invisible vs the dark MapCanvas background | Frontend | Low |

See [manual-test-remarks.md](manual-test-remarks.md) for the full walkthrough
notes that surfaced these — including items that looked like bugs but turned
out to be expected behaviour or test-setup issues.

---

## Resolved

| # | Gap | Resolved |
|---|---|---|
| G1 | Waypoint sequence does not auto-advance | 2026-05-17 |
| G2 | No navigation goal status/feedback | 2026-05-17 |
| G3 | Bridge does not publish most outbound topics | 2026-05-17 |
| G4 | PostgreSQL not integrated | 2026-05-17 |
| G5 | Node-RED → PostgreSQL logging not wired | 2026-05-17 |
| G6 | 6 GET endpoints stubbed (503) | 2026-05-17 |
| G7 | `GET /system/status` roslib / Node-RED status unknown | 2026-05-17 |
| G8 | Named locations hardcoded in FastAPI | 2026-05-17 |
| G9 | No env-var validation / no `.env.example` | 2026-05-17 |
| G10 | No authentication / authorization | 2026-05-18 |
| G11 | No rate limiting | 2026-05-18 |
| G12 | No structured logging | 2026-05-17 |
| G13 | No tests (zero coverage) | 2026-05-18 |
| G14 | No Docker / docker-compose / CI | 2026-05-18 |
| G15 | No CRUD API for reference data | 2026-05-18 |
| G16 | No database connection pooling | 2026-05-18 |
| G17 | Navigation failures invisible to telemetry consumers | 2026-05-18 |
| G18 | No CORS configuration — browser frontend blocked | 2026-05-20 |
| G19 | Unbounded telemetry growth — no retention policy | 2026-05-18 |
| G20 | `/ingest/*` returns HTTP 500 on malformed payloads | 2026-05-18 |
| G21 | VDA5050 `headerId` / `orderId` counters reset on restart | 2026-05-18 |
| G22 | Frontend named-order POST sent camelCase, FastAPI expected snake_case (422 on every Dispatch → Named send) | 2026-05-21 |
| G23 | `GET/POST/PUT /robots/{serial}` returned snake_case while `GET /robots` (list) returned camelCase — API self-inconsistency | 2026-05-21 |

G1–G3 — the ROS Bridge Service consumes `/move_base` feedback and the VDA5050
`OrderStateMachine` auto-advances orders node-by-node. G12 — JSON-line logging in the
ROS Bridge and FastAPI.

**G7** — `/system/status` now reports `roslib` (inferred from the robots' retained
VDA5050 `connection` topics — FastAPI's MQTT client subscribes them) and `node_red`
(a best-effort HTTP probe of `NODE_RED_URL`). Neither is `unknown` in normal operation.

**G8** — `POST /robots/{serial}/order/named` now sources named locations from the
`named_locations` table via `db.fetch_named_locations()`; the hardcoded `app/data.py`
dict is deleted. `theta` is read directly (the table stores radians), so the old
degrees→radians conversion is gone.

**G9** — required env vars are validated at startup: FastAPI via `app/config.py`
(`validate_env()` in `main.py`), the ROS Bridge via a check in `index.js`. Both fail
fast with a clear message. `.env.example` templates are committed for both services.

**G10** — API-key authentication (`app/auth.py`). Opt-in via the `API_KEY` env var:
unset = open API (local-development default); set = the client-facing endpoints
(`/robots/*`, `/fleet`, `/system/*`, `/maps/*`, `/locations/*`) require a matching
`X-API-Key` header or return 401. `/ingest/*` is left open — it is the internal
Node-RED → DB boundary. The ROS Bridge sends the key on `GET /fleet` when `API_KEY`
is set. MQTT-broker auth is a separate hardening step (anonymous access is documented
in `mosquitto.conf`).

**G11** — per-client-IP rate limiting (`app/ratelimit.py`), a sliding-window
middleware. `RATE_LIMIT_PER_MINUTE` caps requests per 60 s (default 120; `0`
disables it); over-limit returns 429 with `Retry-After`. `/ingest/*` is exempt
(internal high-volume telemetry). Targets the documented command-thrashing risk.

**G13** — per-service test suites. The ROS Bridge has `node:test` tests
(`ros-bridge-service/test/`, run with `npm test`) covering `vda5050.js`,
`stateBuilder.js`, and `orderStateMachine.js` helpers — including the G17
navigation-error path. FastAPI has `pytest` tests (`fastapi-service/tests/`) for
`config.py`, `auth.py`, `ratelimit.py`, and the ingest / CRUD schemas (`test_schemas.py`);
install `requirements-dev.txt` and run `pytest`. Both run in CI (G14).

**G14** — containerisation and CI. Each service has a `Dockerfile`; the root
`docker-compose.yml` brings up the full stack (PostgreSQL → Mosquitto → FastAPI →
ROS Bridge → Node-RED) with healthcheck-gated start order and auto-applies
`schema.sql`. `.github/workflows/ci.yml` syntax-checks every service and runs both
test suites on push / PR.

**G15** — reference-data CRUD API. `GET/POST/PUT/DELETE` for `maps`
(`routers/maps.py`), `named_locations` (`routers/locations.py`), and `robots`
(`routers/robots.py`), plus `PUT /fleet` for the single `fleet_config` row. Editing
the reference tables no longer means re-applying `schema.sql`. Postgres FK / unique
violations are caught in `db.py` (`IntegrityConflict`) and returned as **409** — the
FK is never cascaded, so telemetry is never wiped. After any `robots` / `fleet_config`
write the in-memory `RobotRegistry` is reloaded (`registry.reload()`). See
[REST_ENDPOINTS.md](schema/REST_ENDPOINTS.md) § "Reference-data CRUD".

**G16** — database connection pooling. `app/db.py` now serves connections from a
lazily-built `psycopg2.pool.ThreadedConnectionPool`; `_transaction()` / `_query()` /
`_execute()` borrow and return connections instead of opening a fresh TCP connect +
auth handshake per query. The `DatabaseUnavailable` fallback is preserved (the
service still boots without a database). Pool size: `DB_POOL_MIN` / `DB_POOL_MAX`.

**G17** — navigation failures are now visible to telemetry consumers. On a
non-`SUCCEEDED` `/move_base` result the `OrderStateMachine` records a
`navigationFailed` error (`errorLevel: WARNING`, the failed `nodeId` in the
description); `StateBuilder` merges it into the VDA5050 `state.errors` array, so it
is persisted to `state_errors` and surfaced by `GET /robots/{serial}/state`. The
error is cleared when a later node succeeds.

**G18** — CORS. `main.py` registers Starlette's `CORSMiddleware`; the allowed
origins are read from `CORS_ORIGINS` (comma-separated, defaults to
`http://localhost:5173` so the Vite dev server works out of the box). Credentials
and `X-API-Key` are permitted; the configuration is documented in `.env.example`
and `schema/REST_ENDPOINTS.md`. This unblocks the React frontend work that began
on 2026-05-20.

**G19** — telemetry retention. A FastAPI background task prunes `state_snapshots`
and `connection_log` rows older than `TELEMETRY_RETENTION_DAYS` (default 30; `0`
disables it) every 6 h — child tables go via `ON DELETE CASCADE`. Documented in
[DATABASE_SCHEMA.md](schema/DATABASE_SCHEMA.md) § Notes.

**G20** — `/ingest/*` no longer returns 500 on malformed payloads. The ingest routes
are typed with Pydantic models (`app/schemas.py`) that pin the required top-level
keys; FastAPI now returns a **422** naming the offending field. The variable-length
VDA5050 arrays pass straight through via `extra="allow"`.

**G23** — single-row robots endpoints returned snake_case rows. `GET /robots`
went through `RobotRegistry.list()` which emits camelCase
(`{serialNumber, rosbridgeUrl, mapId}`), but `GET /robots/{serial}`,
`POST /robots`, and `PUT /robots/{serial}` returned the raw `db.fetch_robot()`
row (`{serial_number, rosbridge_url, map_id}`). Surfaced by the Newman
assertion `expected j.serialNumber to eql 'amr001'` failing against
`undefined` (already noted in the manual checklist as a REMARK from
2026-05-21 03:13). Fixed by adding a `_to_camel(row)` helper in
`app/routers/robots.py` and applying it to the get/post/put responses;
`db.py` stays SQL-shaped (snake_case) by convention.

**G22** — `postNamedOrder` in `frontend/src/api/robots.ts` was sending
`{ locationIds: [...] }` (camelCase) while FastAPI's `NamedOrderRequest`
pydantic schema declares `location_ids` (snake_case). Every Dispatch → Named
order in the React app returned **422 Unprocessable Entity**; the Manual
mode path was unaffected because `OrderRequest` uses `nodes` on both sides.
Surfaced by the Playwright E2E suite added 2026-05-21 (`dispatch.spec.ts`).
Fixed by translating at the wire boundary in `postNamedOrder` (snake_case
on the JSON, camelCase preserved on the TS interface for callers).

**G21** — VDA5050 counters persist across restarts. `RobotRegistry` seeds its
`headerId` (per topic) and `orderId` counters at startup from the database
(`MAX(header_id)` from `orders` / `instant_action_messages`, `MAX` order suffix per
robot) so they resume rather than restart at 0. The order-suffix query
(`fetch_max_order_suffixes` in `app/db.py`) filters rows by
`split_part(order_id, '-order-', 2) ~ '^[0-9]+$'` so legacy or hand-inserted
`order_id` values that don't match the `{serial}-order-N` template (e.g. test rows
with non-numeric suffixes) no longer crash the startup CAST.

**G4 / G5 / G6** were resolved by the VDA5050 migration
([plans/vda5050-migration.md](plans/vda5050-migration.md)):
- **G4** — the database schema is VDA5050-aligned, serial-keyed and fully normalized
  (1NF-strict, BCNF — 15 tables, VDA5050 arrays in child tables, not JSONB; see
  [schema/DATABASE_SCHEMA.md](schema/DATABASE_SCHEMA.md)); FastAPI `app/db.py`
  implements the read and write paths.
- **G5** — Node-RED ingests the VDA5050 `state` / `connection` / `order` topics and
  persists them via the FastAPI `/ingest/*` API (a documented refinement of the
  original "Node-RED writes directly" plan — see the migration plan §5.3).
- **G6** — the GET endpoints are now real, robot-scoped and PostgreSQL-backed
  (`GET /robots/{serial}/state`, `/oee/*`); the 503 stubs are gone.

> **Runtime caveat:** the resolved persistence path is **code-complete and
> syntax-checked, not yet end-to-end tested** — it needs a live PostgreSQL instance
> (apply `DATABASE_SCHEMA.md`) plus the `psycopg2-binary` dependency. See
> [status.md](status.md).

## Notes

- The VDA5050 migration (Phases 0–7) is implemented; see
  [plans/vda5050-migration.md](plans/vda5050-migration.md) and [status.md](status.md).
- Wiring the ROS safety topics (`/e_stop`, `/safety/error*`) into `state.errors` /
  `state.safetyState` is a documented simplification, not a tracked gap — the fields
  exist with safe defaults.

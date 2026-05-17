# Gaps & Flagged Items

Open items not yet addressed, consolidated for visibility. For what *is* working see
[status.md](status.md). Resolved gaps are listed at the bottom.

> Last updated: 2026-05-17. Severity is a rough triage (High = blocks core function,
> Medium = limits usefulness, Low = polish / hardening). Gap IDs are stable — resolved
> ones keep their number rather than being renumbered.

## At a glance

| # | Gap | Area | Severity |
|---|---|---|---|
| G10 | No authentication / authorization | Operational | Medium |
| G11 | No rate limiting | Operational | Low |
| G13 | No tests (zero coverage) | Operational | Medium |
| G14 | No Docker / docker-compose / CI | Operational | Low |

---

## Operational readiness

### G10 — No authentication / authorization
The REST API and MQTT topics are open. Acceptable for local development; must be
addressed before any networked deployment.

### G11 — No rate limiting
Nothing limits request rate on the FastAPI gateway. The main risk is **robot command
thrashing** — rapid order/cancel commands constantly preempt the navigation stack —
plus flooding the MQTT pipeline. For a local single-robot setup the blast radius is
small (hence Low), but a buggy client loop can still destabilise navigation.

### G13 — No tests
Zero automated test coverage across all services. Tests would be **per-service** —
`pytest` for FastAPI, `node:test` for the ROS Bridge — since each is a separate
codebase with its own toolchain.

### G14 — No Docker / docker-compose / CI
Each service is started manually; there is no containerisation, unified launcher, or
continuous integration.

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
| G12 | No structured logging | 2026-05-17 |

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

**G4 / G5 / G6** were resolved by the VDA5050 migration
([plans/vda5050-migration.md](plans/vda5050-migration.md)):
- **G4** — the database schema is VDA5050-aligned, serial-keyed and fully normalized
  (1NF-strict, BCNF — 14 tables, VDA5050 arrays in child tables, not JSONB; see
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

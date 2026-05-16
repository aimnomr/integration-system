# Gaps & Flagged Items

Open items not yet addressed, consolidated for visibility. For what *is* working see
[status.md](status.md). Resolved gaps are listed at the bottom.

> Last updated: 2026-05-17. Severity is a rough triage (High = blocks core function,
> Medium = limits usefulness, Low = polish / hardening). Gap IDs are stable — resolved
> ones keep their number rather than being renumbered.

## At a glance

| # | Gap | Area | Severity |
|---|---|---|---|
| G4 | PostgreSQL not integrated | Persistence | High |
| G5 | Node-RED → PostgreSQL logging not wired | Persistence | Medium |
| G6 | 6 GET endpoints stubbed (503) | API | Medium |
| G7 | `GET /system/status` only checks MQTT | API | Low |
| G8 | Named locations hardcoded in FastAPI | Config/data | Low |
| G9 | No env-var validation / no `.env.example` | Robustness | Low |
| G10 | No authentication / authorization | Operational | Medium |
| G11 | No rate limiting | Operational | Low |
| G13 | No tests (zero coverage) | Operational | Medium |
| G14 | No Docker / docker-compose / CI | Operational | Low |

---

## Persistence

### G4 — PostgreSQL not integrated
No service connects to a database. Schema is defined in
[schema/DATABASE_SCHEMA.md](schema/DATABASE_SCHEMA.md) but nothing creates or writes
to it. Blocks G5 and G6.

### G5 — Node-RED → PostgreSQL logging not wired
The State/Health/OEE handler tabs validate messages and write to debug output only —
the `INSERT INTO ...` steps are `TODO` placeholders. Depends on G4.

---

## API

### G6 — 6 GET endpoints stubbed
`/amr/state`, `/amr/health`, `/amr/nav/status`, `/oee/summary`, `/oee/cycles`,
`/oee/availability` all return HTTP 503. They depend on G4 (the data they would
return is not stored anywhere).

### G7 — `GET /system/status` only checks MQTT
It reports MQTT connectivity but returns unknown/placeholder status for roslib,
Node-RED, and the database.

---

## Configuration & robustness

### G8 — Named locations hardcoded
`NAMED_LOCATIONS` lives in `fastapi-service/app/data.py`. It should eventually be
sourced from the database (a `named_locations` table is already in the schema).

### G9 — No env-var validation / no `.env.example`
Services read env vars at startup with no validation — a missing `MQTT_BROKER` fails
unclearly. There are also no committed `.env.example` templates for onboarding.

---

## Operational readiness

### G10 — No authentication / authorization
The REST API and MQTT topics are open. Acceptable for local development; must be
addressed before any networked deployment.

### G11 — No rate limiting
Nothing limits request rate on the FastAPI gateway. The main risk is **robot command
thrashing** — rapid goal/cancel commands constantly preempt the navigation stack — plus
flooding the MQTT → Node-RED → bridge pipeline. For a local single-robot setup the
blast radius is small (hence Low), but a buggy client loop can still destabilise
navigation.

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
| G12 | No structured logging | 2026-05-17 |

G1–G3 — `ros-bridge-service` now consumes `/move_base` feedback (auto-advance +
`amr/state/nav/status`) and publishes `amr/state/pose`, `amr/state/nav/progress`,
`amr/health/connection`, and `amr/health/error`. `amr/health/battery` was dropped
project-wide (no battery ROS topic). G12 — JSON-line logging in the ROS Bridge and
FastAPI. See [status.md](status.md) and the [service docs](services/).

## Notes

- **OEE** scope was deliberately deferred — the OEE endpoints remain under G6.
- The VDA5050 migration ([plans/vda5050-migration.md](plans/vda5050-migration.md))
  builds on G1–G3; it does not by itself resolve the remaining gaps.

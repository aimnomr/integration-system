# Gaps & Flagged Items

Everything not yet addressed, consolidated for visibility. For what *is* working, see
[status.md](status.md).

> Last updated: 2026-05-17. Severity is a rough triage (High = blocks core function,
> Medium = limits usefulness, Low = polish / hardening).

## At a glance

| # | Gap | Area | Severity |
|---|---|---|---|
| G1 | Waypoint sequence does not auto-advance | Navigation | High |
| G2 | No navigation goal status/feedback at all | Navigation | High |
| G3 | Bridge does not publish most outbound topics | Data pipeline | High |
| G4 | PostgreSQL not integrated | Persistence | High |
| G5 | Node-RED → PostgreSQL logging not wired | Persistence | Medium |
| G6 | 6 GET endpoints stubbed (503) | API | Medium |
| G7 | `GET /system/status` only checks MQTT | API | Low |
| G8 | Named locations hardcoded in FastAPI | Config/data | Low |
| G9 | No env-var validation / no `.env.example` | Robustness | Low |
| G10 | No authentication / authorization | Operational | Medium |
| G11 | No rate limiting | Operational | Low |
| G12 | No structured logging | Operational | Medium |
| G13 | No tests (zero coverage) | Operational | Medium |
| G14 | No Docker / docker-compose / CI | Operational | Low |

---

## Navigation

### G1 — Waypoint sequence does not auto-advance
The ROS Bridge Service sends only the first waypoint; advancing to the next requires
a manual `amr/cmd/waypoints/skip` command. `navigation.js` never subscribes to
`/move_base/result`, so it cannot detect that a waypoint was reached.
**Fix path:** subscribe to `/move_base/result`; on a `SUCCEEDED` result call
`_sendNext()`. The VDA5050 plan (§4.2) closes this via the order state machine.

### G2 — No navigation goal status/feedback at all
Goal sending is fire-and-forget — even a single goal has no success/failure tracking.
The robot exposes `/move_base/result` and `/move_base/status`, but the bridge ignores
them. Consequence: `amr/state/nav/status` cannot be produced, and the API cannot tell
a caller whether a goal succeeded.

---

## Data pipeline & persistence

### G3 — Bridge does not publish most outbound topics
Only `amr/state/odom` is published. `amr/state/pose`, `amr/state/nav/status`,
`amr/state/nav/progress`, `amr/health/*`, and `amr/oee/cycle` are defined in the
schema and have Node-RED handlers, but the bridge never publishes them.

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
No protection against request floods on the FastAPI gateway.

### G12 — No structured logging
Services log ad-hoc to the console; there is no consistent, queryable log format.

### G13 — No tests
Zero automated test coverage across all services.

### G14 — No Docker / docker-compose / CI
Each service is started manually; there is no containerisation, unified launcher, or
continuous integration.

---

## Notes

- **OEE** scope was deliberately deferred — the OEE endpoints remain under G6.
- The VDA5050 migration ([plans/vda5050-migration.md](plans/vda5050-migration.md))
  addresses G1, G2, and G3 as part of its redesign; it does not by itself resolve
  G4–G14.

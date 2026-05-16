# Gaps & Flagged Items

Everything not yet addressed, consolidated for visibility. For what *is* working, see
[status.md](status.md).

> Last updated: 2026-05-17. Severity is a rough triage (High = blocks core function,
> Medium = limits usefulness, Low = polish / hardening).

## At a glance

| # | Gap | Area | Severity |
|---|---|---|---|
| G1 | Waypoint sequence does not auto-advance | Navigation | ✅ Resolved |
| G2 | No navigation goal status/feedback at all | Navigation | ✅ Resolved |
| G3 | Bridge does not publish most outbound topics | Data pipeline | ✅ Resolved |
| G4 | PostgreSQL not integrated | Persistence | High |
| G5 | Node-RED → PostgreSQL logging not wired | Persistence | Medium |
| G6 | 6 GET endpoints stubbed (503) | API | Medium |
| G7 | `GET /system/status` only checks MQTT | API | Low |
| G8 | Named locations hardcoded in FastAPI | Config/data | Low |
| G9 | No env-var validation / no `.env.example` | Robustness | Low |
| G10 | No authentication / authorization | Operational | Medium |
| G11 | No rate limiting | Operational | Low |
| G12 | No structured logging | Operational | ✅ Resolved |
| G13 | No tests (zero coverage) | Operational | Medium |
| G14 | No Docker / docker-compose / CI | Operational | Low |

---

## Navigation

### G1 — Waypoint sequence does not auto-advance
> ✅ **Resolved (2026-05-17).** `src/navFeedback.js` subscribes to
> `/move_base/result`; on a `SUCCEEDED` result, `navigation.js` `handleGoalResult()`
> advances the queue, sends the next waypoint, and publishes `amr/state/nav/progress`.
> On `ABORTED`/`PREEMPTED` the sequence pauses for manual retry/skip.

### G2 — No navigation goal status/feedback at all
> ✅ **Resolved (2026-05-17).** `src/navFeedback.js` subscribes to `/move_base/status`
> and `/move_base/result`, maps actionlib status codes to the schema enum
> (`IDLE`/`NAVIGATING`/`SUCCEEDED`/`ABORTED`/`PREEMPTED`), and publishes
> `amr/state/nav/status` on each transition.

---

## Data pipeline & persistence

### G3 — Bridge does not publish most outbound topics
> ✅ **Resolved (2026-05-17).** The bridge now also publishes `amr/state/pose` (from
> `/amcl_pose`, via `src/poseBridge.js`), `amr/state/nav/status`,
> `amr/state/nav/progress`, `amr/health/connection`, and `amr/health/error`.
> **Carve-outs:** `amr/health/battery` was **removed** project-wide — the robot
> exposes no battery ROS topic; `amr/oee/cycle` remains deferred with OEE.

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
> ✅ **Resolved (2026-05-17).** The ROS Bridge Service (`src/logger.js`) and FastAPI
> (`app/logging_config.py` + request middleware) emit JSON-line logs
> (`{ts, level, service, msg, …}`). Node-RED continues to use its built-in console
> logger (level configurable in `settings.js`).

### G13 — No tests
Zero automated test coverage across all services.

### G14 — No Docker / docker-compose / CI
Each service is started manually; there is no containerisation, unified launcher, or
continuous integration.

---

## Notes

- **OEE** scope was deliberately deferred — the OEE endpoints remain under G6.
- **Resolved 2026-05-17:** G1, G2, G3 (ros-bridge feedback loop + outbound topics)
  and G12 (structured logging). `amr/health/battery` was dropped project-wide — the
  robot has no battery topic.
- The VDA5050 migration ([plans/vda5050-migration.md](plans/vda5050-migration.md))
  builds on G1–G3; it does not by itself resolve the remaining gaps.

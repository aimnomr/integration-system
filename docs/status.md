# Implementation Status

> **This is a point-in-time snapshot and decays.** Last updated: 2026-05-16.
> When in doubt, the code is authoritative.

---

## Working

- **FastAPI** — 9 POST endpoints: `/amr/goal`, `/amr/goal/named`,
  `/amr/waypoints/start`, `/amr/waypoints/stop`, `/amr/waypoints/retry`,
  `/amr/waypoints/skip`, `/amr/cancel`, `/system/connect`, `/system/disconnect`.
- **FastAPI** — `GET /system/status` (partial — reports MQTT connectivity only).
- **ROS Bridge Service** — bidirectional bridge with auto-reconnect:
  - Publishes `amr/state/odom` (throttled: distance/heading threshold + 5 s heartbeat).
  - Handles `amr/cmd/goal` → `/move_base_simple/goal`.
  - Handles `amr/cmd/waypoints` → sequential goal sending.
  - Handles `amr/cmd/cancel` → `/move_base/cancel`.
  - Handles `amr/cmd/waypoints/retry` and `amr/cmd/waypoints/skip`.
  - Handles `amr/system/connect` and `amr/system/disconnect`.
- **Node-RED** — validation + routing function: `amr/cmd/raw` → 3 typed output topics
  (`goal`, `waypoints`, `cancel`); state/health/oee handler tabs subscribe and
  validate (debug output only — no DB writes yet).
- **Mosquitto** — configured on `localhost:1883`.
- **Schema documentation** — REST, MQTT, ROS topics; database schema.

---

## Not yet implemented

- **Bridge publishing of outbound topics** — `amr/state/pose`, `amr/state/nav/status`,
  `amr/state/nav/progress`, `amr/health/*`, `amr/oee/cycle`. Node-RED handlers already
  exist; the bridge does not publish these yet.
- **Nav feedback loop** — automatic waypoint advance on goal success/failure (today
  the sequence only advances via manual retry/skip).
- **6 stubbed GET endpoints** — `/amr/state`, `/amr/health`, `/amr/nav/status`,
  `/oee/summary`, `/oee/cycles`, `/oee/availability` (return 503 pending DB).
- **PostgreSQL integration** — no DB code yet; schema defined in
  [../schema/DATABASE_SCHEMA.md](../schema/DATABASE_SCHEMA.md).
- **Node-RED → PostgreSQL logging** — the outbound pipeline stops at Node-RED.
- **Named locations from DB** — currently hardcoded in FastAPI (`app/data.py`).
- **Authentication / authorization, rate limiting, structured logging.**
- **Tests** — zero test coverage.
- **Docker / docker-compose.**

---

## Key gaps

1. **Nav feedback loop** — the bridge cannot detect goal success/failure, so waypoint
   sequencing advances manually (retry/skip), not automatically.
2. **Outbound topics** — pose, nav status/progress, health, and OEE are not yet
   published by the bridge.
3. **PostgreSQL** — the entire persistence layer is missing; all data-backed GET
   endpoints return 503.
4. **Named locations** — hardcoded in FastAPI; should eventually come from the DB.

# Implementation Status

> **This is a point-in-time snapshot and decays.** Last updated: 2026-05-17.
> When in doubt, the code is authoritative.

---

## Working

- **FastAPI** — 9 POST endpoints: `/amr/goal`, `/amr/goal/named`,
  `/amr/waypoints/start`, `/amr/waypoints/stop`, `/amr/waypoints/retry`,
  `/amr/waypoints/skip`, `/amr/cancel`, `/system/connect`, `/system/disconnect`.
- **FastAPI** — `GET /system/status` (partial — reports MQTT connectivity only).
- **ROS Bridge Service** — bidirectional bridge with auto-reconnect:
  - Publishes `amr/state/odom` and `amr/state/pose` (throttled: distance/heading
    threshold + 5 s heartbeat).
  - Subscribes to `/move_base/status` and `/move_base/result`; publishes
    `amr/state/nav/status`.
  - Auto-advances waypoint sequences on goal success; publishes
    `amr/state/nav/progress`.
  - Publishes `amr/health/connection` and `amr/health/error`.
  - Handles `amr/cmd/goal` → `/move_base_simple/goal`, `amr/cmd/waypoints`,
    `amr/cmd/cancel` → `/move_base/cancel`, `amr/cmd/waypoints/retry` / `skip`, and
    `amr/system/connect` / `disconnect`.
- **Structured logging** — ROS Bridge Service and FastAPI emit JSON-line logs.
- **Node-RED** — validation + routing function: `amr/cmd/raw` → 3 typed output topics
  (`goal`, `waypoints`, `cancel`); state/health/oee handler tabs subscribe and
  validate (debug output only — no DB writes yet).
- **Mosquitto** — configured on `localhost:1883`.
- **Schema documentation** — REST, MQTT, ROS topics; database schema.

---

## Not yet implemented

Everything not yet built is tracked, with severity and fix paths, in
**[gaps.md](gaps.md)** — G1–G14. In short: PostgreSQL persistence (and the 6 GET
endpoints that depend on it), Node-RED → DB logging, and operational concerns (auth,
rate limiting, tests, Docker). G1–G3 (navigation feedback, outbound topics) and G12
(structured logging) are now resolved.

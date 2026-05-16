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

Everything not yet built is tracked, with severity and fix paths, in
**[gaps.md](gaps.md)** — G1–G14. In short: the navigation feedback loop, most
outbound bridge topics, PostgreSQL persistence (and the 6 GET endpoints that depend
on it), and operational concerns (auth, logging, tests, Docker).

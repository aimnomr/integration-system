# Implementation Status

> **This is a point-in-time snapshot and decays.** Last updated: 2026-05-17.
> When in doubt, the code is authoritative.

---

## Working

The system speaks **VDA5050** end to end (migration Phases 0–7 complete — see
[plans/vda5050-migration.md](plans/vda5050-migration.md)).

- **FastAPI — FMS gateway.** Robot-scoped routes: `GET /robots`,
  `POST /robots/{serial}/order`, `/order/named`, `/instant-actions`,
  `GET /robots/{serial}/state`, `/oee/summary|cycles|availability`,
  `GET /system/status` (MQTT + database connectivity), and internal `/ingest/*`
  telemetry endpoints. Publishes VDA5050 `order` / `instantActions` directly to MQTT.
- **ROS Bridge Service — fleet-capable.** `FleetManager` loads
  `robots.config.json` and runs one isolated `Robot` per entry (own MQTT client, own
  rosbridge connection). Each robot:
  - subscribes its VDA5050 `order` / `instantActions` topics;
  - the `OrderStateMachine` drives `/move_base_simple/goal` node-by-node, auto-advancing
    on each `/move_base/result`, and applies `cancelOrder` / `retryNode` / `skipNode`;
  - publishes the consolidated VDA5050 `state` message (position from `/amcl_pose`,
    motion from `/diff_controller/odom`) on change + 5 s heartbeat;
  - publishes the retained `connection` topic (`ONLINE` / `OFFLINE`, plus a
    `CONNECTIONBROKEN` MQTT Last-Will).
- **Node-RED — telemetry sink.** Ingests `state` / `connection` and the `order` /
  `instantActions` audit tap, derives OEE cycles from order-completion transitions, and
  persists everything via the FastAPI `/ingest/*` API.
- **Structured logging** — ROS Bridge Service and FastAPI emit JSON-line logs.
- **Mosquitto** — configured on `localhost:1883`.
- **Schema documentation** — VDA5050 messages, MQTT topics, REST endpoints, ROS topics,
  database schema, all current.

---

## Verified vs. not

- **Syntax-checked / structurally verified:** all ROS Bridge Service files
  (`node --check` + module-graph import), all FastAPI files (`py_compile`; registry +
  VDA5050 builders run-tested), `flows.json` (JSON + node-graph integrity).
- **Not yet end-to-end tested:** the live pipeline needs an MQTT broker, rosbridge + a
  robot, and PostgreSQL. The persistence path additionally needs the `psycopg2-binary`
  dependency (`pip install -r fastapi-service/requirements.txt`) and the schema applied
  (`docs/schema/DATABASE_SCHEMA.md`).

---

## Not yet implemented

Tracked, with severity and fix paths, in **[gaps.md](gaps.md)** — open items are
G7–G11, G13, G14: roslib/Node-RED status reporting, named locations from DB, env-var
validation, auth, rate limiting, tests, and Docker/CI. G1–G6 and G12 are resolved.

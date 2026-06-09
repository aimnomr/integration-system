# Decision Log

Records the *why* behind key design choices, so future readers (and the original
author) don't have to re-derive them. Newest decisions first.

> Dates are approximate where the decision predates this log. The log was started
> 2026-05-16.

---

## Database is the single source of truth for the fleet definition

- **Date:** 2026-05-17
- **Decision:** The fleet definition (fleet-wide VDA5050 identity + the robot roster)
  lives **only in the database** — the `fleet_config` and `robots` tables. The
  `robots.config.json` file is deleted. FastAPI's `RobotRegistry` loads the fleet from
  the DB at startup; the ROS Bridge Service fetches it from FastAPI's new `GET /fleet`
  endpoint at startup. A new `fleet_config` single-row table holds `interfaceName`,
  `majorVersion`, `version`, `manufacturer`; `robots.manufacturer` was dropped (it is
  fleet-level, not per-robot).
- **Why:** Previously the fleet was defined in `robots.config.json` *and* duplicated as
  a hand-copied seed in the DB `robots` table. Two sources drift apart and cause data
  discrepancies. Consolidating on the database gives one authoritative source that
  every service refers to.
- **Why via FastAPI for the ROS Bridge:** the ROS Bridge is a Node service with no
  database dependency. Rather than add a Postgres driver to it, it fetches the fleet
  over HTTP from FastAPI (which already owns DB access) — consistent with how Node-RED
  already talks to FastAPI for `/ingest/*`.
- **Trade-off:** start order is now constrained — PostgreSQL must be up before FastAPI
  (FastAPI loads the fleet at boot and will not start without it), and FastAPI before
  the ROS Bridge (it fetches `GET /fleet`). These are startup dependencies, not
  retried. Documented in [setup.md](setup.md).
- **Status:** Implemented — `schema.sql`/`DATABASE_SCHEMA.md`, `app/robots.py`,
  `app/db.py`, `app/routers/fleet.py`, ROS Bridge `index.js`/`fleetManager.js`.
  `robots.config.json` + `robots.config.example.json` deleted. Not yet runtime-tested.

---

## Fully normalized relational database schema

- **Date:** 2026-05-17
- **Decision:** Rewrite the database schema as a fully normalized, 1NF-strict, BCNF
  relational design — 14 tables. VDA5050's variable-length arrays (`nodes`, `edges`,
  `actions`, `nodeStates`, `actionStates`, `errors`) become child tables with foreign
  keys instead of JSONB columns. The JSONB `order_log` table is replaced by `orders` +
  `order_nodes` + `order_edges` and `instant_action_messages` + `instant_actions`; the
  JSONB columns on `state_snapshots` are replaced by `state_node_states`,
  `state_action_states`, and `state_errors`. Every log table's `serial_number` is now a
  real foreign key to `robots`.
- **Why:** Storing VDA5050 arrays as JSONB packs repeating groups into one column,
  which violates 1NF. A normalized schema is correct relational design and makes the
  data queryable per node / action / error without JSON operators — appropriate for an
  FYP that is partly graded on database modelling.
- **Trade-off:** Persisting one `state` message becomes a multi-row transaction (one
  snapshot + N child rows); `state_node_states` is the fastest-growing table. Accepted
  for the FYP scope and documented in [schema/DATABASE_SCHEMA.md](schema/DATABASE_SCHEMA.md).
- **Status:** Implemented — `docs/schema/DATABASE_SCHEMA.md` and
  `fastapi-service/app/db.py` rewritten; `routers/ingest.py` and `node-red/flows.json`
  unchanged (the DB layer absorbs the schema change). Not yet runtime-tested.

---

## Node-RED persists via the FastAPI `/ingest/*` API

- **Date:** 2026-05-17
- **Decision:** Node-RED writes telemetry to PostgreSQL by HTTP-POSTing each message to
  FastAPI `/ingest/*` endpoints, rather than holding its own database connection.
- **Why:** No PostgreSQL Node-RED contrib node is installed; depending on an
  uninstalled node would leave the flow with broken nodes. POSTing keeps the SQL in one
  testable place (`fastapi-service/app/db.py`) and uses only core Node-RED nodes.
- **Trade-off:** Telemetry persistence makes one extra hop through FastAPI. The rate is
  low (`state` on change + 5 s heartbeat), so this is negligible.
- **Status:** Implemented — refinement of migration plan §5.3.

---

## Per-robot MQTT client in the ROS Bridge Service

- **Date:** 2026-05-17
- **Decision:** Each `Robot` owns its own MQTT client, rather than the fleet sharing one.
- **Why:** MQTT permits only one Last-Will per connection. The VDA5050 `connection`
  topic needs a per-robot retained `CONNECTIONBROKEN` Will, which is only possible with
  a client per robot. It also gives cleaner per-robot isolation.
- **Status:** Implemented — deviation from migration plan §5.1.

---

## VDA5050 adoption

- **Date:** 2026-05-16 (decided) / 2026-05-17 (implemented)
- **Decision:** Re-architect the system so its communication model reflects the
  VDA5050 standard (the MQTT-based FMS ↔ AGV interface), and structure the codebase to
  scale from one robot to many. The legacy `amr/*` scheme was replaced entirely.
- **Why:** VDA5050 is the industry-standard AGV/AMR fleet interface; aligning with it
  makes the project credible and fleet-ready. VDA5050's per-robot topic namespace
  means the standard-alignment work and the multi-robot work are largely the same.
- **Status:** Implemented (Phases 0–7) — see
  [plans/vda5050-migration.md](plans/vda5050-migration.md). A structural subset of
  VDA5050 2.0.0; documented deviations (battery omitted, custom retry/skip) are in that
  plan's §8.

---

## Service code split into modules

- **Decision:** Both services are split into modules — `ros-bridge-service` into `src/`
  classes (`FleetManager`, `Robot`, `RosConnection`, `OrderStateMachine`,
  `StateBuilder`, …); `fastapi-service` into an `app/` package (`robots`, `vda5050`,
  `mqtt`, `db`, `schemas`, `routers/`).
- **Why:** Separation of concerns, testability, and a clean dependency graph (no
  cycles). The class-based ROS Bridge structure is also the multi-robot primitive — one
  `Robot` instance per robot. See
  [services/ros-bridge-service.md](services/ros-bridge-service.md) and
  [services/fastapi-service.md](services/fastapi-service.md).
- **Status:** Implemented.

---

## `amr/cmd/raw` envelope + Node-RED routing — SUPERSEDED

- **Decision (original):** FastAPI published commands as a raw envelope to
  `amr/cmd/raw`; Node-RED validated and fanned it out to typed topics.
- **Status:** **Superseded by the VDA5050 adoption (2026-05-17).** FastAPI now builds
  and publishes VDA5050 `order` / `instantActions` directly to per-robot topics;
  Node-RED is no longer in the command path. Kept here for the historical record.

---

## MQTT QoS levels

- **Decision:** VDA5050 QoS — `order` / `instantActions` / `state` = QoS 0;
  `connection` = QoS 1 and retained.
- **Why:** This follows the VDA5050 spec — high-rate topics use QoS 0; `connection` is
  QoS 1 + retained so a late subscriber immediately learns robot liveness and the
  broker can emit the `CONNECTIONBROKEN` Last-Will.
- **Status:** Implemented. *(The legacy scheme used QoS 2 for `amr/cmd/raw`; that topic
  no longer exists.)*

---

## `robot/` → `amr/` rename

- **Decision:** All topics and the REST namespace were renamed from `robot/*` to
  `amr/*` (e.g. `robot/cmd/raw` → `amr/cmd/raw`).
- **Why:** Consistency — the project is an *AMR* integration system.
- **Consequence:** Documentation referencing `robot/teleop`, `robot/cmd/raw`, etc. is
  obsolete. If you find such references, they predate this rename.
- **Status:** Implemented.

---

## MQTT as the central backbone

- **Decision:** All services communicate through a Mosquitto MQTT broker rather than
  calling each other directly.
- **Why:** Decoupling — each service can be started, stopped, and restarted
  independently; publish/subscribe allows multiple consumers (e.g. logging taps)
  without changing publishers; MQTT QoS provides delivery guarantees.
- **Status:** Implemented.

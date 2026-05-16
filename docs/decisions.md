# Decision Log

Records the *why* behind key design choices, so future readers (and the original
author) don't have to re-derive them. Newest decisions first.

> Dates are approximate where the decision predates this log. The log was started
> 2026-05-16.

---

## VDA5050 adoption (planned)

- **Date:** 2026-05-16
- **Decision:** Re-architect the system so its communication model reflects the
  VDA5050 standard (the MQTT-based FMS ↔ AGV interface), and structure the codebase to
  scale from one robot to many.
- **Why:** VDA5050 is the industry-standard AGV/AMR fleet interface; aligning with it
  makes the project credible and fleet-ready. VDA5050's per-robot topic namespace
  means the standard-alignment work and the multi-robot work are largely the same.
- **Status:** Planned — see [../plans/vda5050-migration.md](../plans/vda5050-migration.md).

---

## Service code split into modules

- **Decision:** `ros-bridge-service` logic moved from a monolithic `index.js` into
  `src/` modules (`mqttClient`, `rosConnection`, `odomBridge`, `navigation`);
  `fastapi-service` moved into an `app/` package (`mqtt`, `schemas`, `data`,
  `routers/`).
- **Why:** Separation of concerns, testability, and a clean dependency graph (no
  cycles). See [services/ros-bridge-service.md](services/ros-bridge-service.md) and
  [services/fastapi-service.md](services/fastapi-service.md).
- **Status:** Implemented.

---

## `amr/cmd/raw` envelope + Node-RED routing

- **Decision:** FastAPI publishes commands as a single raw envelope
  (`{ "command": ..., "payload": ... }`) to `amr/cmd/raw`; Node-RED validates and fans
  it out to typed topics (`amr/cmd/goal`, `amr/cmd/waypoints`, `amr/cmd/cancel`).
- **Why:** One validation/routing point instead of FastAPI knowing every downstream
  topic. Keeps FastAPI thin.
- **Trade-off:** Node-RED sits in the command path. Retry/skip and connect/disconnect
  carry no payload to validate, so they **bypass** Node-RED (FastAPI → bridge direct).
- **Status:** Implemented. *(Note: the VDA5050 plan removes this routing layer.)*

---

## MQTT QoS levels

- **Decision:** `amr/cmd/raw` = QoS 2; command/state topics = QoS 1;
  `amr/state/nav/progress` = QoS 0.
- **Why:** Commands must be **exactly-once** — a double-executed navigation command is
  unsafe (QoS 2). State topics tolerate duplicates but not loss (QoS 1). Nav progress
  is high-rate and lossy-tolerant — the next message supersedes it (QoS 0).
- **Status:** Implemented.

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

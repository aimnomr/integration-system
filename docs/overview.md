# Project Overview

## What this project is

The **AMR (Autonomous Mobile Robot) Integration System** is a full-stack fleet
console for a ROS-based mobile robot. It uses MQTT as the central messaging
backbone, so each component is decoupled and independently runnable.

The system speaks the **VDA5050** standard — the open MQTT interface between a fleet
management system (FMS) and AGVs/AMRs — and is fleet-capable (one robot → many).

The **React frontend** is the operator console. It sends HTTP commands to FastAPI
(which acts as the FMS gateway and publishes VDA5050 `order` / `instantActions`
over MQTT to a Node.js ROS bridge that translates them into ROS actions),
subscribes to live VDA5050 `state` / `connection` over MQTT-over-WebSockets, and
talks **directly to each robot's rosbridge** for the high-frequency lane
(occupancy grid, camera, teleop). Robot state flows back as VDA5050 messages,
which FastAPI's own MQTT subscriber ingests and persists to PostgreSQL.

## The components

- **React Frontend** — Vite + React 19 + TS operator console. Dashboard, Robot
  Detail (live map), Dispatch, Teleop (camera + keyboard pad), Order History,
  OEE, Admin CRUD, Health. See [services/frontend.md](services/frontend.md).
- **FastAPI Service** — FMS gateway; builds & publishes VDA5050 messages, serves
  state / OEE / order history, **subscribes the telemetry topics over MQTT and
  persists `state`/`connection`/command-audit/OEE to PostgreSQL**, exposes
  reference-data CRUD.
- **Mosquitto** — MQTT broker; the central message bus. TCP on `:1883` (backend
  services) + WebSocket on `:9001` (browser frontend).
- **Node-RED** — passive viewer / dev tool; subscribes the VDA5050 telemetry
  topics for live display only (no DB writes since 2026-06-09). Hosts a DB Admin
  tab for schema reset + ad-hoc SQL. The stack functions with it off.
- **ROS Bridge Service** — per-robot VDA5050 ↔ ROS bridge over rosbridge.

PostgreSQL provides persistent storage (state, connection, command audit, OEE,
reference data).

## Knowledge base map

| Doc | Purpose |
|---|---|
| [architecture.md](architecture.md) | How the services connect; message pathways |
| [setup.md](setup.md) | Prerequisites and how to run everything |
| [status.md](status.md) | What is implemented |
| [gaps.md](gaps.md) | What is not yet addressed — flagged gaps |
| [CONTINUATION.md](CONTINUATION.md) | Handoff snapshot — where we left off, what's next |
| [decisions.md](decisions.md) | Why key design choices were made |
| [glossary.md](glossary.md) | Domain terms (AMR, AMCL, rosbridge, OEE, …) |
| [services/](services/) | Per-service reference docs (FastAPI, ROS Bridge, Node-RED, frontend) |
| [schema/](schema/) | Contract definitions — REST, MQTT, ROS, database |
| [convention/](convention/) | Documentation format standards |
| [plans/](plans/) | Forward-looking refactor/migration plans |
| [postman/](postman/) | Newman smoke-test collection + runner |
| [testing.md](testing.md) | What to run to verify the stack — automation + manual |
| [manual-test-checklist.md](manual-test-checklist.md) | Long-form regression checklist (phase-ordered, with `[auto:]` tags) |
| [manual-test-by-service.md](manual-test-by-service.md) | The leftover manual items re-grouped by service (random spot-checks) |
| [manual-test-remarks.md](manual-test-remarks.md) | Consolidated remarks from past walkthroughs — items flagged "unsure", "stuck", or "bug" with clarifications + gap pointers |
| [old-interface/](old-interface/) | Reference notes from the previous single-robot UI |

New here? Read this page → [architecture.md](architecture.md) → [setup.md](setup.md).

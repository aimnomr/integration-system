# Project Overview

## What this project is

The **AMR (Autonomous Mobile Robot) Integration System** is middleware that bridges a
ROS-based mobile robot to external REST clients. It uses MQTT as the central messaging
backbone across four services, so each service is decoupled and independently
runnable.

The system speaks the **VDA5050** standard — the open MQTT interface between a fleet
management system (FMS) and AGVs/AMRs — and is fleet-capable (one robot → many).

An external client (e.g. a React frontend) sends HTTP commands to a FastAPI service,
which acts as the FMS gateway: it builds VDA5050 `order` / `instantActions` messages
and publishes them over MQTT to a Node.js ROS bridge that translates them into ROS
actions. Robot state flows back as VDA5050 `state` / `connection` messages, which
Node-RED ingests and persists to PostgreSQL.

## The four services

- **FastAPI Service** — FMS gateway; builds & publishes VDA5050 messages, serves
  state/OEE, ingests telemetry.
- **Mosquitto** — MQTT broker; the central message bus.
- **Node-RED** — telemetry sink; ingests `state`/`connection`, audits commands,
  derives OEE, persists to PostgreSQL.
- **ROS Bridge Service** — per-robot VDA5050 ↔ ROS bridge over rosbridge.

PostgreSQL provides persistent storage (state, connection, command audit, OEE).

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
| [services/](services/) | Per-service reference docs |
| [schema/](schema/) | Contract definitions — REST, MQTT, ROS, database |
| [convention/](convention/) | Documentation format standards |
| [plans/](plans/) | Forward-looking refactor/migration plans |

New here? Read this page → [architecture.md](architecture.md) → [setup.md](setup.md).

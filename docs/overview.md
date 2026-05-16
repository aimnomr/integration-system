# Project Overview

## What this project is

The **AMR (Autonomous Mobile Robot) Integration System** is middleware that bridges a
ROS-based mobile robot to external REST clients. It uses MQTT as the central messaging
backbone across four services, so each service is decoupled and independently
runnable.

An external client (e.g. a React frontend) sends HTTP commands to a FastAPI service,
which routes them through MQTT → Node-RED → MQTT → a Node.js ROS bridge that
translates them into ROS actions/topics. Robot state flows back the other way, to be
stored in PostgreSQL.

## The four services

- **FastAPI Service** — REST gateway; turns HTTP requests into MQTT command messages.
- **Mosquitto** — MQTT broker; the central message bus.
- **Node-RED** — validates and routes command messages; handles state/health/oee.
- **ROS Bridge Service** — Node.js bridge translating MQTT ↔ ROS over rosbridge.

(PostgreSQL is planned for persistence but not yet integrated.)

## Knowledge base map

| Doc | Purpose |
|---|---|
| [architecture.md](architecture.md) | How the services connect; message pathways |
| [setup.md](setup.md) | Prerequisites and how to run everything |
| [status.md](status.md) | What is implemented |
| [gaps.md](gaps.md) | What is not yet addressed — flagged gaps G1–G14 |
| [decisions.md](decisions.md) | Why key design choices were made |
| [glossary.md](glossary.md) | Domain terms (AMR, AMCL, rosbridge, OEE, …) |
| [services/](services/) | Per-service reference docs |
| [schema/](schema/) | Contract definitions — REST, MQTT, ROS, database |
| [convention/](convention/) | Documentation format standards |
| [plans/](plans/) | Forward-looking refactor/migration plans |

New here? Read this page → [architecture.md](architecture.md) → [setup.md](setup.md).

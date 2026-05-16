# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git
No need to do git commands since the user will push it himself using github desktop.

## Project Overview

This is an **AMR (Autonomous Mobile Robot) Integration System** — middleware that
bridges a ROS-based mobile robot to external REST clients, using MQTT as the central
messaging backbone across four services (FastAPI, Mosquitto, Node-RED, ROS Bridge
Service).

## Knowledge Base

All project documentation lives under `docs/`. Start at
[`docs/overview.md`](docs/overview.md).

| Topic | Doc |
|---|---|
| What the project is + doc map | `docs/overview.md` |
| How services connect, message pathways | `docs/architecture.md` |
| Prerequisites and how to run everything | `docs/setup.md` |
| What is implemented | `docs/status.md` |
| Gaps not yet addressed (G1–G14) | `docs/gaps.md` |
| Why key design choices were made | `docs/decisions.md` |
| Domain terms | `docs/glossary.md` |
| Per-service reference | `docs/services/` |
| Contracts — REST, MQTT, ROS, database | `docs/schema/` |
| Documentation format standards | `docs/convention/` |
| Forward-looking plans (e.g. VDA5050) | `docs/plans/` |

## Source of Truth

Contract definitions live in `docs/schema/` — **always update these when adding
endpoints or topics**:
- `docs/schema/REST_ENDPOINTS.md` — REST API
- `docs/schema/MQTT_TOPICS.md` — MQTT topics
- `docs/schema/ROS_TOPICS.md` — ROS topics exposed by the robot
- `docs/schema/DATABASE_SCHEMA.md` — PostgreSQL schema

Documentation format standards are in `docs/convention/`.

## Key Design Points

- `amr/cmd/raw` is QoS 2 (exactly-once) — carries `{ "command": "...", "payload": {...} }`.
- Node-RED routes `amr/cmd/raw` to 3 typed topics (`amr/cmd/goal`, `amr/cmd/waypoints`,
  `amr/cmd/cancel`); `waypoints/retry`, `waypoints/skip`, and `system/*` bypass Node-RED.
- `amr/state/odom` is published on distance (>0.05 m) or heading (>5°) change, plus a
  5 s heartbeat.

There is no docker-compose, unified launcher, or test/lint commands. See
`docs/setup.md` to run the services.

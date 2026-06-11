# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git
No need to do git commands since the user will push it himself using github desktop.

## Project Overview

This is an **AMR (Autonomous Mobile Robot) Integration System** — full-stack
fleet console for ROS-based mobile robots, speaking VDA5050 over MQTT. Five
components: a React frontend (operator console) on top of four backend
services (FastAPI, Mosquitto, Node-RED, ROS Bridge Service), with PostgreSQL
for persistence.

## Knowledge Base

All project documentation lives under `docs/`, organised by audience. Start at
[`docs/README.md`](docs/README.md).

| Audience / topic | Doc |
|---|---|
| Doc map + audience router | `docs/README.md` |
| **User guide** (run as-is): quickstart, `.env` config, console tour, connecting a robot, troubleshooting | `docs/user-guide/` |
| **Getting started** (beginners): introduction, concepts/glossary, architecture tour, manual dev setup | `docs/getting-started/` |
| **Reference** (advanced): architecture, per-service internals, decisions, failure matrix, testing, Docker cheatsheet | `docs/reference/` |
| Contracts — REST, MQTT, VDA5050, ROS, database | `docs/schema/` |
| Newman API smoke suite (collection + runner) | `docs/postman/` |
| PowerShell integration scripts | `scripts/test/` (+ `scripts/test/README.md`) |
| Playwright E2E suite (frontend, non-robot) | `frontend/tests/e2e/` (+ `frontend/tests/README.md`) |
| The React frontend itself | `frontend/` (see `frontend/README.md`) |
| Thesis-writing snapshot (NOT project docs — don't update with code changes) | `thesis/` |

## Source of Truth

Contract definitions live in `docs/schema/` — **always update these when adding
endpoints or topics**:
- `docs/schema/REST_ENDPOINTS.md` — REST API
- `docs/schema/MQTT_TOPICS.md` — MQTT topics
- `docs/schema/VDA5050_MESSAGES.md` — VDA5050 message schemas
- `docs/schema/ROS_TOPICS.md` — ROS topics exposed by the robot
- `docs/schema/DATABASE_SCHEMA.md` — PostgreSQL schema

`docs/schema/schema.sql` is mounted by `docker-compose.yml` as the Postgres
init script and `docs/postman/` is wired into CI — do not move or rename
either path.

## Documents update

- When fixing a user-facing problem, add/refresh the matching entry in
  `docs/user-guide/troubleshooting.md`.
- Keep docs free of session-log content (dates of work, "last updated"
  narratives, open-bug trackers) — docs describe the system as it is.

## Key Design Points

- The fleet definition lives **in the database** (`fleet_config` + `robots`);
  FastAPI loads it at startup, the ROS Bridge fetches it via `GET /fleet`.
  Start order: Postgres → FastAPI → ROS Bridge.
- Per-robot VDA5050 topics: `amr/v2/moverobotic/{serialNumber}/{order|instantActions|state|connection}`.
  `order`/`instantActions`/`state` are QoS 0; `connection` is QoS 1 + retained with a `CONNECTIONBROKEN` Last-Will.
- The `state` message publishes on significant change (>0.05 m, >5°, order/error change) plus a 5 s heartbeat.
- FastAPI is the sole telemetry ingester (its own MQTT subscriber persists to
  PostgreSQL); Node-RED is an optional passive viewer.

Services can be started manually (or via `start-all.ps1`) for development, or
brought up together with `docker compose up --build` — Docker is a supported run
and deployment path. Tests are per-service: `npm test` (ROS Bridge, `node:test`)
and `pytest` (FastAPI). See `docs/reference/testing.md`.

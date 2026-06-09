# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git
No need to do git commands since the user will push it himself using github desktop.

## Documents update
Need to update the gaps.md immediately when problem is solved
Need to update CONTINUATION.md before ending session

## Project Overview

This is an **AMR (Autonomous Mobile Robot) Integration System** — full-stack
fleet console for a ROS-based mobile robot, using MQTT as the central messaging
backbone. Five components: a React frontend (operator console) on top of four
backend services (FastAPI, Mosquitto, Node-RED, ROS Bridge Service).

## Knowledge Base

All project documentation lives under `docs/`. Start at
[`docs/overview.md`](docs/overview.md).

| Topic | Doc |
|---|---|
| What the project is + doc map | `docs/overview.md` |
| How services connect, message pathways | `docs/architecture.md` |
| Prerequisites and how to run everything | `docs/setup.md` |
| Docker command cheatsheet (dev → deployment) | `docs/docker-cheatsheet/` |
| What is implemented | `docs/status.md` |
| Gaps tracker (G24–G27 open as of 2026-05-22) | `docs/gaps.md` |
| Handoff snapshot — recent work + current state | `docs/CONTINUATION.md` |
| Why key design choices were made | `docs/decisions.md` |
| Domain terms | `docs/glossary.md` |
| Per-service reference (FastAPI, ROS Bridge, Node-RED, frontend) | `docs/services/` |
| Contracts — REST, MQTT, ROS, database | `docs/schema/` |
| Documentation format standards | `docs/convention/` |
| Forward-looking plans (e.g. VDA5050) | `docs/plans/` |
| **How to verify the stack — automation + manual** | `docs/testing.md` |
| Newman API smoke suite (collection + runner) | `docs/postman/` |
| PowerShell integration scripts | `scripts/test/` (+ `scripts/test/README.md`) |
| Playwright E2E suite (frontend, non-robot) | `frontend/tests/e2e/` (+ `frontend/tests/README.md`) |
| Long-form regression checklist (phase-ordered, with `[auto:]` tags) | `docs/manual-test-checklist.md` |
| Leftover manual items grouped by service | `docs/manual-test-by-service.md` |
| Walkthrough remarks — items flagged "unsure" or "bug", with clarifications | `docs/manual-test-remarks.md` |
| Reference notes from the previous single-robot UI | `docs/old-interface/` |
| The React frontend itself | `frontend/` (see `frontend/README.md`) |

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

Services can be started manually (or via `start-all.ps1`) for development, or
brought up together with `docker compose up --build` — Docker is a supported run
and deployment path. The root `docker-compose.yml` and per-service `Dockerfile`s
also back the CI Newman smoke job. Tests are per-service: `npm test` (ROS Bridge,
`node:test`) and `pytest` (FastAPI). See `docs/setup.md`.



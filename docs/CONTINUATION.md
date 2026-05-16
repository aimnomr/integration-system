# Continuation Notes — Where We Left Off

> A point-in-time handoff snapshot so work can resume without re-deriving context.
> **This decays** — trust the code and the canonical docs over this page.
> Last updated: 2026-05-17.

---

## Recently completed (most recent first)

1. **Node-RED Test Harness tab** added to `node-red/flows.json` — inject nodes that
   publish to the MQTT command topics directly, plus debug nodes for the outbound
   topics. Lets you exercise the whole pipeline without FastAPI.
2. **G12 — structured logging** applied: JSON-line logs in the ROS Bridge Service
   (`src/logger.js`) and FastAPI (`app/logging_config.py` + request middleware).
3. **G1 / G2 / G3 — navigation feedback + outbound topics** implemented in
   `ros-bridge-service`:
   - New modules: `navFeedback.js`, `poseBridge.js`, `health.js`, `logger.js`.
   - Waypoint sequences now auto-advance on a `SUCCEEDED` move_base result.
   - Bridge now publishes `amr/state/pose`, `amr/state/nav/status`,
     `amr/state/nav/progress`, `amr/health/connection`, `amr/health/error`.
   - `amr/health/battery` was **dropped project-wide** (the robot has no battery
     ROS topic).
4. **`ROS_TOPICS.md`** now records both launch-mode topic sets (`mapping:=true`
   SLAM vs `mapping:=false` localization — the latter exposes `/amcl_pose`).
5. **Documentation overhaul** — all docs reorganised under `docs/`
   (`overview`, `architecture`, `setup`, `status`, `gaps`, `decisions`, `glossary`,
   `services/`, `schema/`, `convention/`, `plans/`); added `README.md`,
   `DATABASE_SCHEMA.md`, and per-service docs; removed stale files.
6. **VDA5050 migration plan** written → `docs/plans/vda5050-migration.md`.

## Current state

- The ROS Bridge Service publishes the full outbound topic set and auto-advances
  waypoints. Verified live: `amr/state/pose` works with the robot in `mapping:=false`.
- All changed code is **syntax-checked only** — not yet integration-tested end to end
  (beyond the pose check). Use the Test Harness tab to exercise it.
- Resolved gaps: **G1, G2, G3, G12**. See `docs/gaps.md` for the rest.

## Next steps

1. **Restart Node-RED** to load the new Test Harness tab, then run each inject and
   confirm the pipeline behaves (esp. waypoint auto-advance: `nav/progress` 0→1→2).
2. **Pending decisions** (proposals already given, awaiting a choice):
   - G11 — rate limiting (`slowapi` proposed).
   - G13 — tests (per-service `pytest` / `node:test` proposed).
   - G9 — committed `.env.example` files.
3. **Open gaps** (`docs/gaps.md`): G4–G11, G13, G14. The unblocker is **G4
   (PostgreSQL)** — it gates G5 and G6.
4. **VDA5050 migration** — plan is ready but not started; recommended entry point is
   Phase 1 (the `Robot` class refactor). One open item: §9-B (`mapId` value).

## Watch out for

- **Nothing has been committed** — the user pushes via GitHub Desktop.
- Node-RED still contains an **orphaned `handleBattery` tab** — `amr/health/battery`
  was dropped; the tab can be deleted as cleanup.
- The Test Harness edits `flows.json` directly; Node-RED must be restarted (a running
  instance would overwrite the file on its next deploy).

## Canonical docs

[overview.md](overview.md) · [architecture.md](architecture.md) ·
[status.md](status.md) · [gaps.md](gaps.md) ·
[plans/vda5050-migration.md](plans/vda5050-migration.md)

# Continuation Notes — Where We Left Off

> A point-in-time handoff snapshot so work can resume without re-deriving context.
> **This decays** — trust the code and the canonical docs over this page.
> Last updated: 2026-05-17.

---

## Recently completed (most recent first)

**The VDA5050 migration is fully implemented — Phases 0–7 done** (see
[plans/vda5050-migration.md](plans/vda5050-migration.md)). The project has moved off
the legacy `amr/*` scheme entirely; it now speaks VDA5050 end to end and is
multi-robot capable.

1. **Phase 0** — `docs/schema/VDA5050_MESSAGES.md`; `ros-bridge-service/robots.config.json`.
2. **Phase 1** — `ros-bridge-service` refactored into `Robot` + `FleetManager` classes.
3. **Phases 2 & 3** — `ros-bridge-service` rewritten for VDA5050: `vda5050.js`,
   `orderStateMachine.js`, `stateBuilder.js`; `Robot` subscribes `order`/
   `instantActions`, publishes `state`/`connection` (retained, `CONNECTIONBROKEN`
   Last-Will). `navigation.js`/`navFeedback.js`/`health.js` deleted. Per-robot MQTT
   client.
4. **Phase 4** — `fastapi-service` is the FMS gateway: `app/robots.py`, `app/vda5050.py`,
   robot-scoped routes; `routers/amr.py` deleted; `requirements.txt` added.
5. **Phase 5** — `node-red/flows.json` rewritten: Telemetry Ingestion, Command Audit,
   OEE, Test Harness tabs. Persists via HTTP POST to FastAPI `/ingest/*`.
6. **Phase 6** — `docs/schema/DATABASE_SCHEMA.md` rewritten serial-keyed; FastAPI
   `app/db.py` (lazy psycopg2) + `routers/ingest.py`.
7. **Phase 7** — `robots.config.example.json`; all schema docs + `architecture.md`,
   `status.md`, `gaps.md` updated.
8. **Knowledge-base sync** — `README.md`, `overview.md`, `setup.md`, `decisions.md`,
   `glossary.md`, all three `docs/services/*.md`, and the project memory updated to the
   VDA5050 implementation.

## Current state

- **Code-complete and syntax-checked, NOT end-to-end runtime-tested.**
  - ros-bridge-service: all files `node --check` + module-graph import OK.
  - fastapi-service: all files `py_compile` OK; registry + VDA5050 builders run-tested.
  - node-red/flows.json: valid JSON, node-graph integrity OK (36 nodes, 4 tabs).
- Resolved gaps: G1–G6, G12. Open: G7–G11, G13, G14 ([gaps.md](gaps.md)).

---

## ▶ NEXT SESSION: full database normalization (decided, not started)

The Phase 6 schema is **not fully normalized** — `state_snapshots` and `order_log`
store VDA5050 arrays as **JSONB**, which is a 1NF violation. **Decision (2026-05-17):
rewrite it as a fully normalized, 1NF-strict, BCNF relational schema — 14 tables**,
with real foreign keys (telemetry tables FK to `robots`).

### Target — 14 tables

| Group | Tables |
|---|---|
| Reference (3) | `maps`, `robots`, `named_locations` — already clean, keep |
| Orders (3) | `orders` (header), `order_nodes` (FK→orders; `nodePosition` flattened in), `order_edges` (FK→orders) |
| Instant actions (2) | `instant_action_messages` (header), `instant_actions` (FK→message) |
| State (4) | `state_snapshots` (scalar fields only), `state_node_states`, `state_action_states`, `state_errors` (all FK→snapshot) |
| Connection + OEE (2) | `connection_log`, `oee_cycles` — already scalar, keep |

- `orders` + `order_nodes` + `order_edges` and `instant_action_messages` +
  `instant_actions` **replace the JSONB `order_log` table**.
- `state_node_states` / `state_action_states` / `state_errors` **replace the JSONB
  columns** in `state_snapshots`.
- `nodePosition` is a 1:1 sub-object → flatten into `order_nodes` columns
  (`pos_x, pos_y, theta, map_id`), not its own table.
- VDA5050 subset note: order/edge `actions[]`, state `edgeStates[]` and
  `actionParameters[]` are empty in this project — no tables for them; document.
- Accepted trade-off: each `state` message becomes a multi-row transaction
  (1 snapshot + N node-states + …). `state_node_states` is the fastest-growing table.
  Fine for the FYP; documented.

### Files to change

1. `docs/schema/DATABASE_SCHEMA.md` — rewrite for the 14-table schema (drop the JSONB
   columns and `order_log`; add the child tables; keep FKs).
2. `fastapi-service/app/db.py` — the write helpers become **multi-table transactions**:
   - `insert_state()` → insert `state_snapshots` row, get its id, insert child rows for
     `nodeStates`/`actionStates`/`errors` — all in one transaction.
   - `insert_command()` → split: an `order` writes `orders` + `order_nodes` +
     `order_edges`; an `instantActions` writes `instant_action_messages` +
     `instant_actions`.
   - `fetch_latest_state()` → join the child tables back into the response shape.
   - `fetch_oee_*` — unchanged.
3. `fastapi-service/app/routers/ingest.py` — no change expected (it just forwards the
   VDA5050 messages; the DB layer absorbs the schema change).
4. `node-red/flows.json` — **no change** (it POSTs VDA5050 messages; persistence shape
   is FastAPI's concern).
5. Update `docs/decisions.md` (add the normalization decision) and `gaps.md` if needed.

### Other pending next steps (after normalization)

- **Runtime-test the pipeline** — needs MQTT broker, rosbridge + a robot, PostgreSQL:
  `pip install -r fastapi-service/requirements.txt`; create the DB + apply the schema;
  start all services; `POST /robots/amr001/order`; verify auto-advance, instant
  actions, and the retained `CONNECTIONBROKEN`.
- Address open gaps G7–G11, G13, G14 ([gaps.md](gaps.md)).

## Watch out for

- **Nothing has been committed** — the user pushes via GitHub Desktop.
- **Node-RED userDir** — Node-RED defaults to `C:\Users\aimno\.node-red\` (old April
  flows). Start it with `node-red --userDir "d:\FYP\integration-system\node-red"`, and
  fully stop any old instance first or it overwrites `flows.json` on deploy.
- `ros-bridge-service/.env` still has `ROSBRIDGE_URL` — **unused**; the URL is now in
  `robots.config.json`. `MQTT_BROKER`, `NAV_GOAL_TOPIC`, `CANCEL_TOPIC` still used.
- FastAPI needs DB env vars when PostgreSQL is up: `DB_HOST`, `DB_PORT`, `DB_NAME`,
  `DB_USER`, `DB_PASSWORD` (defaults: localhost / 5432 / amr_integration / postgres).
- Node-RED's `/ingest/*` calls assume FastAPI at `http://localhost:8000`.
- `mapId` is the placeholder `"default"` — set it to the real map name in
  `robots.config.json` once one is established.

## Canonical docs

[overview.md](overview.md) · [architecture.md](architecture.md) ·
[status.md](status.md) · [gaps.md](gaps.md) ·
[plans/vda5050-migration.md](plans/vda5050-migration.md) ·
[schema/VDA5050_MESSAGES.md](schema/VDA5050_MESSAGES.md) ·
[schema/MQTT_TOPICS.md](schema/MQTT_TOPICS.md) ·
[schema/REST_ENDPOINTS.md](schema/REST_ENDPOINTS.md) ·
[schema/DATABASE_SCHEMA.md](schema/DATABASE_SCHEMA.md)

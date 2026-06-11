# Database Schema

PostgreSQL schema for the AMR Integration System. It is **VDA5050-aligned and
multi-robot**: every telemetry and log table carries a `serial_number`, so the schema
scales from one robot to a fleet without change.

> **Status:** the database is **not yet runtime-integrated** — the code paths exist
> (FastAPI's MQTT subscriber → `app/ingest_service.py` → PostgreSQL) but no live
> database has been stood up. This schema is the agreed target. It backs the VDA5050
> `state` / `connection` topics, the command audit log, and OEE.

This schema is **fully normalized — 1NF-strict and BCNF**. VDA5050's variable-length
arrays (`nodes`, `edges`, `actions`, `nodeStates`, `actionStates`, `errors`) are stored
as **child tables with foreign keys**, not JSONB. There are no repeating groups and no
multi-valued columns. (See [§ Normalization](#normalization) for the rationale and the
decision that replaced the earlier JSONB design.)

The database is the **single source of truth for the fleet definition**: `fleet_config`
+ `robots` define the fleet, and both FastAPI and the ROS Bridge Service read it from
here (the ROS Bridge via FastAPI's `GET /fleet`). There is no `robots.config.json`.

---

## TL;DR — apply it

```bash
# create the database (once)
psql -U postgres -c "CREATE DATABASE amr_integration;"

# apply / reset the schema
psql -U postgres -d amr_integration -f docs/schema/schema.sql
```

The runnable schema lives in [`schema.sql`](schema.sql) (same directory). It starts
with `DROP TABLE IF EXISTS ... CASCADE` — including the legacy pre-normalization
`order_log` table — so re-running it **resets** every table and re-seeds `fleet_config`,
`maps`, `robots`, and `named_locations`. The SQL block in [§ Schema](#schema) below is
the documentation copy of that file; **keep the two in sync**.

---

## Tables — 15 total

| # | Table | Group | Kind | Source |
|---|---|---|---|---|
| 1 | `fleet_config` | reference | seeded (single row) | fleet-wide VDA5050 identity |
| 2 | `maps` | reference | seeded | seeded |
| 3 | `robots` | reference | seeded | the fleet roster — single source of truth |
| 4 | `named_locations` | reference | seeded | read by FastAPI `/order/named` |
| 5 | `orders` | orders | append-only log | VDA5050 `order` — header |
| 6 | `order_nodes` | orders | child of `orders` | `order.nodes[]` |
| 7 | `order_edges` | orders | child of `orders` | `order.edges[]` |
| 8 | `instant_action_messages` | instant actions | append-only log | VDA5050 `instantActions` — header |
| 9 | `instant_actions` | instant actions | child of `instant_action_messages` | `instantActions.actions[]` |
| 10 | `state_snapshots` | state | append-only log | VDA5050 `state` — scalar fields |
| 11 | `state_node_states` | state | child of `state_snapshots` | `state.nodeStates[]` |
| 12 | `state_action_states` | state | child of `state_snapshots` | `state.actionStates[]` |
| 13 | `state_errors` | state | child of `state_snapshots` | `state.errors[]` |
| 14 | `connection_log` | connection | append-only log | VDA5050 `connection` topic |
| 15 | `oee_cycles` | OEE | append-only log | derived from order-completion in `state` |

### Relationships

```
fleet_config (single row — fleet identity, unreferenced)

maps ──< robots ──< (FK: serial_number) ──< orders ──< order_nodes
  │         │                                  └─────< order_edges
  └──< named_locations                  ──< instant_action_messages ──< instant_actions
                                         ──< state_snapshots ──< state_node_states
                                         │                  ├──< state_action_states
                                         │                  └──< state_errors
                                         ├──< connection_log
                                         └──< oee_cycles
```

Every log table's `serial_number` is a **real foreign key** to `robots`. The `robots`
table is seeded by this script, so a robot row always exists before any telemetry is
ingested. Child tables (`order_nodes`, `state_node_states`, …) reference their parent's
surrogate `id` with `ON DELETE CASCADE`, so deleting a snapshot or order removes its
rows atomically. `fleet_config` is reference data that no other table links to — it
holds the fleet-wide VDA5050 identity (`interfaceName`, `majorVersion`, `version`,
`manufacturer`).

---

## Schema

```sql
-- ============================================================
-- AMR Integration System — database schema (VDA5050-aligned)
-- Fully normalized: 1NF-strict, BCNF. 15 tables.
-- Re-running this script DROPS and recreates all tables.
--
-- The database is the single source of truth — both FastAPI and the ROS Bridge
-- read the fleet definition (fleet_config + robots) from here.
-- ============================================================

-- Drop children before parents (CASCADE also covers it).
DROP TABLE IF EXISTS state_node_states       CASCADE;
DROP TABLE IF EXISTS state_action_states     CASCADE;
DROP TABLE IF EXISTS state_errors            CASCADE;
DROP TABLE IF EXISTS state_snapshots         CASCADE;
DROP TABLE IF EXISTS order_nodes             CASCADE;
DROP TABLE IF EXISTS order_edges             CASCADE;
DROP TABLE IF EXISTS orders                  CASCADE;
DROP TABLE IF EXISTS instant_actions         CASCADE;
DROP TABLE IF EXISTS instant_action_messages CASCADE;
DROP TABLE IF EXISTS connection_log          CASCADE;
DROP TABLE IF EXISTS oee_cycles              CASCADE;
DROP TABLE IF EXISTS named_locations         CASCADE;
DROP TABLE IF EXISTS robots                  CASCADE;
DROP TABLE IF EXISTS maps                    CASCADE;
DROP TABLE IF EXISTS fleet_config            CASCADE;

-- Legacy table from the pre-normalization JSONB schema — dropped if present.
DROP TABLE IF EXISTS order_log               CASCADE;

-- ============================================================
-- Reference tables
-- ============================================================

-- ------------------------------------------------------------
-- 1. fleet_config — fleet-wide VDA5050 identity (single row).
-- The CHECK (id = 1) constraint enforces exactly one row.
-- ------------------------------------------------------------
CREATE TABLE fleet_config (
    id             INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    interface_name TEXT NOT NULL,
    major_version  TEXT NOT NULL,
    version        TEXT NOT NULL,
    manufacturer   TEXT NOT NULL
);

-- ------------------------------------------------------------
-- 2. maps
-- ------------------------------------------------------------
CREATE TABLE maps (
    map_id TEXT PRIMARY KEY,
    label  TEXT NOT NULL
);

-- ------------------------------------------------------------
-- 3. robots — the fleet roster (single source of truth)
--
-- archived_at supports soft-delete: when set, the row is hidden from operator
-- surfaces and rejected at ingest, but history (orders, state_snapshots,
-- oee_cycles, …) remains intact and the serial can be restored later.
-- ------------------------------------------------------------
CREATE TABLE robots (
    serial_number TEXT PRIMARY KEY,
    rosbridge_url TEXT NOT NULL,
    map_id        TEXT NOT NULL REFERENCES maps (map_id),
    archived_at   TIMESTAMPTZ                       -- NULL = active
);

CREATE INDEX idx_robots_active ON robots (serial_number) WHERE archived_at IS NULL;

-- ------------------------------------------------------------
-- 4. named_locations — named navigation targets
-- ------------------------------------------------------------
CREATE TABLE named_locations (
    id     INTEGER PRIMARY KEY,
    map_id TEXT    NOT NULL REFERENCES maps (map_id),
    label  TEXT    NOT NULL,
    x      DOUBLE PRECISION NOT NULL,
    y      DOUBLE PRECISION NOT NULL,
    theta  DOUBLE PRECISION NOT NULL DEFAULT 0   -- heading, radians, map frame
);

-- ============================================================
-- Orders — VDA5050 `order` message (header + nodes + edges)
-- ============================================================

-- ------------------------------------------------------------
-- 5. orders — one row per `order` message (header / audit tap)
-- ------------------------------------------------------------
CREATE TABLE orders (
    id              BIGSERIAL   PRIMARY KEY,
    serial_number   TEXT        NOT NULL REFERENCES robots (serial_number),
    ts              TIMESTAMPTZ NOT NULL,
    header_id       INTEGER     NOT NULL,
    order_id        TEXT        NOT NULL,
    order_update_id INTEGER     NOT NULL
);
CREATE INDEX idx_orders_serial_ts ON orders (serial_number, ts DESC);

-- ------------------------------------------------------------
-- 6. order_nodes — child of orders; nodePosition flattened in
-- ------------------------------------------------------------
CREATE TABLE order_nodes (
    id          BIGSERIAL PRIMARY KEY,
    order_pk    BIGINT  NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    node_id     TEXT    NOT NULL,
    sequence_id INTEGER NOT NULL,
    released    BOOLEAN NOT NULL,
    pos_x       DOUBLE PRECISION,
    pos_y       DOUBLE PRECISION,
    theta       DOUBLE PRECISION,
    map_id      TEXT
);
CREATE INDEX idx_order_nodes_order ON order_nodes (order_pk);

-- ------------------------------------------------------------
-- 7. order_edges — child of orders
-- ------------------------------------------------------------
CREATE TABLE order_edges (
    id            BIGSERIAL PRIMARY KEY,
    order_pk      BIGINT  NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    edge_id       TEXT    NOT NULL,
    sequence_id   INTEGER NOT NULL,
    released      BOOLEAN NOT NULL,
    start_node_id TEXT    NOT NULL,
    end_node_id   TEXT    NOT NULL
);
CREATE INDEX idx_order_edges_order ON order_edges (order_pk);

-- ============================================================
-- Instant actions — VDA5050 `instantActions` message
-- ============================================================

-- ------------------------------------------------------------
-- 8. instant_action_messages — one row per `instantActions` message
-- ------------------------------------------------------------
CREATE TABLE instant_action_messages (
    id            BIGSERIAL   PRIMARY KEY,
    serial_number TEXT        NOT NULL REFERENCES robots (serial_number),
    ts            TIMESTAMPTZ NOT NULL,
    header_id     INTEGER     NOT NULL
);
CREATE INDEX idx_instant_msg_serial_ts
    ON instant_action_messages (serial_number, ts DESC);

-- ------------------------------------------------------------
-- 9. instant_actions — child of instant_action_messages
-- ------------------------------------------------------------
CREATE TABLE instant_actions (
    id          BIGSERIAL PRIMARY KEY,
    message_pk  BIGINT NOT NULL
        REFERENCES instant_action_messages (id) ON DELETE CASCADE,
    action_id     TEXT NOT NULL,
    action_type   TEXT NOT NULL
        CHECK (action_type IN ('cancelOrder', 'retryNode', 'skipNode')),
    blocking_type TEXT NOT NULL
        CHECK (blocking_type IN ('NONE', 'SOFT', 'HARD'))
);
CREATE INDEX idx_instant_actions_message ON instant_actions (message_pk);

-- ============================================================
-- State — VDA5050 `state` message (scalar header + child arrays)
-- ============================================================

-- ------------------------------------------------------------
-- 10. state_snapshots — scalar fields of one `state` message
-- ------------------------------------------------------------
CREATE TABLE state_snapshots (
    id                     BIGSERIAL   PRIMARY KEY,
    serial_number          TEXT        NOT NULL REFERENCES robots (serial_number),
    ts                     TIMESTAMPTZ NOT NULL,
    header_id              INTEGER     NOT NULL,
    order_id               TEXT,
    order_update_id        INTEGER,
    last_node_id           TEXT,
    last_node_sequence_id  INTEGER,
    pos_x                  DOUBLE PRECISION,
    pos_y                  DOUBLE PRECISION,
    theta                  DOUBLE PRECISION,
    map_id                 TEXT,
    position_initialized   BOOLEAN,
    vel_vx                 DOUBLE PRECISION,
    vel_vy                 DOUBLE PRECISION,
    vel_omega              DOUBLE PRECISION,
    driving                BOOLEAN,
    operating_mode         TEXT,
    e_stop                 TEXT,
    field_violation        BOOLEAN
);
CREATE INDEX idx_state_serial_ts ON state_snapshots (serial_number, ts DESC);

-- ------------------------------------------------------------
-- 11. state_node_states — child of state_snapshots
-- ------------------------------------------------------------
CREATE TABLE state_node_states (
    id          BIGSERIAL PRIMARY KEY,
    snapshot_id BIGINT  NOT NULL REFERENCES state_snapshots (id) ON DELETE CASCADE,
    node_id     TEXT    NOT NULL,
    sequence_id INTEGER NOT NULL,
    released    BOOLEAN NOT NULL
);
CREATE INDEX idx_state_node_states_snapshot ON state_node_states (snapshot_id);

-- ------------------------------------------------------------
-- 12. state_action_states — child of state_snapshots
-- ------------------------------------------------------------
CREATE TABLE state_action_states (
    id            BIGSERIAL PRIMARY KEY,
    snapshot_id   BIGINT NOT NULL REFERENCES state_snapshots (id) ON DELETE CASCADE,
    action_id     TEXT NOT NULL,
    action_type   TEXT NOT NULL,
    action_status TEXT NOT NULL
);
CREATE INDEX idx_state_action_states_snapshot ON state_action_states (snapshot_id);

-- ------------------------------------------------------------
-- 13. state_errors — child of state_snapshots
-- ------------------------------------------------------------
CREATE TABLE state_errors (
    id                BIGSERIAL PRIMARY KEY,
    snapshot_id       BIGINT NOT NULL REFERENCES state_snapshots (id) ON DELETE CASCADE,
    error_type        TEXT NOT NULL,
    error_level       TEXT,
    error_description TEXT
);
CREATE INDEX idx_state_errors_snapshot ON state_errors (snapshot_id);

-- ============================================================
-- Connection + OEE
-- ============================================================

-- ------------------------------------------------------------
-- 14. connection_log — VDA5050 `connection` — robot liveness
-- ------------------------------------------------------------
CREATE TABLE connection_log (
    id               BIGSERIAL   PRIMARY KEY,
    serial_number    TEXT        NOT NULL REFERENCES robots (serial_number),
    ts               TIMESTAMPTZ NOT NULL,
    header_id        INTEGER     NOT NULL,
    connection_state TEXT        NOT NULL
        CHECK (connection_state IN ('ONLINE', 'OFFLINE', 'CONNECTIONBROKEN'))
);
CREATE INDEX idx_connection_serial_ts ON connection_log (serial_number, ts DESC);

-- ------------------------------------------------------------
-- 15. oee_cycles — derived trip cycles. duration_s is GENERATED
-- (keeps the table in BCNF — no free-standing derived column).
-- ------------------------------------------------------------
CREATE TABLE oee_cycles (
    id            BIGSERIAL   PRIMARY KEY,
    serial_number TEXT        NOT NULL REFERENCES robots (serial_number),
    ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
    order_id      TEXT        NOT NULL,
    start_time    TIMESTAMPTZ NOT NULL,
    end_time      TIMESTAMPTZ NOT NULL,
    duration_s    DOUBLE PRECISION
        GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (end_time - start_time))) STORED,
    result        TEXT        NOT NULL CHECK (result IN ('SUCCEEDED', 'ABORTED'))
);
CREATE INDEX idx_oee_serial_ts ON oee_cycles (serial_number, ts DESC);

-- ============================================================
-- Seed data
-- ============================================================
INSERT INTO fleet_config (id, interface_name, major_version, version, manufacturer)
    VALUES (1, 'amr', 'v2', '2.0.0', 'moverobotic');

INSERT INTO maps (map_id, label) VALUES
    ('default', 'Default map (placeholder — set to the real map name)');

INSERT INTO robots (serial_number, rosbridge_url, map_id) VALUES
    ('amr001', 'ws://localhost:9090', 'default');

-- theta is radians (the legacy angle.z values were degrees — converted here).
INSERT INTO named_locations (id, map_id, label, x, y, theta) VALUES
    (1, 'default', 'Charging Station',  3.094,  1.412, -2.21568),
    (2, 'default', 'Entrance',         -1.953,  2.467, -0.59145),
    (3, 'default', 'Storage Room',     -2.690, -1.583,  2.48120),
    (4, 'default', 'Home',              0.000,  0.000,  0.00000);
```

---

## Normalization

This schema replaces an earlier design that stored VDA5050's `nodeStates`,
`edgeStates`, `actionStates`, `errors`, and the whole `order` / `instantActions`
message as **JSONB columns**. JSONB columns hold repeating groups inside a single
field, which **violates 1NF**. The schema was rewritten (decision 2026-05-17, see
[../decisions.md](../decisions.md)) so every multi-valued attribute is its own table:

| Old (JSONB) | New (normalized) |
|---|---|
| `order_log` table with a `message` JSONB column | `orders` + `order_nodes` + `order_edges`, and `instant_action_messages` + `instant_actions` |
| `state_snapshots.node_states` JSONB | `state_node_states` table |
| `state_snapshots.action_states` JSONB | `state_action_states` table |
| `state_snapshots.errors` JSONB | `state_errors` table |
| `state_snapshots.edge_states` JSONB | *dropped* — always empty in this project |

**Normal-form status:**
- **1NF** — no repeating groups, no multi-valued columns; every column is atomic.
- **2NF / 3NF** — every non-key column depends on the whole key and nothing else; child
  tables carry only attributes functionally determined by their own surrogate `id`.
- **BCNF** — the only determinant in every table is its candidate key. The single
  derived value, `oee_cycles.duration_s`, is an explicit `GENERATED` column rather than
  a free-standing transitive dependency.

**`nodePosition`** is a 1:1 sub-object of an order node, not a repeating group, so it is
**flattened into `order_nodes`** (`pos_x`, `pos_y`, `theta`, `map_id`) rather than given
its own table — this avoids a needless 1:1 join.

**VDA5050 subset — tables intentionally absent:**
- `order.nodes[].actions[]` and `order.edges[].actions[]` are always `[]` in this
  project (the migration leaves order/edge actions empty), so there is **no
  `order_node_actions` table**.
- `state.edgeStates[]` is always `[]` (the bridge publishes `edgeStates: []`), so the
  old `edge_states` JSONB column is dropped with no replacement table.
- `instantActions.actions[].actionParameters[]` is always `[]`, so there is **no
  `instant_action_parameters` table**.

If any of these arrays becomes non-empty later, add the corresponding child table —
the parent tables already carry the surrogate keys to hang them off.

**Accepted trade-off:** persisting one `state` message is now a **multi-row
transaction** — one `state_snapshots` row plus N `state_node_states` rows plus the
action/error rows. `state_node_states` is the fastest-growing table. This is acceptable
for the FYP; it is documented here as a known scaling characteristic.

---

## Notes

- `ts` holds the **event** timestamp from the message header (`timestamp` field,
  ISO 8601 → `TIMESTAMPTZ`). `oee_cycles.ts` is the row-insert time.
- "Latest state" queries use `ORDER BY ts DESC LIMIT 1` on the
  `(serial_number, ts DESC)` index of `state_snapshots`, then join the child tables on
  `snapshot_id` to reassemble the VDA5050 `state` shape.
- **Retention (G19):** `state_snapshots` and `state_node_states` are the high-volume
  tables (~80–100 k snapshot rows/day per robot at the 5 s heartbeat + change triggers,
  each fanning out to several node-state rows). FastAPI runs a background task that
  every 6 h deletes `state_snapshots` and `connection_log` rows older than
  `TELEMETRY_RETENTION_DAYS` (default **30**; `0` disables it) — the child tables go via
  `ON DELETE CASCADE`. This is a row-delete policy, not range partitioning; partitioning
  (`PARTITION BY RANGE (ts)` with old partitions dropped) remains the heavier-duty option
  if the deployment outgrows it.
- Child tables use `ON DELETE CASCADE`, so deleting a snapshot or order removes its
  node/action/error rows automatically.
- Enum-like columns use `CHECK` constraints (not PostgreSQL `ENUM` types) so the script
  stays simple to drop and re-run.
- The write path is **FastAPI's MQTT subscriber → `app/ingest_service.py` →
  PostgreSQL** (the HTTP `/ingest/*` routes share the same persistence layer as a
  secondary path); reads are FastAPI `GET /robots/{serial}/state` and
  `/robots/{serial}/oee/*`. See [REST_ENDPOINTS.md](REST_ENDPOINTS.md).

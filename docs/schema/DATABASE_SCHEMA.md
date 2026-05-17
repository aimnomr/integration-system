# Database Schema

PostgreSQL schema for the AMR Integration System. It is **VDA5050-aligned and
multi-robot**: every telemetry and log table carries a `serial_number`, so the schema
scales from one robot to a fleet without change.

> **Status:** the database is **not yet runtime-integrated** — the code paths exist
> (Node-RED → FastAPI `/ingest/*` → PostgreSQL) but no live database has been stood up.
> This schema is the agreed target. It backs the VDA5050 `state` / `connection` topics,
> the command audit log, and OEE.

This schema replaces the legacy `amr/*`-shaped one. It is **BCNF**: the only derived
value, `oee_cycles.duration_s`, is an explicit `GENERATED` column rather than a
free-standing transitive dependency.

---

## TL;DR — apply it

```bash
# create the database (once)
psql -U postgres -c "CREATE DATABASE amr_integration;"

# apply / reset the schema — runs the SQL block below
psql -U postgres -d amr_integration -f schema.sql
```

The SQL in [§ Schema](#schema) starts with `DROP TABLE IF EXISTS ... CASCADE`, so
re-running it **resets** every table and re-seeds `maps`, `robots`, and
`named_locations`. Copy that block into `schema.sql`, or paste it into `psql`.

---

## Tables

| Table | Kind | Source |
|---|---|---|
| `maps` | reference | seeded |
| `robots` | reference | seeded; mirrors `ros-bridge-service/robots.config.json` |
| `named_locations` | reference | seeded; mirrors FastAPI `app/data.py` |
| `state_snapshots` | append-only log | VDA5050 `state` topic |
| `connection_log` | append-only log | VDA5050 `connection` topic |
| `order_log` | append-only log | VDA5050 `order` + `instantActions` (audit tap) |
| `oee_cycles` | append-only log | derived from order-completion in `state` |

`serial_number` on the log tables is an **indexed plain column, not a foreign key** —
so telemetry ingestion never fails if a robot publishes before its `robots` row
exists. `maps`/`robots`/`named_locations` are reference data and *are* linked by FK.

Variable-shape VDA5050 arrays (`nodeStates`, `actionStates`, `errors`, …) are stored
as `JSONB` — normalising them into child tables is unwarranted for append-only
telemetry snapshots.

---

## Schema

```sql
-- ============================================================
-- AMR Integration System — database schema (VDA5050-aligned)
-- Re-running this script DROPS and recreates all tables.
-- ============================================================

DROP TABLE IF EXISTS state_snapshots CASCADE;
DROP TABLE IF EXISTS connection_log  CASCADE;
DROP TABLE IF EXISTS order_log       CASCADE;
DROP TABLE IF EXISTS oee_cycles      CASCADE;
DROP TABLE IF EXISTS named_locations CASCADE;
DROP TABLE IF EXISTS robots          CASCADE;
DROP TABLE IF EXISTS maps            CASCADE;

-- ------------------------------------------------------------
-- Reference: maps
-- ------------------------------------------------------------
CREATE TABLE maps (
    map_id TEXT PRIMARY KEY,
    label  TEXT NOT NULL
);

-- ------------------------------------------------------------
-- Reference: robots (mirrors robots.config.json)
-- ------------------------------------------------------------
CREATE TABLE robots (
    serial_number TEXT PRIMARY KEY,
    manufacturer  TEXT NOT NULL,
    rosbridge_url TEXT NOT NULL,
    map_id        TEXT NOT NULL REFERENCES maps (map_id)
);

-- ------------------------------------------------------------
-- Reference: named navigation targets
-- ------------------------------------------------------------
CREATE TABLE named_locations (
    id     INTEGER PRIMARY KEY,
    map_id TEXT    NOT NULL REFERENCES maps (map_id),
    label  TEXT    NOT NULL,
    x      DOUBLE PRECISION NOT NULL,
    y      DOUBLE PRECISION NOT NULL,
    theta  DOUBLE PRECISION NOT NULL DEFAULT 0   -- heading, radians, map frame
);

-- ------------------------------------------------------------
-- VDA5050 `state` — consolidated robot state snapshot
-- ------------------------------------------------------------
CREATE TABLE state_snapshots (
    id                     BIGSERIAL PRIMARY KEY,
    serial_number          TEXT        NOT NULL,
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
    field_violation        BOOLEAN,
    node_states            JSONB NOT NULL DEFAULT '[]',
    edge_states            JSONB NOT NULL DEFAULT '[]',
    action_states          JSONB NOT NULL DEFAULT '[]',
    errors                 JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_state_serial_ts ON state_snapshots (serial_number, ts DESC);

-- ------------------------------------------------------------
-- VDA5050 `connection` — robot liveness
-- ------------------------------------------------------------
CREATE TABLE connection_log (
    id               BIGSERIAL PRIMARY KEY,
    serial_number    TEXT        NOT NULL,
    ts               TIMESTAMPTZ NOT NULL,
    header_id        INTEGER     NOT NULL,
    connection_state TEXT        NOT NULL
        CHECK (connection_state IN ('ONLINE', 'OFFLINE', 'CONNECTIONBROKEN'))
);
CREATE INDEX idx_connection_serial_ts ON connection_log (serial_number, ts DESC);

-- ------------------------------------------------------------
-- Command audit — every `order` and `instantActions` message
-- ------------------------------------------------------------
CREATE TABLE order_log (
    id            BIGSERIAL PRIMARY KEY,
    serial_number TEXT        NOT NULL,
    ts            TIMESTAMPTZ NOT NULL,
    kind          TEXT        NOT NULL CHECK (kind IN ('order', 'instantActions')),
    header_id     INTEGER     NOT NULL,
    order_id      TEXT,                       -- null for instantActions
    message       JSONB       NOT NULL        -- the full VDA5050 message
);
CREATE INDEX idx_order_serial_ts ON order_log (serial_number, ts DESC);

-- ------------------------------------------------------------
-- OEE — derived trip cycles. duration_s is GENERATED (keeps the
-- table in BCNF — no free-standing derived column).
-- ------------------------------------------------------------
CREATE TABLE oee_cycles (
    id            BIGSERIAL PRIMARY KEY,
    serial_number TEXT        NOT NULL,
    ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
    order_id      TEXT        NOT NULL,
    start_time    TIMESTAMPTZ NOT NULL,
    end_time      TIMESTAMPTZ NOT NULL,
    duration_s    DOUBLE PRECISION
        GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (end_time - start_time))) STORED,
    result        TEXT        NOT NULL CHECK (result IN ('SUCCEEDED', 'ABORTED'))
);
CREATE INDEX idx_oee_serial_ts ON oee_cycles (serial_number, ts DESC);

-- ------------------------------------------------------------
-- Seed data
-- ------------------------------------------------------------
INSERT INTO maps (map_id, label) VALUES
    ('default', 'Default map (placeholder — set to the real map name)');

INSERT INTO robots (serial_number, manufacturer, rosbridge_url, map_id) VALUES
    ('amr001', 'moverobotic', 'ws://localhost:9090', 'default');

-- theta is radians (the legacy angle.z values were degrees — converted here).
INSERT INTO named_locations (id, map_id, label, x, y, theta) VALUES
    (1, 'default', 'Charging Station',  3.094,  1.412, -2.21568),
    (2, 'default', 'Entrance',         -1.953,  2.467, -0.59145),
    (3, 'default', 'Storage Room',     -2.690, -1.583,  2.48120),
    (4, 'default', 'Home',              0.000,  0.000,  0.00000);
```

---

## Notes

- `ts` holds the **event** timestamp from the message header (`timestamp` field,
  ISO 8601 → `TIMESTAMPTZ`). `oee_cycles.ts` is the row-insert time.
- "Latest state" queries use `ORDER BY ts DESC LIMIT 1` on the
  `(serial_number, ts DESC)` index.
- **Retention:** `state_snapshots` is the high-volume table (~80–100 k rows/day per
  robot at the 5 s heartbeat + change triggers). For production, partition it monthly
  (`PARTITION BY RANGE (ts)`) and drop old partitions on a schedule. Not applied here —
  out of FYP scope, documented as a known limitation.
- `state_snapshots.errors` carries the VDA5050 `state.errors` array; there is no
  separate `error_log` table — errors live with the snapshot that reported them.
- Enum-like columns use `CHECK` constraints (not PostgreSQL `ENUM` types) so the script
  stays simple to drop and re-run.
- The write path is **Node-RED → FastAPI `/ingest/*` → PostgreSQL**; reads are
  FastAPI `GET /robots/{serial}/state` and `/robots/{serial}/oee/*`. See
  [REST_ENDPOINTS.md](REST_ENDPOINTS.md).

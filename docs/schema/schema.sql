-- ============================================================
-- AMR Integration System — database schema (VDA5050-aligned)
-- Fully normalized: 1NF-strict, BCNF. 15 tables.
-- Re-running this script DROPS and recreates all tables.
--
-- The database is the single source of truth — both FastAPI and the ROS Bridge
-- read the fleet definition (fleet_config + robots) from here.
--
-- This file is the canonical, runnable copy of the schema in
-- docs/schema/DATABASE_SCHEMA.md — keep the two in sync.
--
-- Apply:
--   psql -U postgres -c "CREATE DATABASE amr_integration;"
--   psql -U postgres -d amr_integration -f docs/schema/schema.sql
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
-- ------------------------------------------------------------
CREATE TABLE robots (
    serial_number TEXT PRIMARY KEY,
    rosbridge_url TEXT NOT NULL,
    map_id        TEXT NOT NULL REFERENCES maps (map_id)
);

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

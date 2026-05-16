# Database Schema

PostgreSQL schema for the AMR Integration System. It backs the outbound telemetry
topics (state, health, OEE) and the named-locations reference data.

> **Status:** the database is **not yet integrated** — no service connects to it yet.
> This schema is the agreed target. Table names match the `INSERT INTO ...`
> placeholders in the Node-RED handlers (`node-red/flows.json`).

---

## TL;DR — apply it

You know PostgreSQL; you just want the commands.

```bash
# create the database (once)
psql -U postgres -c "CREATE DATABASE amr_integration;"

# apply / reset the schema — runs the SQL block below
psql -U postgres -d amr_integration -f schema.sql
```

The SQL in [§ Schema](#schema) below starts with `DROP TABLE IF EXISTS ... CASCADE`,
so re-running it **resets** every table (all data lost) and re-seeds `named_locations`.
Copy that block into a file named `schema.sql`, or paste it straight into `psql`.

---

## Tables

| Table | Source topic | Kind |
|---|---|---|
| `named_locations` | — (seeded; mirrors FastAPI `app/data.py`) | reference data |
| `odom` | `amr/state/odom` | append-only log |
| `pose` | `amr/state/pose` | append-only log |
| `nav_status` | `amr/state/nav/status` | append-only log |
| `nav_progress` | `amr/state/nav/progress` | append-only log |
| `health_connection` | `amr/health/connection` | append-only log |
| `health_error` | `amr/health/error` | append-only log |
| `oee_cycle` | `amr/oee/cycle` | append-only log |

All telemetry tables are append-only logs: each MQTT message is one row. "Latest
state" queries use `ORDER BY ts DESC LIMIT 1`.

---

## Schema

```sql
-- ============================================================
-- AMR Integration System — database schema
-- Re-running this script DROPS and recreates all tables.
-- ============================================================

DROP TABLE IF EXISTS odom              CASCADE;
DROP TABLE IF EXISTS pose              CASCADE;
DROP TABLE IF EXISTS nav_status        CASCADE;
DROP TABLE IF EXISTS nav_progress      CASCADE;
DROP TABLE IF EXISTS health_connection CASCADE;
DROP TABLE IF EXISTS health_error      CASCADE;
DROP TABLE IF EXISTS oee_cycle         CASCADE;
DROP TABLE IF EXISTS named_locations   CASCADE;

-- ------------------------------------------------------------
-- Reference data: predefined navigation targets
-- ------------------------------------------------------------
CREATE TABLE named_locations (
    id       INTEGER PRIMARY KEY,
    label    TEXT    NOT NULL,
    x        DOUBLE PRECISION NOT NULL,
    y        DOUBLE PRECISION NOT NULL,
    angle_x  DOUBLE PRECISION NOT NULL DEFAULT 0,
    angle_y  DOUBLE PRECISION NOT NULL DEFAULT 0,
    angle_z  DOUBLE PRECISION NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------
-- amr/state/odom  — robot odometry
-- ------------------------------------------------------------
CREATE TABLE odom (
    id               BIGSERIAL PRIMARY KEY,
    ts               TIMESTAMPTZ NOT NULL,
    pos_x            DOUBLE PRECISION NOT NULL,
    pos_y            DOUBLE PRECISION NOT NULL,
    pos_z            DOUBLE PRECISION NOT NULL,
    ori_x            DOUBLE PRECISION NOT NULL,
    ori_y            DOUBLE PRECISION NOT NULL,
    ori_z            DOUBLE PRECISION NOT NULL,
    ori_w            DOUBLE PRECISION NOT NULL,
    linear_velocity  DOUBLE PRECISION NOT NULL,
    angular_velocity DOUBLE PRECISION NOT NULL,
    moving           BOOLEAN NOT NULL,
    trigger          TEXT NOT NULL CHECK (trigger IN ('distance', 'heading', 'heartbeat'))
);
CREATE INDEX idx_odom_ts ON odom (ts DESC);

-- ------------------------------------------------------------
-- amr/state/pose  — AMCL map-localised pose
-- ------------------------------------------------------------
CREATE TABLE pose (
    id      BIGSERIAL PRIMARY KEY,
    ts      TIMESTAMPTZ NOT NULL,
    px      DOUBLE PRECISION NOT NULL,
    py      DOUBLE PRECISION NOT NULL,
    qz      DOUBLE PRECISION NOT NULL,
    qw      DOUBLE PRECISION NOT NULL,
    rz      DOUBLE PRECISION NOT NULL,
    moving  BOOLEAN NOT NULL,
    trigger TEXT NOT NULL CHECK (trigger IN ('distance', 'heading', 'heartbeat'))
);
CREATE INDEX idx_pose_ts ON pose (ts DESC);

-- ------------------------------------------------------------
-- amr/state/nav/status  — navigation goal status
-- ------------------------------------------------------------
CREATE TABLE nav_status (
    id          BIGSERIAL PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('IDLE','NAVIGATING','SUCCEEDED','ABORTED','PREEMPTED')),
    goal_id     TEXT,
    status_code INTEGER,
    text        TEXT
);
CREATE INDEX idx_nav_status_ts ON nav_status (ts DESC);

-- ------------------------------------------------------------
-- amr/state/nav/progress  — waypoint sequence progress
-- ------------------------------------------------------------
CREATE TABLE nav_progress (
    id            BIGSERIAL PRIMARY KEY,
    ts            TIMESTAMPTZ NOT NULL,
    current_idx   INTEGER NOT NULL,
    total         INTEGER NOT NULL,
    progress_pct  DOUBLE PRECISION NOT NULL,
    current_label TEXT
);
CREATE INDEX idx_nav_progress_ts ON nav_progress (ts DESC);

-- ------------------------------------------------------------
-- amr/health/connection  — rosbridge connection state
-- ------------------------------------------------------------
CREATE TABLE health_connection (
    id           BIGSERIAL PRIMARY KEY,
    ts           TIMESTAMPTZ NOT NULL,
    connected    BOOLEAN NOT NULL,
    rosbridge_url TEXT
);
CREATE INDEX idx_health_connection_ts ON health_connection (ts DESC);

-- ------------------------------------------------------------
-- amr/health/error  — error events
-- ------------------------------------------------------------
CREATE TABLE health_error (
    id         BIGSERIAL PRIMARY KEY,
    ts         TIMESTAMPTZ NOT NULL,
    error_type TEXT NOT NULL,
    message    TEXT,
    source     TEXT
);
CREATE INDEX idx_health_error_ts ON health_error (ts DESC);

-- ------------------------------------------------------------
-- amr/oee/cycle  — completed trip records
-- ------------------------------------------------------------
CREATE TABLE oee_cycle (
    id          BIGSERIAL PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL,
    trip_id     TEXT NOT NULL,
    origin      TEXT,
    destination TEXT,
    start_time  TIMESTAMPTZ NOT NULL,
    end_time    TIMESTAMPTZ NOT NULL,
    duration_s  DOUBLE PRECISION NOT NULL,
    result      TEXT NOT NULL CHECK (result IN ('SUCCEEDED','ABORTED','PREEMPTED'))
);
CREATE INDEX idx_oee_cycle_ts      ON oee_cycle (ts DESC);
CREATE INDEX idx_oee_cycle_trip_id ON oee_cycle (trip_id);

-- ------------------------------------------------------------
-- Seed: named locations (mirrors fastapi-service/app/data.py)
-- ------------------------------------------------------------
INSERT INTO named_locations (id, label, x, y, angle_x, angle_y, angle_z) VALUES
    (1, 'Charging Station',  3.094,  1.412, 0, 0, -126.949),
    (2, 'Entrance',         -1.953,  2.467, 0, 0,  -33.887),
    (3, 'Storage Room',     -2.690, -1.583, 0, 0,  142.161),
    (4, 'Home',              0.000,  0.000, 0, 0,    0.000);
```

---

## Notes

- `ts` holds the **event** timestamp from the MQTT message payload (ISO 8601 →
  `TIMESTAMPTZ`).
- Enum-like columns use `CHECK` constraints rather than PostgreSQL `ENUM` types, so the
  script stays simple to drop and re-run.
- This schema reflects the **current** `amr/*` topic scheme. The planned VDA5050
  migration ([../plans/vda5050-migration.md](../plans/vda5050-migration.md)) will
  replace it with tables keyed by `(manufacturer, serial_number)`.

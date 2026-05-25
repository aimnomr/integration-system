-- Soft-delete (archive) support for robots.
--
-- New rows from schema.sql already include this column; this migration is for
-- dev databases that were created before 2026-05-25. Safe to re-run.

BEGIN;

ALTER TABLE robots
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_robots_active
    ON robots (serial_number)
    WHERE archived_at IS NULL;

COMMIT;

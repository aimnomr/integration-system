# Phase 6 G19 -- Telemetry retention prune
#
# What it does:
#   Verifies the pruning SQL (db.prune_telemetry) does what the background
#   task in main.py calls. We don't need to restart FastAPI to test the SQL:
#   the function is the only thing the loop ever calls. Restart-driven
#   verification is captured separately by tests/test_retention.py
#   (lifespan / TELEMETRY_RETENTION_DAYS=0 disable).
#
# Steps:
#   1. Plant a 90-day-old state_snapshots row + a 90-day-old connection_log row
#      with a sentinel header_id=99999 so we can find them again.
#   2. Run the same DELETE SQL prune_telemetry() runs, with 30-day retention.
#   3. Assert the old rows are gone; recent rows untouched.

. "$PSScriptRoot\_lib.ps1"

Section "Phase 6 G19 -- Retention prune (DB layer)"

$serial   = $env:SEED_SERIAL
$sentinel = 99999
$retDays  = 30

# Clean any leftover sentinels from a previous failed run.
PsqlExec "DELETE FROM state_snapshots WHERE header_id=$sentinel;" | Out-Null
PsqlExec "DELETE FROM connection_log  WHERE header_id=$sentinel;" | Out-Null

# --- 1. Plant 90-day-old rows ----------------------------------------------
PsqlExec "INSERT INTO state_snapshots (serial_number, ts, header_id) VALUES ('$serial', now() - interval '90 days', $sentinel);" | Out-Null
PsqlExec "INSERT INTO connection_log (serial_number, ts, header_id, connection_state) VALUES ('$serial', now() - interval '90 days', $sentinel, 'OFFLINE');" | Out-Null

$plantedState = [int](PsqlScalar "SELECT count(*) FROM state_snapshots WHERE header_id=$sentinel;")
$plantedConn  = [int](PsqlScalar "SELECT count(*) FROM connection_log  WHERE header_id=$sentinel;")
Assert-Eq "planted state_snapshots sentinel" 1 $plantedState
Assert-Eq "planted connection_log sentinel"  1 $plantedConn

# Snapshot count of *recent* rows so we can prove the prune left them alone.
$recentStateBefore = [int](PsqlScalar "SELECT count(*) FROM state_snapshots WHERE ts > now() - interval '1 day';")
$recentConnBefore  = [int](PsqlScalar "SELECT count(*) FROM connection_log  WHERE ts > now() - interval '1 day';")

# --- 2. Run the prune (same SQL as db.prune_telemetry) ---------------------
PsqlExec "DELETE FROM state_snapshots WHERE ts < now() - make_interval(days => $retDays);" | Out-Null
PsqlExec "DELETE FROM connection_log  WHERE ts < now() - make_interval(days => $retDays);" | Out-Null

# --- 3. Assertions ---------------------------------------------------------
$leftState = [int](PsqlScalar "SELECT count(*) FROM state_snapshots WHERE header_id=$sentinel;")
$leftConn  = [int](PsqlScalar "SELECT count(*) FROM connection_log  WHERE header_id=$sentinel;")
Assert-Eq "90-day-old state_snapshots row pruned" 0 $leftState
Assert-Eq "90-day-old connection_log row pruned"  0 $leftConn

$recentStateAfter = [int](PsqlScalar "SELECT count(*) FROM state_snapshots WHERE ts > now() - interval '1 day';")
$recentConnAfter  = [int](PsqlScalar "SELECT count(*) FROM connection_log  WHERE ts > now() - interval '1 day';")
Assert-Eq "recent state_snapshots untouched" $recentStateBefore $recentStateAfter
Assert-Eq "recent connection_log  untouched" $recentConnBefore  $recentConnAfter

Summary "Phase 6 G19 retention"

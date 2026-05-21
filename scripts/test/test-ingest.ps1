# Phase 4 -- Telemetry ingestion pipeline (MQTT -> Node-RED -> FastAPI -> Postgres)
#
# What it does:
#   1. Captures baseline row counts in state_snapshots and connection_log.
#   2. Publishes a canned VDA5050 state message + a connection message via
#      mosquitto_pub on the topics Node-RED is subscribed to.
#   3. Waits a short settle window, then re-queries the counts and asserts
#      they went up. Each leg of the pipeline (broker, Node-RED routing,
#      FastAPI ingest endpoint, Postgres INSERT) has to work for this to pass.
#
# Prereqs (Phase 0 already verified): Mosquitto, Node-RED, FastAPI all running;
# PostgreSQL up; mosquitto_pub + psql on PATH.

. "$PSScriptRoot\_lib.ps1"

Section "Phase 4 -- Telemetry ingestion"

$serial = $env:SEED_SERIAL
$mapId  = $env:SEED_MAP

# --- Build payload files (ASCII to avoid PowerShell's UTF-8 BOM trap) -------
$stateJson = @"
{"headerId":1,"timestamp":"2026-05-18T12:00:00Z","serialNumber":"$serial","orderId":"","orderUpdateId":0,"lastNodeId":"","lastNodeSequenceId":0,"nodeStates":[],"edgeStates":[],"actionStates":[],"agvPosition":{"x":1.0,"y":2.0,"theta":0,"mapId":"$mapId","positionInitialized":true},"velocity":{"vx":0,"vy":0,"omega":0},"driving":false,"operatingMode":"AUTOMATIC","errors":[],"safetyState":{"eStop":"NONE","fieldViolation":false}}
"@
$connJson = @"
{"headerId":1,"timestamp":"2026-05-18T12:00:00Z","serialNumber":"$serial","connectionState":"ONLINE"}
"@

$stateFile = Join-Path $env:TEMP "amr-test-state.json"
$connFile  = Join-Path $env:TEMP "amr-test-conn.json"
$stateJson | Out-File -Encoding ascii -FilePath $stateFile
$connJson  | Out-File -Encoding ascii -FilePath $connFile

# --- State pipeline ---------------------------------------------------------
$beforeState = [int](PsqlScalar "SELECT count(*) FROM state_snapshots WHERE serial_number='$serial';")
Write-Host "  baseline state_snapshots($serial) = $beforeState" -ForegroundColor DarkGray

MqttPub "amr/v2/moverobotic/$serial/state" $stateFile 0
Start-Sleep -Milliseconds 1500

$afterState = [int](PsqlScalar "SELECT count(*) FROM state_snapshots WHERE serial_number='$serial';")
Write-Host "  after    state_snapshots($serial) = $afterState" -ForegroundColor DarkGray
Assert-True "state_snapshots row count increased" ($afterState -gt $beforeState) `
    "before=$beforeState after=$afterState"

# --- Connection pipeline ----------------------------------------------------
$beforeConn = [int](PsqlScalar "SELECT count(*) FROM connection_log WHERE serial_number='$serial';")
MqttPub "amr/v2/moverobotic/$serial/connection" $connFile 0
Start-Sleep -Milliseconds 1500
$afterConn = [int](PsqlScalar "SELECT count(*) FROM connection_log WHERE serial_number='$serial';")
Assert-True "connection_log row count increased" ($afterConn -gt $beforeConn) `
    "before=$beforeConn after=$afterConn"

# --- Direct ingest endpoint (G20 happy path; Phase 6 valid body) -----------
$resp = ApiPost "/ingest/state" $stateJson
Assert-Eq "POST /ingest/state full valid body -- 200" 200 ([int]$resp.StatusCode)
$body = $resp.Content | ConvertFrom-Json
Assert-Eq "POST /ingest/state response status=ok" "ok" $body.status

# --- Malformed payload must be rejected by Node-RED (Phase 8) --------------
# Node-RED's validateState should drop a non-JSON payload silently -- no DB row.
#
# Caveat: if anything is publishing real telemetry to the same topic, the row
# count climbs regardless of what we publish here. The growth can be bursty
# (silent for a second, then a couple of rows land), so a single drift
# sample isn't enough. Sample several times across a few seconds; if ANY
# window shows growth, the environment isn't quiet enough to assert against
# and we skip the two drop checks.
$samples = @()
$prev = [int](PsqlScalar "SELECT count(*) FROM state_snapshots WHERE serial_number='$serial';")
for ($i = 0; $i -lt 4; $i++) {
    Start-Sleep -Milliseconds 750
    $cur = [int](PsqlScalar "SELECT count(*) FROM state_snapshots WHERE serial_number='$serial';")
    $samples += ($cur - $prev)
    $prev = $cur
}
$totalDrift = ($samples | Measure-Object -Sum).Sum

if ($totalDrift -gt 0) {
    Write-Host "  SKIP  malformed MQTT payload dropped (no new row)" -ForegroundColor Yellow
    Write-Host "        background drift over 3 s = $($samples -join ' + ') = +$totalDrift rows; cannot isolate Node-RED drop in this environment" -ForegroundColor DarkGray
    Write-Host "  SKIP  state missing serialNumber dropped" -ForegroundColor Yellow
    Write-Host "        same reason -- stop active publishers and re-run, or verify visually in Node-RED's debug pane" -ForegroundColor DarkGray
} else {
    $beforeBad = [int](PsqlScalar "SELECT count(*) FROM state_snapshots WHERE serial_number='$serial';")
    MqttPubString "amr/v2/moverobotic/$serial/state" "this is not json" 0
    Start-Sleep -Milliseconds 1500
    $afterBad = [int](PsqlScalar "SELECT count(*) FROM state_snapshots WHERE serial_number='$serial';")
    Assert-True "malformed MQTT payload dropped (no new row)" ($afterBad -eq $beforeBad) `
        "before=$beforeBad after=$afterBad -- Node-RED should have dropped it"

    $beforeMiss = [int](PsqlScalar "SELECT count(*) FROM state_snapshots;")
    MqttPubString "amr/v2/moverobotic/$serial/state" '{"headerId":1,"timestamp":"t"}' 0
    Start-Sleep -Milliseconds 1500
    $afterMiss = [int](PsqlScalar "SELECT count(*) FROM state_snapshots;")
    Assert-True "state missing serialNumber dropped" ($afterMiss -eq $beforeMiss) `
        "before=$beforeMiss after=$afterMiss"
}

Remove-Item -Force $stateFile, $connFile -ErrorAction SilentlyContinue
Summary "Phase 4 ingestion"

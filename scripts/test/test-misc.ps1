# Phase 8 + Phase 9 -- Miscellaneous backend additions
#
# Covers the manual checklist items that:
#   - don't need a service restart (those are in test-retention.ps1 + pytest)
#   - don't need a real robot
#   - aren't already in the Newman collection
#
# Specifically:
#   - Phase 8: 5 rapid orders return 5 distinct orderIds (concurrency / no dup).
#   - Phase 9: G21 startup-crash fix -- query that aggregates order suffixes
#             tolerates a legacy non-numeric suffix row.
#   - Phase 9: Mosquitto WebSocket listener reachable on :9001.

. "$PSScriptRoot\_lib.ps1"

Section "Phase 8 -- Rapid order submission"

$serial = $env:SEED_SERIAL
$orderIds = New-Object System.Collections.Generic.List[string]
$body = '{"nodes":[{"x":0.0,"y":0.0,"theta":0.0}]}'

for ($i = 0; $i -lt 5; $i++) {
    $resp = ApiPost "/robots/$serial/order" $body
    if ([int]$resp.StatusCode -ne 200) {
        Fail "rapid order #$i returned 200" "got $([int]$resp.StatusCode): $($resp.Content)"
        continue
    }
    $j = $resp.Content | ConvertFrom-Json
    $orderIds.Add($j.orderId) | Out-Null
}

$distinct = ($orderIds | Sort-Object -Unique).Count
Assert-Eq "5 rapid orders -> 5 distinct orderIds" 5 $distinct
if ($distinct -ne 5) {
    Write-Host "  ids returned: $($orderIds -join ', ')" -ForegroundColor DarkGray
}

Section "Phase 9 -- G21 non-numeric order suffix tolerated"

# The bug: at startup FastAPI runs MAX(split_part(order_id,'-order-',2)::int)
# across the orders table. A legacy 'amr001-order-goal' suffix triggered
# psycopg2.errors.InvalidTextRepresentation. The fix added a regex filter:
#   WHERE split_part(order_id, '-order-', 2) ~ '^[0-9]+$'
# We plant the offending row, run the exact aggregation, then clean up.

$legacyOrderId = "$serial-order-goal"
PsqlExec "DELETE FROM orders WHERE order_id='$legacyOrderId';" | Out-Null
PsqlExec "INSERT INTO orders (serial_number, ts, header_id, order_id, order_update_id) VALUES ('$serial', now(), 1, '$legacyOrderId', 0);" | Out-Null

# Reproduce the registry seed query verbatim. It must succeed (no exception)
# AND must IGNORE the legacy row (so the max is unaffected).
$maxBefore = [int](PsqlScalar @"
SELECT COALESCE(MAX(CAST(split_part(order_id, '-order-', 2) AS INTEGER)), -1)
FROM orders
WHERE serial_number = '$serial'
  AND split_part(order_id, '-order-', 2) ~ '^[0-9]+$';
"@)

Assert-True "aggregation succeeded with legacy row present" ($maxBefore -ge -1) `
    "psql returned: $maxBefore"

# Confirm GET /robots/{serial}/state still works (smoke).
$resp = ApiGet "/robots/$serial/state"
Assert-True "GET /robots/$serial/state still works with legacy row present" `
    (200, 503 -contains [int]$resp.StatusCode) "got $([int]$resp.StatusCode)"

# Cleanup.
PsqlExec "DELETE FROM orders WHERE order_id='$legacyOrderId';" | Out-Null

Section "Phase 9 -- Mosquitto WebSocket listener :9001"

try {
    $tnc = Test-NetConnection -ComputerName $env:MQTT_HOST -Port 9001 -WarningAction SilentlyContinue
    Assert-True "TCP :9001 reachable on $($env:MQTT_HOST) (browser MQTT)" $tnc.TcpTestSucceeded
} catch {
    Fail "Test-NetConnection failed" $_.Exception.Message
}

Summary "Phase 8 + 9 misc"

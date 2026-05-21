# Shared helpers for scripts/test/*.ps1
# Source with:  . $PSScriptRoot\_lib.ps1

$ErrorActionPreference = "Stop"

# Defaults -- override by setting env vars or passing -ApiBase / -PgDb to the
# wrapping script.
if (-not $env:API_BASE)   { $env:API_BASE   = "http://localhost:8000" }
if (-not $env:MQTT_HOST)  { $env:MQTT_HOST  = "localhost" }
if (-not $env:MQTT_PORT)  { $env:MQTT_PORT  = "1883" }
if (-not $env:PG_DB)      { $env:PG_DB      = "amr_integration" }
if (-not $env:PG_USER)    { $env:PG_USER    = "postgres" }
if (-not $env:SEED_SERIAL){ $env:SEED_SERIAL = "amr001" }
if (-not $env:SEED_MAP)   { $env:SEED_MAP   = "map-001" }

# Promote PG_PASSWORD -> PGPASSWORD so psql doesn't prompt per invocation.
# Set $env:PG_PASSWORD = "postgres" before running, or store it in pgpass.conf
# (Windows: %APPDATA%\postgresql\pgpass.conf). Without one of those, every
# psql call below will block waiting for a password.
if ($env:PG_PASSWORD -and -not $env:PGPASSWORD) {
    $env:PGPASSWORD = $env:PG_PASSWORD
}

$script:TestsPassed = 0
$script:TestsFailed = 0
$script:FailedNames = @()

function Pass([string]$name) {
    Write-Host "  PASS  $name" -ForegroundColor Green
    $script:TestsPassed++
}

function Fail([string]$name, [string]$detail = "") {
    Write-Host "  FAIL  $name" -ForegroundColor Red
    if ($detail) { Write-Host "        $detail" -ForegroundColor DarkGray }
    $script:TestsFailed++
    $script:FailedNames += $name
}

function Assert-Eq([string]$name, $expected, $actual) {
    if ($expected -eq $actual) { Pass $name }
    else { Fail $name "expected=$expected  actual=$actual" }
}

function Assert-True([string]$name, [bool]$cond, [string]$detail = "") {
    if ($cond) { Pass $name } else { Fail $name $detail }
}

function PsqlScalar([string]$sql) {
    # Run a SELECT-that-returns-one-value and return it as a plain string.
    $out = & psql -U $env:PG_USER -d $env:PG_DB -t -A -c $sql 2>&1
    if ($LASTEXITCODE -ne 0) { throw "psql failed: $out" }
    return ($out | Select-Object -First 1).Trim()
}

function PsqlExec([string]$sql) {
    $out = & psql -U $env:PG_USER -d $env:PG_DB -c $sql 2>&1
    if ($LASTEXITCODE -ne 0) { throw "psql failed: $out" }
    return $out
}

function MqttPub([string]$topic, [string]$payloadFile, [int]$qos = 0) {
    $out = & mosquitto_pub -h $env:MQTT_HOST -p $env:MQTT_PORT -t $topic -f $payloadFile -q $qos 2>&1
    if ($LASTEXITCODE -ne 0) { throw "mosquitto_pub failed: $out" }
}

function MqttPubString([string]$topic, [string]$payload, [int]$qos = 0) {
    $out = & mosquitto_pub -h $env:MQTT_HOST -p $env:MQTT_PORT -t $topic -m $payload -q $qos 2>&1
    if ($LASTEXITCODE -ne 0) { throw "mosquitto_pub failed: $out" }
}

function _InvokeWeb([string]$method, [string]$url, [hashtable]$headers, $body) {
    # PowerShell 5.1's Invoke-WebRequest throws on non-2xx (no
    # -SkipHttpErrorCheck until PS 7). Catch the WebException and build a
    # PSCustomObject that mimics the success shape (StatusCode + Content),
    # so callers can branch on $resp.StatusCode either way.
    $params = @{
        Uri             = $url
        Method          = $method
        Headers         = $headers
        UseBasicParsing = $true
    }
    if ($body) { $params.Body = $body }
    try {
        return Invoke-WebRequest @params
    } catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        if (-not $resp) { throw }    # network-level failure, not HTTP
        $content = ""
        try {
            $stream = $resp.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $content = $reader.ReadToEnd()
            $reader.Close()
        } catch {}
        return [PSCustomObject]@{
            StatusCode = [int]$resp.StatusCode
            Content    = $content
        }
    }
}

function ApiGet([string]$path, [hashtable]$headers = @{}) {
    $url = "$($env:API_BASE)$path"
    if ($env:API_KEY) { $headers["X-API-Key"] = $env:API_KEY }
    return _InvokeWeb "GET" $url $headers $null
}

function ApiPost([string]$path, $body, [hashtable]$headers = @{}) {
    $url = "$($env:API_BASE)$path"
    $headers["Content-Type"] = "application/json"
    if ($env:API_KEY) { $headers["X-API-Key"] = $env:API_KEY }
    $json = if ($body -is [string]) { $body } else { $body | ConvertTo-Json -Depth 10 -Compress }
    return _InvokeWeb "POST" $url $headers $json
}

function Section([string]$title) {
    Write-Host ""
    Write-Host "=== $title ===" -ForegroundColor Cyan
}

function Summary([string]$label) {
    Write-Host ""
    Write-Host "----- $label -----" -ForegroundColor Cyan
    Write-Host "  passed: $script:TestsPassed" -ForegroundColor Green
    if ($script:TestsFailed -gt 0) {
        Write-Host "  failed: $script:TestsFailed" -ForegroundColor Red
        $script:FailedNames | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
        exit 1
    } else {
        Write-Host "  failed: 0" -ForegroundColor Green
    }
}

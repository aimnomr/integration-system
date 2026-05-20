# start-all.ps1 — launch every microservice, each in its own terminal window.
#
# Usage (from the repo root):
#   .\start-all.ps1
#
# PostgreSQL is assumed to be already running (it is normally a Windows service).
# Services start in dependency order: Mosquitto -> FastAPI -> ROS Bridge -> Node-RED.
# Close a service by closing its window (or Ctrl+C inside it).

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Start-Service-Window {
    param(
        [string]$Title,    # window title
        [string]$WorkDir,  # directory to run in (relative to repo root)
        [string]$Command   # command to execute
    )
    $full = Join-Path $root $WorkDir
    # -NoExit keeps the window open so logs stay visible and crashes are readable.
    Start-Process powershell -ArgumentList @(
        '-NoExit', '-Command',
        "`$host.UI.RawUI.WindowTitle='$Title'; Set-Location '$full'; $Command"
    )
    Write-Host "Launched: $Title"
}

Write-Host "Starting AMR Integration System..." -ForegroundColor Cyan

# 1. Mosquitto MQTT broker — everything else connects to it.
Start-Service-Window -Title 'Mosquitto' -WorkDir '.' `
    -Command 'mosquitto -c mosquitto/mosquitto.conf -v'
Start-Sleep -Seconds 2

# 2. FastAPI gateway — needs PostgreSQL up; serves GET /fleet.
Start-Service-Window -Title 'FastAPI' -WorkDir 'fastapi-service' `
    -Command 'venv\Scripts\Activate.ps1; uvicorn main:app --reload --port 8000'
Start-Sleep -Seconds 4

# 3. ROS Bridge — fetches GET /fleet from FastAPI at startup, so start it after.
Start-Service-Window -Title 'ROS Bridge' -WorkDir 'ros-bridge-service' `
    -Command 'node index.js'
Start-Sleep -Seconds 1

# 4. Node-RED — can start any time after Mosquitto.
Start-Service-Window -Title 'Node-RED' -WorkDir 'node-red' `
    -Command 'node-red --settings settings.js --userDir .'

Write-Host "All services launched in separate windows." -ForegroundColor Green

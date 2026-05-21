# run-all.ps1 -- execute every automated test in scripts/test/, plus the
# Newman backend suite and the FastAPI pytest suite. Exits non-zero on first
# failure unless -ContinueOnFail is given.
#
# Prereqs: full stack running (see start-all.ps1), Postgres reachable, the
# FastAPI venv activated (so pytest is on PATH).

param(
    [switch]$ContinueOnFail,
    [switch]$SkipPytest,
    [switch]$SkipNewman,
    [string]$ApiKey
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$failed = @()

function Run-Step([string]$label, [scriptblock]$action) {
    Write-Host ""
    Write-Host "########## $label ##########" -ForegroundColor Magenta
    try {
        & $action
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
            throw "exit code $LASTEXITCODE"
        }
        Write-Host "[$label] OK" -ForegroundColor Green
    } catch {
        Write-Host "[$label] FAIL: $($_.Exception.Message)" -ForegroundColor Red
        $script:failed += $label
        if (-not $ContinueOnFail) { exit 1 }
    }
}

if ($ApiKey) { $env:API_KEY = $ApiKey }

Run-Step "PowerShell -- Phase 4 ingestion"          { & "$PSScriptRoot\test-ingest.ps1" }
Run-Step "PowerShell -- Phase 6 G19 retention"      { & "$PSScriptRoot\test-retention.ps1" }
Run-Step "PowerShell -- Phase 8/9 misc"             { & "$PSScriptRoot\test-misc.ps1" }

if (-not $SkipNewman) {
    Run-Step "Newman -- backend HTTP collection" {
        $newmanArgs = @()
        if ($ApiKey) { $newmanArgs += @("-ApiKey", $ApiKey) }
        & "$root\docs\postman\run-newman.ps1" @newmanArgs
    }
}

if (-not $SkipPytest) {
    Run-Step "pytest -- fastapi-service unit tests" {
        Push-Location "$root\fastapi-service"
        try {
            # Use the venv's pytest directly so the wrapper works whether or
            # not the user has activated the venv in the calling shell.
            $venvPytest = Join-Path $PWD "venv\Scripts\pytest.exe"
            if (Test-Path $venvPytest) {
                & $venvPytest -q
            } else {
                # Fall back to PATH pytest (CI, or globally-installed pytest).
                & pytest -q
            }
        } finally { Pop-Location }
    }

    Run-Step "node:test -- ros-bridge-service" {
        Push-Location "$root\ros-bridge-service"
        try { & npm test } finally { Pop-Location }
    }
}

Write-Host ""
if ($failed.Count -eq 0) {
    Write-Host "ALL AUTOMATED TESTS PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "FAILURES:" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

# Newman runner — replays the Postman collection against a running FastAPI.
#
# Prerequisites:
#   - Node.js on PATH (`node -v`).
#   - FastAPI running (and ideally the full stack — start-all.ps1).
#   - First run downloads `newman` + `newman-reporter-htmlextra` via npx cache;
#     subsequent runs are instant.
#
# Usage:
#   .\docs\postman\run-newman.ps1                     # CLI output + HTML report
#   .\docs\postman\run-newman.ps1 -ApiKey "secret"    # if backend's API_KEY is set
#   .\docs\postman\run-newman.ps1 -BaseUrl "http://other:8000"
#
# The HTML report lands in docs/postman/reports/<timestamp>.html — open it in a
# browser for the visual diff of pass/fail per request.

param(
    [string] $BaseUrl = "http://localhost:8000",
    [string] $ApiKey  = "",
    [switch] $NoHtml
)

$ErrorActionPreference = "Stop"

$here       = Split-Path -Parent $PSCommandPath
$collection = Join-Path $here "amr-integration.postman_collection.json"
$envFile    = Join-Path $here "local.postman_environment.json"
$reportsDir = Join-Path $here "reports"

if (-not (Test-Path $reportsDir)) { New-Item -ItemType Directory -Path $reportsDir | Out-Null }

$stamp     = Get-Date -Format "yyyyMMdd-HHmmss"
$htmlPath  = Join-Path $reportsDir "$stamp.html"
$jsonPath  = Join-Path $reportsDir "$stamp.json"

$reporters = @("cli", "json")
if (-not $NoHtml) { $reporters += "htmlextra" }

$envOverrides = @(
    "--env-var", "baseUrl=$BaseUrl",
    "--env-var", "apiKey=$ApiKey"
)

$reporterArgs = @(
    "--reporters", ($reporters -join ","),
    "--reporter-json-export", $jsonPath
)
if (-not $NoHtml) {
    $reporterArgs += @("--reporter-htmlextra-export", $htmlPath, "--reporter-htmlextra-title", "AMR API run $stamp")
}

Write-Host "Running Newman against $BaseUrl"  -ForegroundColor Cyan
Write-Host "Collection: $collection"          -ForegroundColor DarkGray
Write-Host "Report:     $htmlPath"             -ForegroundColor DarkGray

# Use npx so users don't need a global newman install. The first run pulls the
# package into the npm cache; subsequent runs are immediate.
& npx --yes -p newman -p newman-reporter-htmlextra newman run $collection `
    -e $envFile `
    @envOverrides `
    @reporterArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "Newman reported failures (exit $LASTEXITCODE). HTML report: $htmlPath" -ForegroundColor Yellow
    exit $LASTEXITCODE
}
Write-Host "All assertions passed." -ForegroundColor Green

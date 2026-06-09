# Postman / Newman — backend smoke tests

A replayable HTTP smoke-test suite for the FastAPI gateway. Build new requests
in Postman (with assertions) → export the updated collection → `run-newman.ps1`
replays every assertion in seconds and produces an HTML report.

## Files

| Path | Purpose |
|---|---|
| `amr-integration.postman_collection.json` | The collection — every endpoint, grouped by area, each with `pm.test(...)` assertions. v2.1 schema. |
| `local.postman_environment.json` | Environment template (`baseUrl`, `apiKey`). |
| `run-newman.ps1` | PowerShell wrapper around `npx newman run` — writes a timestamped HTML + JSON report under `reports/`. |
| `reports/` | Generated; gitignore-friendly. |

## Running

```powershell
# Default — localhost FastAPI, no auth
.\docs\postman\run-newman.ps1

# Backend has API_KEY set
.\docs\postman\run-newman.ps1 -ApiKey "your-key"

# Different host (e.g. the backend running on another box)
.\docs\postman\run-newman.ps1 -BaseUrl "http://192.168.1.50:8000"

# CLI-only output, skip the HTML report
.\docs\postman\run-newman.ps1 -NoHtml
```

First run downloads `newman` + `newman-reporter-htmlextra` via `npx` (~10 s).
Subsequent runs are instant.

Exit code is `0` if every assertion passed, non-zero otherwise — so you can drop
this into a `&& echo OK` chain or wire it into CI.

## What's covered

| Section | Notes |
|---|---|
| **1. Health & System** | `/system/status` reports each subsystem |
| **2. Fleet** | `GET /fleet` shape, `PUT /fleet` round-trip |
| **3. Robots — read** | list, single, state, 404 for unknown serial |
| **4. Robots — write** | create → update → delete `amr-test` (self-cleaning) |
| **5. Orders & instant actions** | single-node order, cancel, 422 for empty order |
| **6. Order history** | `/orders`, filtered by serial, 404 for ghost serial, 422 for bad limit |
| **7. OEE** | summary, cycles, availability — shape only, doesn't require live cycles |
| **8. Maps CRUD** | full round-trip + 409 for deleting a referenced map |
| **9. Named Locations CRUD** | full round-trip, default-theta check |
| **10. Ingest** | malformed payload → 422 (G20), bogus connectionState → 422, full valid body → 200 |
| **11. Negative cases (Phase 8)** | missing-y order → 422, UNKNOWN robot → 404, bogus instant-action → 422, bad map_id → 422, duplicate map_id → 409, `/maps/nope` 404 trio, `?limit=501` → 422 |
| **12. CORS (Phase 9 G18)** | allowed Origin → ACAO matches; disallowed Origin → no ACAO header |
| **13. Order history pagination** | capture last-row `ts` cursor; refetch with `before=<cursorTs>` and assert strictly older |

**13 sections / 61 requests / 66 assertions** at last count (2026-05-21).

Every request has at least a status-code assertion. CRUD blocks are
**self-cleaning** — the DELETE at the end of each section removes anything the
POST created, so re-running the suite doesn't leave junk in the database.

## Adding a new test

1. Open Postman and import the collection (File → Import →
   `amr-integration.postman_collection.json`).
2. Add a request — easiest by duplicating one in the same folder, editing the
   URL/body.
3. In the **Tests** tab, write assertions:
   ```js
   pm.test('200 OK', () => pm.response.to.have.status(200));
   const j = pm.response.json();
   pm.test('returns X', () => pm.expect(j.x).to.eql('expected'));
   ```
4. Save → in the collection's three-dot menu → **Export** → overwrite the JSON
   file in this folder.
5. Commit. Next `run-newman.ps1` exercises the new request automatically.

## Sharing test data between requests

The collection uses two ways to chain state:

- **Collection variables** (`pm.collectionVariables.set(...)`). `GET /fleet`
  stashes the first robot's `serialNumber` into `seedSerial` so subsequent
  requests target a real robot without hard-coding `amr001`.
- **Environment variables** (`pm.environment.set(...)`) — same syntax, but
  scoped to the environment file. Use these for things that should persist
  across collection runs (e.g. an auth token).

## Auth flip

The collection's auth block reads `{{apiKey}}` from the environment and adds an
`X-API-Key` header automatically. A pre-request script strips the header if
`apiKey` is empty, so you don't have to think about it for local dev — when the
backend turns auth on, set `-ApiKey` once and everything works.

## CI

This collection is wired into `.github/workflows/ci.yml` as the **Newman API
smoke** job: it boots Postgres + Mosquitto + FastAPI via `docker compose`, waits
for the FastAPI healthcheck, then runs `newman` against the booted stack for
green/red on every PR. The same compose stack also doubles as a run/deploy path
for the full stack (see [`../setup.md`](../setup.md)).

# scripts/test/ — Automated regression scripts

PowerShell integration scripts for the parts of the stack that need live
services but no real robot or manual UI interaction. Each script is
self-contained, prints `PASS` / `FAIL` per assertion, and exits non-zero if
anything fails — so they wire cleanly into CI. The full test pyramid is
described in `docs/reference/testing.md`.

| Script | Covers |
|---|---|
| [`test-ingest.ps1`](test-ingest.ps1) | Telemetry pipeline: MQTT publish → FastAPI ingest → Postgres row; malformed payloads dropped; direct `/ingest/state` happy path |
| [`test-retention.ps1`](test-retention.ps1) | Retention: prune SQL deletes old telemetry, keeps recent |
| [`test-misc.ps1`](test-misc.ps1) | Rapid orders get distinct IDs; legacy order-ID suffixes tolerated; Mosquitto `:9001` reachable |
| [`run-all.ps1`](run-all.ps1) | Wrapper — runs every PS test + Newman + pytest + node:test |

Also automated, but living elsewhere:

| What | Where |
|---|---|
| FastAPI HTTP smoke (every REST endpoint) | `docs/postman/amr-integration.postman_collection.json` (run via `docs/postman/run-newman.ps1`) |
| FastAPI unit tests (auth, CORS, rate limit, orders, config, retention lifecycle) | `fastapi-service/tests/` (run with `pytest`) |
| ROS Bridge unit tests (state builder, order state machine, VDA5050) | `ros-bridge-service/test/` (run with `npm test`) |
| Frontend E2E (AppShell, health pills, dispatch, admin CRUD) | `frontend/tests/e2e/` (Playwright — see `frontend/tests/README.md`) |

## Running

```powershell
# Set the Postgres password ONCE per shell so psql doesn't prompt per call
# (the ingestion + retention + misc scripts each call psql several times).
$env:PG_PASSWORD = "postgres"           # or whatever your local password is

# Run everything (full stack must be up via .\start-all.ps1, venv activated)
.\scripts\test\run-all.ps1

# Just one script
.\scripts\test\test-ingest.ps1

# Backend with API key set
.\scripts\test\run-all.ps1 -ApiKey "test-key"

# Don't bail on the first failure
.\scripts\test\run-all.ps1 -ContinueOnFail
```

Alternative to `PG_PASSWORD`: drop a `pgpass.conf` at
`%APPDATA%\postgresql\pgpass.conf` (Windows) with a single line
`localhost:5432:amr_integration:postgres:<your-password>` — `psql` reads
it automatically and never prompts.

## Configuration (env vars)

| Var | Default | Used by |
|---|---|---|
| `API_BASE`    | `http://localhost:8000` | every script |
| `API_KEY`     | _(unset)_ | added as `X-API-Key` header if set |
| `MQTT_HOST`   | `localhost` | ingest, misc |
| `MQTT_PORT`   | `1883` | ingest |
| `PG_DB`       | `amr_integration` | retention, ingest, misc |
| `PG_USER`     | `postgres` | retention, ingest, misc |
| `PG_PASSWORD` | _(unset)_ | promoted to `PGPASSWORD` so psql doesn't prompt |
| `SEED_SERIAL` | `amr001` | every script |
| `SEED_MAP`    | `map-001` | ingest |

## What's *not* automated (and why)

Some checks are intentionally left manual — re-running them under automation
gives less signal than running them by hand once a release (see
`docs/reference/testing.md` § Tier 3). Examples:

- Anything tagged **[robot]** — needs a real robot or sim.
- Stopping PostgreSQL / Mosquitto / FastAPI mid-flight to verify the 503 /
  reconnect behaviour: works fine manually, but driving service stop/start
  from a script is brittle on Windows without admin context.
- Node-RED *DB Admin tab* — UI-driven, infrequent.
- Frontend visual checks (canvas rendering, key-hold teleop, hover tooltips).

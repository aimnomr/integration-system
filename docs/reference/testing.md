# Testing

> **Who this is for:** developers verifying the stack after a change. Tiers
> from fastest to slowest; pick the deepest one appropriate to what you
> changed.

## Tier 1 — unit tests (no stack needed, < 30 s)

| Suite | Run | Covers |
|---|---|---|
| **FastAPI pytest** | `cd fastapi-service && pytest -q` | Orders, auth, config, CORS, rate limiting, retention, schemas, ingest service. DB calls are mocked in `tests/conftest.py`, so this runs without Postgres. |
| **ROS Bridge node:test** | `cd ros-bridge-service && npm test` | State builder, order state machine, VDA5050 helpers (`test/`). No live MQTT. |
| **Frontend typecheck** | `cd frontend && npm run typecheck` | `tsc --noEmit` over the whole app. |

CI (`.github/workflows/ci.yml`) runs all of these on every push.

## Tier 2 — integration suites (need the full stack up)

Start the full stack first (`.\start-all.ps1` or `docker compose up -d`). Then:

| Suite | Run | Covers |
|---|---|---|
| **Newman backend HTTP** | `.\docs\postman\run-newman.ps1` | The Postman collection — every REST endpoint, CRUD round-trips, 4xx/422/409 negative cases, CORS, pagination. Self-cleaning. Writes an HTML report under `docs/postman/reports/`. |
| **PowerShell integration** | `.\scripts\test\run-all.ps1` | Wraps Newman + pytest + node:test + the three integration scripts below. |
| **Playwright frontend E2E** | `cd frontend && npm run e2e` | The non-robot React surface — AppShell, Health, Dashboard, Dispatch, Admin CRUD, Orders, OEE. See [`frontend/tests/README.md`](../../frontend/tests/README.md). |

The PowerShell integration scripts in [`scripts/test/`](../../scripts/test/)
are also runnable individually:

| Script | What it asserts |
|---|---|
| `test-ingest.ps1` | MQTT publish → FastAPI ingest → Postgres row appears; malformed payload dropped; direct `/ingest/state` happy path. |
| `test-retention.ps1` | Old telemetry rows pruned by the retention task; recent rows untouched. |
| `test-misc.ps1` | Rapid orders get distinct IDs; legacy order-ID suffixes tolerated; Mosquitto `:9001` reachable. |

The wrapper exits non-zero on first failure unless `-ContinueOnFail` is set.
Skip flags: `-SkipNewman`, `-SkipPytest`.

## Tier 3 — manual / hardware

What automation can't reach, in four buckets:

| Bucket | Examples | How |
|---|---|---|
| **Robot** | order → real motion, live map/pose, camera stream, teleop drive | Connect a robot or sim ([guide](../user-guide/connecting-a-robot.md)), dispatch from the console, watch it drive. |
| **Chaos** | stop Mosquitto / Postgres / FastAPI mid-flight and observe degradation | Expected outcomes per service are tabulated in the [failure matrix](failure-matrix.md) — kill a container and compare. |
| **UI feel** | canvas clicks, key-hold teleop, tooltips, toasts | Eyeball in the browser. |
| **Ops** | log output, healthcheck behaviour, `.env` overrides | `docker compose logs`, `/system/status`. |

## First-time Playwright setup

```powershell
cd frontend
npm install                           # picks up @playwright/test
npx playwright install chromium       # one-time browser binary (~150 MB, global cache)
```

## Where reports land

| Suite | Output |
|---|---|
| Newman | `docs/postman/reports/<timestamp>.{html,json}` |
| Playwright | `frontend/playwright-report/index.html` (`npx playwright show-report`) |
| pytest / node:test / PS scripts | terminal only |

All report folders are git-ignored.

## CI hookup

CI runs the Tier 1 suites plus the **Newman API smoke** job (see
`.github/workflows/ci.yml`). The Newman job boots Postgres + Mosquitto +
FastAPI via `docker compose`, waits for the FastAPI healthcheck, then replays
the collection. The rest of Tier 2 needs a fuller stack, so it stays
local-only.

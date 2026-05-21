# Testing

How to verify the stack. Tiers from fastest to slowest; pick the deepest one
appropriate to what you changed.

## Tier 1 — unit tests (no stack needed, < 30 s)

| Suite | Run | Covers |
|---|---|---|
| **FastAPI pytest** | `cd fastapi-service && pytest -q` | `tests/test_orders.py`, `test_auth.py`, `test_config.py`, `test_cors.py`, `test_ratelimit.py`, `test_retention.py`, `test_schemas.py`. DB calls are mocked in `tests/conftest.py`, so this runs without Postgres. |
| **ROS Bridge node:test** | `cd ros-bridge-service && npm test` | State builder, order state machine, VDA5050 schema (`test/`). No live MQTT. |

CI (`.github/workflows/ci.yml`) runs both on every push.

## Tier 2 — integration suites (need the full stack up)

Start the full stack first: `.\start-all.ps1` from the repo root. Then:

| Suite | Run | Covers |
|---|---|---|
| **Newman backend HTTP** | `.\docs\postman\run-newman.ps1` | 13 sections / 61 requests against FastAPI — every REST endpoint, CRUD round-trips, 4xx/422/409 negative cases, CORS, `/orders` pagination. Self-cleaning. Writes an HTML report under `docs/postman/reports/`. |
| **PowerShell integration** | `.\scripts\test\run-all.ps1` | Wraps Newman + pytest + node:test + the three integration scripts (ingest, retention, misc). |
| **Playwright frontend E2E** | `cd frontend && npm run e2e` | Non-robot React surface — AppShell, Health, Dashboard, Dispatch (named + manual), Admin CRUD, Orders, OEE. See [`frontend/tests/README.md`](../frontend/tests/README.md). |

The PowerShell integration scripts in `scripts/test/` are also runnable
individually:

| Script | What it asserts |
|---|---|
| [`test-ingest.ps1`](../scripts/test/test-ingest.ps1) | Phase 4: MQTT publish → Node-RED → FastAPI → Postgres row appears. Malformed payload dropped. Direct `/ingest/state` happy path. |
| [`test-retention.ps1`](../scripts/test/test-retention.ps1) | Phase 6 G19: 90-day-old row pruned by retention SQL; recent rows untouched. |
| [`test-misc.ps1`](../scripts/test/test-misc.ps1) | Phase 8 5-rapid-orders distinct, Phase 9 G21 legacy-suffix tolerated, Mosquitto :9001 reachable. |

The wrapper exits non-zero on first failure unless `-ContinueOnFail` is set.
Skip flags: `-SkipNewman`, `-SkipPytest`.

## Tier 3 — manual

Two views of the same checklist:

- [`manual-test-checklist.md`](manual-test-checklist.md) — phase-ordered, with
  `[auto: …]` tags showing which tier already covers each item.
- [`manual-test-by-service.md`](manual-test-by-service.md) — the **leftover**
  manual items (those without `[auto:]`) re-grouped by service. Use this
  when you have 15 minutes and want to spot-check one service end-to-end.

Manual items fall into four buckets:

| Tag | Meaning |
|---|---|
| `[robot]` | Needs a live robot or sim publishing telemetry. |
| `[chaos]` | Needs you to stop or restart a service mid-flight (Postgres, Mosquitto, FastAPI). Hard to script safely on Windows. |
| `[UI]` | Visual / interaction check that automation can't reach (canvas pixel-clicks, key-hold teleop, tooltip hovers). |
| `[ops]` | Config / log inspection. |

## First-time Playwright setup

```powershell
cd frontend
npm install                           # picks up @playwright/test (~40 MB)
npx playwright install chromium       # one-time browser binary (~150 MB, global cache)
```

The browser cache lives under `%LOCALAPPDATA%\ms-playwright\` and is shared
across projects on this machine — you only pay the ~150 MB once per browser
version.

## Where reports land

| Suite | Output |
|---|---|
| Newman | `docs/postman/reports/<timestamp>.{html,json}` |
| pytest | terminal only (add `--junitxml=…` to file it) |
| node:test | terminal only |
| Playwright | `frontend/playwright-report/index.html` (open with `npx playwright show-report`) |
| `scripts/test/*.ps1` | terminal only (each script prints PASS/FAIL per assertion) |

All report folders are in `.gitignore`.

## CI hookup

Today CI runs Tier 1 only (the unit suites — see `.github/workflows/ci.yml`).
Tier 2 needs Mosquitto + Postgres + Node-RED running, so it's local-only for
the moment. Wiring Newman + the PowerShell scripts into CI would require a
docker-compose-based test job; see `docs/plans/` for any active proposals.

# frontend/tests/ — Playwright E2E suite

End-to-end tests covering the non-robot frontend surface (AppShell, Health,
Dashboard, Dispatch, Admin CRUD, Orders, OEE). The suite hits a real backend
(FastAPI + Mosquitto + Postgres); nothing is mocked. The Vite dev server is started automatically by
`playwright.config.ts`.

## First-time setup

```powershell
cd frontend
npm install                              # picks up @playwright/test
npx playwright install chromium          # one-time browser download (~150 MB)
```

## Running

```powershell
# Full stack must be up first (.\start-all.ps1 from the repo root)
cd frontend
npm run e2e                  # headless
npm run e2e:headed           # see the browser
npm run e2e:ui               # Playwright's interactive UI mode

# Single file
npx playwright test tests/e2e/admin-maps.spec.ts

# Open the HTML report from the last run
npx playwright show-report
```

If the dev server is already running and you want Playwright to use it
verbatim (no spawn), set `E2E_NO_WEBSERVER=1`. If your dev server is on a
non-standard port, set `E2E_BASE_URL=http://localhost:6173`.

## What's covered

| File | Manual-checklist items covered |
|---|---|
| `appshell.spec.ts` | Phase 10 AppShell — pills present, LeftNav swaps pane, 404 page, pill tooltip |
| `health.spec.ts` | Phase 10 Health page rows + live timestamp refresh |
| `dashboard.spec.ts` | Phase 11 — tile rendered, click → `/robots/<serial>` |
| `dispatch.spec.ts` | Phase 11 — Named mode happy path, Manual mode happy path |
| `admin-maps.spec.ts` | Phase 12 — Maps CRUD + 409 toast on referenced delete |
| `admin-robots.spec.ts` | Phase 12 — Robots create/edit/delete + 409 on robot with telemetry |
| `admin-fleet.spec.ts` | Phase 12 — Fleet Config form pre-populated + save |
| `orders-oee.spec.ts` | Phase 12 — Order History + OEE empty state |
| `cors.spec.ts` | Phase 9 G18 — no CORS console errors in the browser |

## What's *not* covered (and why)

These items stay in the manual checklist:

- Anything tagged **[robot]** — needs a real robot or sim publishing live
  telemetry. (Map canvas render, pose overlays, teleop key-hold, ENGAGED
  state transitions, in-flight order completion, OEE populated state…)
- Map canvas interactions on Admin → Locations (click to position pin) —
  canvas pixel-driven; brittle under Playwright.
- Snackbar queueing under rapid back-to-back saves — visual timing test.
- Health-pill colour transitions when *Mosquitto* is stopped (admin-level
  service control on Windows is outside Playwright's reach).

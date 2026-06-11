# Continuation Notes — Where We Left Off

> A point-in-time handoff snapshot so work can resume without re-deriving context.
> **This decays** — trust the code and the canonical docs over this page.
> Last updated: 2026-06-11 (**G42 + G43 — ros-bridge crash + Docker robot
> reachability**). Diagnosed from a user-supplied `docker compose up` log
> (`logs.txt`, UTF-16): dispatching an order → `ros-bridge-1 exited with code 1`
> right after `Order accepted`. Cause: `OrderStateMachine._sendCurrentNode`
> published on a `null` `_goalTopic` because `setup()` only runs on rosbridge
> connect, and the bridge never connected — the seeded URL `ws://localhost:9090`
> is the container itself inside Docker. **G42 fix** (`orderStateMachine.js`):
> guard `_sendCurrentNode` on `!this._goalTopic`; `_cancelOrder` uses `?.publish?.`.
> **G43 fix**: `Robot.applyHostOverride` + `ROSBRIDGE_HOST_OVERRIDE` env
> (compose sets `host.docker.internal`, plus `extra_hosts` host-gateway)
> rewrites a loopback rosbridge host for the container only — the browser still
> gets `localhost`. `node:test` 19/19. **User must confirm the sim's rosbridge
> is actually listening on host:9090.** Rebuild: `docker compose build
> ros-bridge && docker compose up -d ros-bridge`. Still-open frontend items from
> errors.txt: status stuck "idle" (consistent w/ ROS never connecting), teleop
> hold-to-send not reaching robot (code looks correct — recheck after rosbridge
> connects, or cmd_vel topic mismatch). See gaps.md G42/G43.
>
> Last updated: 2026-06-10 (**G41 — frontend Docker blank-page fixed**). The
> production bundle threw `Cannot read properties of undefined (reading
> 'ROSLIB')` `at Joe (...)` at import time, so React never mounted (only the
> body background painted). Cause: `roslib`'s CJS entry
> (`node_modules/roslib/src/RosLib.js`) does `var ROSLIB = this.ROSLIB || {…}`;
> `@rollup/plugin-commonjs` rewrites that top-level `this` to the module's
> lazily-initialised exports var, still `undefined` when the line runs (bundle
> showed `var e = wb.ROSLIB || {...}`, `wb` unassigned). Fix: a `pre`-enforced
> Vite transform plugin (`fixRoslibThis` in `frontend/vite.config.ts`) patches
> that line before the commonjs plugin runs, making it
> `globalThis.ROSLIB` (always defined, no `ROSLIB` prop → `|| {…}` fallback
> runs). NOTE: a first attempt using `build.rollupOptions.moduleContext` was
> **inert** (commonjs plugin overrode it → byte-identical bundle, same hash
> `index-B4-jYDby.js`); the working fix changes the hash (Docker image now
> `index-Dt_rQ_Rg.js`) and emits `typeof globalThis<"u"&&globalThis.ROSLIB||…`.
> **Next step for the user: `docker compose build frontend` then
> `docker compose up -d frontend`, and hard-refresh (Ctrl+Shift+R)** — Vite
> inlines env at build time so the image must be rebuilt; verify the served
> bundle hash is NOT `index-B4-jYDby.js`. Docs: gaps.md (G41 closed).
>
> Last updated: 2026-06-09 (**Node-RED demoted to a passive viewer; telemetry
> persistence moved into FastAPI**). Goal: make the stack fully function whether
> Node-RED runs or not. What changed:
> 1. **New `fastapi-service/app/ingest_service.py`** — the single persistence layer
>    (`persist_state` / `persist_connection` / `persist_command` /
>    `persist_oee_cycle`) shared by the MQTT subscriber and the HTTP `/ingest/*`
>    routes. Includes the OEE `deriveCycle` state machine ported from Node-RED
>    (per-robot tracker, emits SUCCEEDED when `nodeStates` empties / ABORTED when
>    `orderId` clears mid-order). Archive cutoff via `ArchivedRobot`.
> 2. **`app/mqtt.py`** now subscribes the four telemetry topics
>    (`state`/`connection`/`order`/`instantActions`) and dispatches each to
>    `ingest_service`; DB/archive errors are swallowed on the paho loop thread so a
>    bad message can't kill it. Still keeps `_connection_states` for `/system/status`.
> 3. **`app/routers/ingest.py`** refactored to delegate to `ingest_service` (kept as
>    a secondary path for manual injection / Test Harness / Newman). 410/503 mapping
>    preserved.
> 4. **`node-red/flows.json`** — runtime tabs 1–3 had their 5 `http request`
>    POST-to-`/ingest` nodes stripped; functions now wire straight to debug
>    (view-only). Tab relabelled "Telemetry (view-only)"; debug nodes renamed
>    "… seen (view-only)". DB Admin tab untouched.
> 5. **Docs**: architecture.md (outbound flow), services/node-red.md (passive
>    viewer), services/fastapi-service.md (MQTT ingestion + new module),
>    failure-matrix.md (Node-RED row now ✅✅✅; FastAPI is sole ingester), gaps.md.
>
> Verification: `python -m pytest` in `fastapi-service` → **66 passed, 1 skipped**
> (new `test_ingest_service.py`, 8 cases); `flows.json` validates as JSON;
> changed Python `py_compile`s clean. **No Docker changes** — `fastapi` compose
> service already has MQTT+DB env + `depends_on` mosquitto/postgres, `COPY . .`
> ships the new module. Safe to `docker compose up --build`.
>
> Open trade-off: FastAPI is now the **sole** telemetry ingester, so its outage
> stops persistence (no parallel writer anymore); no store-and-forward buffer.
>
> Last updated: 2026-06-09 (Docker: slimmed images + scope reversed to a
> supported run/deploy path). **The user changed their mind: Docker is now a
> first-class run AND deployment path, superseding the 2026-06-08 CI-only
> decision below.** Two work items this session:
> 1. **Image hygiene** — `ros-bridge-service/Dockerfile` moved `node:22-slim` →
>    `node:22-alpine` (deps `mqtt`/`roslib`/`dotenv` are pure JS, musl-safe),
>    added `NODE_ENV=production`, `--no-audit --no-fund`, and `USER node`.
>    `fastapi-service/Dockerfile` stays on `python:3.12-slim` (glibc —
>    `psycopg2-binary` ships no musl wheel, alpine would force a source build),
>    added `PYTHONDONTWRITEBYTECODE`/`PYTHONUNBUFFERED`/`PIP_NO_CACHE_DIR`/
>    `PIP_DISABLE_PIP_VERSION_CHECK` and a non-root `appuser`.
>    `frontend/Dockerfile` builder bumped `node:20` → `node:22-alpine`,
>    `npm ci --no-audit --no-fund`. All three `.dockerignore`s tightened (the
>    Dockerfiles themselves, `*.md`, dev-only files; **kept** `frontend/nginx.conf`
>    since stage 2 copies it from context). Validated: `docker compose config`
>    OK and all three images build green (frontend 75.8 MB, fastapi 211 MB,
>    ros-bridge 263 MB). No app code or compose topology changed.
> 2. **Docs reframed** from "CI-only" to "supported run/deploy path": setup.md
>    (new "Run with Docker" section with the `docker compose up --build` step),
>    status.md + thesis-brief/03-status.md ("Docker & ops"),
>    thesis-brief/07-comparison.md, PROJECT_DETAIL.md §8.1, testing.md,
>    postman/README.md, gaps.md (new dated note + G14/G30 entries), CLAUDE.md.
>
> Last updated: 2026-06-08 (Docker scope decision — docs-only pass —
> **SUPERSEDED 2026-06-09, see above**). The user
> confirmed Docker is **not** adopted as a run or deployment path for this
> project. It was never a required deliverable (logged as gap G14/G30, no ADR in
> `decisions.md`), and there is no deploy pipeline — the only consumer is the CI
> Newman smoke job, which boots Postgres + Mosquitto + FastAPI via
> `docker compose` (`.github/workflows/ci.yml`). **Decision: keep all Docker
> files** (`docker-compose.yml`, the three service `Dockerfile`s + `.dockerignore`s,
> `frontend/nginx.conf`) so CI stays green, but **reframe every doc** so Docker
> reads as a CI-only dependency, not a local-dev or deployment path. No files
> were deleted, no code changed. Docs touched: setup.md (Docker TL;DR removed,
> manual run is now the headline), status.md + thesis-brief/03-status.md
> ("Docker & ops"), thesis-brief/07-comparison.md, PROJECT_DETAIL.md §8.1,
> testing.md, postman/README.md, manual-test-checklist.md,
> manual-test-by-service.md, gaps.md (G14/G30 annotated + dated note), CLAUDE.md.
> If Docker should later be fully removed, the alternative was to rewrite the CI
> Newman job to boot the backend natively (postgres service container +
> mosquitto + uvicorn) and then delete the Docker files.
> Last updated: 2026-05-25 (typography + copy consistency pass — all labels,
> headings, buttons, drawer/dialog titles, menu items, and metric cards
> converted to Title Case ("Order History", "System Health", "Admin — Fleet
> Config", "Serial Number", "Page Size", "Avg Duration", "New Robot",
> "Archive Robot amr002?", "Send Order", "+ Add Node", "Load Older", "End
> of History", "All Robots", "Loading Fleet", etc.). Sentence case kept for
> toasts, helper text, dialog body copy, empty states, and tooltip
> descriptors after the verb. Proper-noun exceptions preserved: `rosbridge`
> stays lowercase (project naming convention), `ROS Bridge` stays as the
> service brand, acronyms (OEE/MQTT/API/DB/ROS/VDA5050) preserved.
> `ENGAGED — robot will move` kept all-caps for intentional danger emphasis.
> Frontend typecheck clean. Also synced the schema change (`archived_at`)
> into the Node-RED Reset-DB SQL string in `node-red/flows.json` so the
> DB Admin "Reset" button creates a fresh schema with the column already
> present (no migration needed after a reset).
>
> NOT YET IMPLEMENTED (proposed and designed, awaiting green light): auto-
> generated IDs for `robots.serial_number`, `maps.map_id`, and
> `named_locations.id`. Per-prefix sequencing on robots/maps with optional
> operator-supplied prefix (default "amr" / "map-"); plain sequence on
> named_locations. See the conversation log for the full design.
>
> Last updated: 2026-05-25 (G40 closed — robot soft-delete (archive) shipped.
> New `robots.archived_at TIMESTAMPTZ` column (`docs/schema/migrations/
> 2026-05-25_robots_archived_at.sql` for existing dev DBs; `schema.sql`
> already includes it for fresh installs). Backend: `db.fetch_robots()` now
> filters to active; new `fetch_robots_all()`, `fetch_archived_serials()`,
> `archive_robot()`, `restore_robot()`. `RobotRegistry` tracks an
> `_archived_serials` set so `is_archived()` is O(1) — no per-message DB hit
> on ingest. Routers: `POST /robots/{serial}/archive`, `POST /robots/
> {serial}/restore`, `GET /robots?include_archived=true`. `POST /robots`
> returns a structured 409 (`detail.code="archived_serial"`, plus
> `serialNumber` + `archivedAt`) when the new serial collides with an
> archived row, so the admin UI offers Restore inline. Command paths
> (`/order`, `/instant-actions`, `/state`) return 410 for archived robots
> via `_require_robot`. `/ingest/state|connection|command|oee-cycle`
> return 410 for archived serials. Frontend: `Robot.archivedAt`,
> `archiveRobot()` / `restoreRobot()`, Admin → Robots split into Active +
> Archived sections with Archive (warning-icon) and Restore (primary-icon)
> buttons. ConfirmDialog body explains what archive does. ApiError client
> now surfaces `detail.message` from structured-error responses. Tests:
> `tests/test_robots_archive.py` (15 cases), `tests/conftest.py` extended
> to stub paho `Client` so pytest no longer needs a live Mosquitto.
> `npm run typecheck` clean, `npm run build` clean, pytest 59/59.
> G41 added (cosmetic note: `app/mqtt.py` connect-at-import).
>
> Last updated: 2026-05-25 (frontend polish + distill pass — no behaviour
> change, motion + visual hygiene only. Added `--ease-out` / `--dur-*` motion
> tokens, `:focus-visible` ring, and `prefers-reduced-motion` block to
> `src/index.css`. Introduced shared `useNow` hook so RobotTile no longer
> runs one `setInterval` per tile. Press feedback (`active:scale`), pointer-
> fine hover gating, and keyboard-press sync added to KeyboardPad; LeftNav
> grew a 2 px active indicator and lost its tinted active background; MUI
> dialogs/drawers/snackbar use stronger curves and asymmetric enter/exit;
> `ConfirmDialog` enters from `scale(0.96)` not `0`. AppBar pills moved from
> `title` to MUI `Tooltip`. Snackbar errors now persist until dismissed.
> ErrorList no longer uses a side-stripe border (severity tint instead).
> Distill pass trimmed: RobotTile (dropped Map + rosbridge fields), StateTable
> (16 → 7 fields), Dispatch / Teleop / Health prose, Dashboard subtitle,
> RobotDetail header. Frontend `npm run typecheck` exits 0; `npm run build`
> succeeds with no new warnings.
>
> Last updated: 2026-05-25 (G26 + G27 + G30 + G31 closed in one pass.
> RobotTile drives a 1 s ticker so the "last seen" label counts up between
> MQTT messages; MapCanvas pin labels render inside a slate-900 pill with a
> pin-coloured stroke so they read against both white free-space cells and
> the black out-of-map background; `GET /orders/{id}` added with joined
> nodes+edges (frontend `getOrder` + `OrderDetail` type wired); new
> `frontend/Dockerfile` (multi-stage Node 20 → nginx 1.27) +
> `frontend/nginx.conf` (SPA fallback + asset cache) +
> `frontend/.dockerignore`, `frontend` service added to `docker-compose.yml`
> on host port 5173. Frontend `npm run typecheck` exits 0; pytest
> `tests/test_orders.py` 11/11. Open gaps reduced from 6 to **2** (G32, G39).
>
> Last updated: 2026-05-22 (housekeeping pass — `frontend/tsconfig.tsbuildinfo` untracked from git, ~8 MB of stale generated artifacts cleared from postman reports, playwright report, frontend dist, test-results, and python pycache. All gitignored, no source touched. G34 + G35 closed earlier — instant-action wire format corrected (`action_type` + full VDA5050 names), API client error formatter handles 422 validation arrays, ActiveOrderPanel wires success toasts; Admin DataGrid actions switched from `Button` to `IconButton` so Delete fits the column. G33 + G36 + G37 + G38 closed earlier — the cheap-quartet patch. tsconfig `noEmit: true`; new `NumberField` for select-on-focus + negative/decimal entry; ActiveOrderPanel disables Cancel/Retry/Skip on order complete. G34–G39 added earlier — six frontend bugs filed during the manual-checklist elaboration pass. G24 + G25 closed earlier — DB-down now surfaces as 503 from the affected routes and Health pills degrade to idle when the `/system/status` poll fails. G28 + G29 closed earlier — Frontend and Newman jobs run in CI. Six follow-ups G28–G33 promoted from "untracked next steps" into the gaps tracker; manual-checklist walkthrough surfaced four real bugs — G24–G27 — and a batch of clarifications consolidated in `manual-test-remarks.md`).

---

## Current project state (snapshot)

End-to-end implemented + manually verified:

- **Backend (FastAPI + Mosquitto + ROS Bridge + Node-RED + PostgreSQL)** —
  code-complete, CI green, manually exercised against a real robot. All
  originally tracked gaps **G1–G23 closed** (see `docs/gaps.md`).
- **React frontend (`frontend/`)** — feature-complete v1: Dashboard, Robot
  Detail (live MapCanvas), Dispatch (named + manual), Teleop (camera + 3×3
  keyboard pad), Order History (paged), OEE dashboard (cards + bar chart +
  cycles log), Admin CRUD for Maps / Locations / Robots / Fleet Config, Health
  page. Stack: Vite 6 + React 19 + TS + Tailwind 4 + MUI 7 + MUI X (DataGrid
  & Charts) + TanStack Query + `mqtt` + `roslib`.
- **Realtime split** — MQTT-over-WS to Mosquitto :9001 for low-frequency
  telemetry; rosbridge direct from the browser per robot for high-frequency
  camera + teleop + map.
- **Newman smoke suite** (`docs/postman/`) — **13 sections / 61 requests /
  66 assertions** replayable via `.\docs\postman\run-newman.ps1`. HTML + JSON
  reports. Coverage extended 2026-05-21 with negative-case section (Phase 8),
  CORS pos/neg (Phase 9), and `/orders` cursor pagination.
- **CI** (`.github/workflows/ci.yml`) — three jobs (ROS Bridge, FastAPI,
  Node-RED). FastAPI suite includes `test_orders.py`, `test_cors.py`,
  `test_schemas.py`, `test_auth.py`, `test_config.py`, `test_ratelimit.py`.
  `tests/conftest.py` stubs the four DB calls `RobotRegistry.__init__` makes,
  so router imports don't need a live Postgres in CI.

Nothing tracked as open in `docs/gaps.md`. The manual test checklist
(`docs/manual-test-checklist.md`) is the long-form regression script;
Phase 9–13 cover the new frontend and Phase-0 backend work.

---

## Recently completed (most recent first)

**G26 + G27 + G30 + G31 closed in one pass (2026-05-25, uncommitted).**
Four of the six remaining gaps cleared — two frontend polish, one
backend endpoint, one infra. Open count drops from 6 to **2** (G32, G39).
Typecheck green, pytest `tests/test_orders.py` 11/11.

- **G26 — Dashboard "last seen" tile ticks.** Root cause: `agoLabel(lastSeen)`
  is pure but `lastSeen` only changes when an MQTT `state` or `connection`
  message arrives — between messages the tile never re-renders, so the
  label sat frozen at whatever value it had on the last message
  (often `0s ago`, immediately after a fresh message). Fix: a 1 s
  `setInterval` + a throwaway `setTick` state in `RobotTile.tsx`. The
  `agoLabel` call re-evaluates against `Date.now()` on every tick. Memory
  cost is one timer per visible tile (the same shape as the existing
  per-robot `lastSeen` state).
- **G27 — Map pin labels readable.** Root cause: the old text draw was
  `ctx.fillStyle = 'rgba(255,255,255,0.85)'` with no background — when a
  pin landed on a free-space occupancy cell (rasterised as `v = 255` /
  pure white) the label was white-on-white. Fix: render label inside a
  slate-900 (`rgba(15,23,42,0.85)`) rounded rect with a thin pin-coloured
  stroke; text colour is `slate-100` for AA contrast. Also added a
  slate-900 stroke around the pin circle itself so the marker shows on
  bright free-space areas too. Touch only in `MapCanvas.tsx`.
- **G31 — `GET /orders/{order_id}`.** New endpoint in
  `app/routers/orders.py` + new `db.fetch_order()` helper that borrows
  one pooled connection and runs three queries on the same cursor:
  `orders` header (newest by `ts` if an updated order has multiple rows),
  then `order_nodes` and `order_edges` joined by `order_pk`, both ordered
  by `sequence_id`. 404 on unknown order_id, 503 on DB-down — same
  contract as `/orders`. Three pytest cases added covering header+children,
  404, 503. Frontend wiring: `api/orders.ts` `getOrder(orderId)` and
  `types/api.ts` `OrderDetail` / `OrderNode` / `OrderEdge` — wiring an
  Order History row drill-down is now purely a UI exercise.
- **G30 — Frontend Dockerised.** New `frontend/Dockerfile` (multi-stage,
  `node:20-alpine` builder → `nginx:1.27-alpine` static serve) +
  `frontend/nginx.conf` + `frontend/.dockerignore`. The nginx config
  gives the SPA fallback so a hard refresh on `/robots/:serial` doesn't
  404, long-caches `/assets/*` (Vite emits content-hashed filenames),
  and `no-cache`s `index.html` so the latest bundle hash is always
  re-fetched. `VITE_*` are exposed as build args because Vite inlines
  `import.meta.env.*` at build time (runtime config would have meant a
  config-json fetch + hydration detour). Defaults assume the compose
  stack — host-published ports, browser hits localhost. New `frontend`
  service added to `docker-compose.yml` on host port 5173, depends on
  the `fastapi` healthcheck, has its own `wget /` healthcheck. Rebuild
  against different endpoints with
  `docker compose build --build-arg VITE_API_URL=... frontend`.
- **Verification.** Frontend `npm run typecheck` exits 0; pytest
  `tests/test_orders.py` reports 11 passed (was 8 — three new G31 cases).
  Docker build not exercised locally — it's gated on the docker daemon
  being up; user should `docker compose build frontend` to verify
  before pushing.
- **Docs touched.** `gaps.md` (G26 + G27 + G30 + G31 moved to Resolved with
  detailed notes; at-a-glance trimmed to G32 + G39; header note rewritten),
  `status.md` (date bumped; Docker & ops paragraph notes the new
  frontend service; "Not yet implemented" reduced to 2 open),
  `docs/schema/REST_ENDPOINTS.md` (new `GET /orders/{order_id}` block in
  ToC + section).

**Open gaps now (2):** G32 (MQTT auth + TLS — deliberate FYP-scope
deferral) and G39 (Robot Detail connection pill — needs investigation,
might resolve as EXPECTED VDA5050 contract behaviour). Recommended next
pass: G39 investigation first (cheap; could be a doc-only resolution),
then G32 as the last deliberate infra item.

**Housekeeping pass — generated artifacts cleared, tsbuildinfo untracked (2026-05-22, uncommitted).**
After the G34/G35 patch the working tree had accumulated ~8 MB of
gitignored-but-stale generated files plus one tracked-but-shouldn't-be
artifact. Cleared in one pass:

- **`frontend/tsconfig.tsbuildinfo`** — tracked in git despite the
  `*.tsbuildinfo` rule added to `frontend/.gitignore` in the G33 patch.
  Removed from the index via `git rm --cached`. The local file
  regenerates on the next `tsc -b` run; only the tracked copy was
  stale.
- **`docs/postman/reports/`** — 10 timestamped HTML+JSON reports from
  2026-05-21 (6.1 MB), all predating the G22/G23/G24 fixes so the
  pass/fail picture they captured is no longer current. Cleared. The
  directory itself is gitignored at the repo root; future
  `.\docs\postman\run-newman.ps1` invocations refill it.
- **`frontend/playwright-report/`** — single 540 KB `index.html` from a
  2026-05-21 E2E run. Same reasoning — predates the frontend fixes.
  `npm run e2e` regenerates it.
- **`frontend/test-results/`** — Playwright's per-run scratch dir (only
  `.last-run.json` was present). Regenerates.
- **`frontend/dist/`** — 1.6 MB of build output from the last
  `npm run build` during the G33 verification. Regenerates on demand.
- **`fastapi-service/**/__pycache__/`** — Python bytecode cache from the
  41-passing pytest run. Regenerates on the next test invocation.

No source code touched. All paths are gitignored at the repo level
(`root .gitignore`: `playwright-report/`, `test-results/`,
`docs/postman/reports/`, `__pycache__/`; `frontend/.gitignore`: `dist/`,
`*.tsbuildinfo`). Net effect on the working tree: smaller `du -sh
docs/postman frontend` and one git deletion staged.

**G34 + G35 closed — the medium-severity frontend pair (2026-05-22, uncommitted).**
Both bugs the user flagged as "user-blocking on common UI flows" are
gone. Total open gaps now **6** (was 8). Typecheck + production build
both green.

- **G34 — instant-action UX overhaul.** Initial diagnosis was wrong —
  the `[object Object]` string the user saw was not a broken toast
  renderer; it was a G22-style wire-format mismatch hiding behind a
  poor error formatter:
  1. **Wire format.** `postInstantAction` in `frontend/src/api/robots.ts`
     sent `{"action": "cancel"}` (short, camelCase), but FastAPI's
     `InstantActionRequest` declares
     `action_type: Literal["cancelOrder", "retryNode", "skipNode"]`.
     Every Cancel / Retry / Skip click returned 422. Added an
     `ACTION_TYPE` map and now sends `{action_type: ACTION_TYPE[action]}`.
     TS API surface stays short + camelCase for callers; translation
     lives at the boundary.
  2. **Error formatter.** `apiFetch` in `frontend/src/api/client.ts` used
     `String((payload as { detail: unknown }).detail)`. Fine for a string
     `detail`, but a 422 has `detail: [{...validation errors...}]` →
     `String([{...}])` = `"[object Object]"`. New `formatErrorMessage`
     helper handles all three FastAPI detail shapes: plain string, array
     of validation entries (`loc.path: msg`), single-entry object.
     Means future schema drift on other endpoints surfaces readably,
     not as `[object Object]`.
  3. **Success toast.** `ActiveOrderPanel` now imports `useToast` and
     fires `toast.success(\`${label} sent\`)` / `toast.error(...)` on
     the mutation result. Combined with G37 (already in), the operator
     gets clear feedback and can't fire a stray action against a
     finished order.
- **G35 — Admin DataGrid actions reachable.** There was **never a
  triple-dot menu** — the row-actions column rendered two MUI `Button`
  components. MUI `Button` defaults to `minWidth: 64px`; two of them
  = 128 px in a column with `width: 110`. Delete overflowed and clicks
  on its visible portion landed on Edit. The user's "triple dot"
  mental model was an attempt to explain the broken click. Fixed by
  swapping to `IconButton` (sized to its icon, ~32 px each) wrapped in
  MUI `Tooltip` for hover labels. Applied to Maps + Locations + Robots
  admin grids (Fleet has no row actions). Column width unchanged.
- **Verification.** `npm run typecheck` exits 0. Production build still
  succeeds. Playwright tests use `getByRole('button')` which matches
  both `Button` and `IconButton`, so the existing E2E suite still
  resolves the row-actions correctly.
- **Docs touched.** `gaps.md` (G34 + G35 → Resolved with detailed notes
  on the actual root causes, since both were misdiagnosed by their
  symptoms initially; open-gap roll-up rewritten), `status.md` (open
  count → 6), `manual-test-checklist.md` (three affected cross-refs
  flipped from "GAP G##" to "FIXED — pending re-test"),
  `manual-test-remarks.md` (G34 + G35 entries flipped to RESOLVED THIS
  SESSION with corrected root-cause notes).

**Open gaps now (6):** G26 (last-seen tick), G27 (pin labels), G30
(frontend Dockerfile), G31 (`GET /orders/{id}`), G32 (MQTT auth + TLS),
G39 (connection pill — needs investigation). Recommended next pass:
G26 + G27 (frontend polish, share the dashboard / map files), then G31
(small backend endpoint), then G39 (investigation might resolve as
EXPECTED). G30 + G32 are the biggest remaining items and best done
deliberately.

**Cheap-quartet patch: G33 + G36 + G37 + G38 closed (2026-05-22, uncommitted).**
Four low-severity frontend bugs cleared in one pass; total open gaps
now **8** (was 12). Typecheck + production build both green.

- **G33 — `"noEmit": true` in `frontend/tsconfig.json`.** One-line config
  fix. `npm run build` no longer emits `.js` next to source `.ts` files
  (verified: `Get-ChildItem src -Filter *.js -Recurse | Measure-Object`
  reports 0). Vite still produces `dist/` via its own pipeline. Added
  `*.tsbuildinfo` to `frontend/.gitignore` so the tsc incremental cache
  doesn't get committed.
- **G36 + G38 — new `NumberField` component
  (`frontend/src/components/common/NumberField.tsx`).** Shared root cause:
  MUI `<TextField type="number">` plus `value={number}` + `Number()`
  parsing on every keystroke fights the user when they need a leading
  sign or a partial decimal. The wrapper:
  - Selects all existing text on focus, so typing "2" replaces "0"
    rather than yielding "02" (G36).
  - Keeps a transient string buffer (`""`, `"-"`, `"."`, `"-."`, `"1."`)
    so the parent's numeric state isn't reset to NaN/0 between
    keystrokes, allowing negatives and decimals to be entered naturally
    (G38).
  - Resyncs from external `value` changes (MapCanvas click → parent
    `set('x', …)`) via a `useEffect` that compares `Number(text)` to
    `value`.
  - On blur, normalises unparseable buffers back to "0".
  - Uses `type="text"` + `inputMode="decimal"` so mobile keyboards
    still show the numeric pad without the HTML number input's edge
    cases.
  Swapped into `OrderBuilder.tsx` (Manual mode x/y/θ) and
  `pages/admin/Locations.tsx` (x/y/θ editor). Other admin forms have no
  numeric coord inputs.
- **G37 — ActiveOrderPanel button gating.** Added `done =
  nodeStates.length === 0`. Cancel / Retry / Skip now carry
  `disabled={busy !== null || done}` and a subtext reads "Order
  complete — instant actions disabled. Submit a new order to re-enable."
  Completed orderId stays visible for context. Pairs with G34 (still
  open) — even though the toast is still buggy, there's no longer a way
  to fire a stray instant action.
- **Verification.** `npm run typecheck` exits 0; `npm run build` exits 0
  with the existing chunk-size hint (not an error). Manual re-test
  pending — the bugs were user-observed, so the user is best placed to
  confirm the fixes look right in a browser.
- **Docs touched.** `gaps.md` (G33/G36/G37/G38 moved to Resolved with
  notes; G34/G35/G39 are now the only frontend bugs from the walkthrough
  still open), `status.md` (open count → 8), `manual-test-checklist.md`
  (inline cross-refs flipped from "GAP G##" to "FIXED — pending re-test"
  on the three affected items), `manual-test-remarks.md` (entries
  flipped to RESOLVED THIS SESSION; takeaway open-count reduced).

**Open gaps now (8):** G26 (last-seen tick), G27 (pin labels), G30
(frontend Dockerfile), G31 (`GET /orders/{id}`), G32 (MQTT auth + TLS),
G34 (instant-action toast `[object Object]`), G35 (Admin DataGrid
triple-dot), G39 (connection pill needs investigation). Recommended
next pass: G34 + G35 together (both medium severity, both surface
during normal UI use), then G26/G27 (small polish), then the
investigation on G39, then the bigger infra ones.

**Manual-test-checklist elaboration pass + G34–G39 filed (2026-05-22, uncommitted).**
Worked through every `{Not sure …}` / `{elaborate}` remark the user had
added during the manual walkthrough. Two outputs:

- **Checklist now self-contained.** Items that previously assumed
  unstated context (DevTools steps, SQL repros, "what does this column
  header mean") now carry an inline `_(How to check: …)_` block right
  under the checkbox, so a future tester can re-run them without
  asking. Same treatment given to phase-13 items where the prompt
  "same page as …" had confused which screen was meant. Two malformed
  rows (indented `[x]` missing the `- ` prefix on lines 496 + 601)
  fixed. Banner updated to reflect 41/41 pytest after the G24 tests
  landed.
- **Six new gaps filed (G34–G39)** — frontend bugs surfaced from the
  user's observations during the walkthrough. None of them were
  obvious-from-code, all were "tried it, doesn't work how the spec
  says":
  - **G34** — instant-action toast (Cancel / Retry / Skip) renders
    `[object Object]` instead of the action name. Three rows hit by
    the same bug.
  - **G35** — Admin DataGrid triple-dot row-actions menu can't be
    opened — clicks land on Edit instead, so Delete is unreachable
    from the UI on Maps + Locations + Robots. Workaround: `DELETE
    /maps/<id>` via curl/Swagger.
  - **G36** — numeric inputs in Dispatch (Manual mode) and Locations
    concat the placeholder "0" with typed digits → "02" not "2".
  - **G37** — Cancel / Retry / Skip buttons remain clickable after
    the order completes (stray-action risk). Pairs with G34.
  - **G38** — manual dispatch + location editor reject negative
    coordinates; ROS world frame supports them.
  - **G39** — Robot Detail connection pill stays ONLINE when the
    simulator stops; only flips when rosbridge itself dies. **Needs
    investigation** — may be expected VDA5050 contract behaviour,
    but the user noted "error shows connection error" elsewhere,
    suggesting another channel does see it.
- **Total open gaps now:** 12 (G26 + G27 + G30–G39). Sorted by
  user-blocking severity, G34 and G35 are the two worth fixing first
  — they hit common UI flows. G36 / G38 are cheap polish. G37 pairs
  with G34. G39 is investigation-first.
- **Docs touched:** `gaps.md` (at-a-glance + Detail blocks for
  G34–G39, header note), `manual-test-checklist.md` (inline `GAP G##`
  cross-refs on the six affected items + elaborations on the rest),
  `manual-test-remarks.md` (G24+G25 marked RESOLVED THIS SESSION,
  new Phase 11/12 section consolidating G34–G39 walkthrough
  observations), `status.md` (open-gap roll-up regrouped into
  "Frontend polish" vs "Infrastructure / hardening").

**Manual test checklist counts (post-pass):** 195 checked / 37
unchecked / 232 total → **84.05 % complete**. The unchecked set is
mostly robot-gated items, the still-open G24/G25 manual re-tests,
the G34–G39 boxes (will check after fixes), and a few "destructive
to repro" items (empty fleet, retention).

**G24 + G25 — DB-down properly degrades both backend and frontend (2026-05-22, uncommitted).**
The two medium-severity bugs surfaced by the manual-checklist walkthrough are
closed. Backend now returns 503 (not 500) when Postgres is down; the React
Health pills derived from `/system/status` collapse to idle when the poll
itself fails (no more stale-green).

- **G24 — backend.** `app/db.py`'s lazy connection pool was a one-shot
  translator: it built the pool on first use and correctly mapped failures
  to `DatabaseUnavailable`, but a Postgres outage *after* the pool existed
  raised `psycopg2.OperationalError` from `cur.execute()` unwrapped → the
  routers' `except DatabaseUnavailable` guard didn't fire → HTTP 500.
  Fix: every helper (`_query`, `_execute`, `_execute_returning`,
  `_transaction`, `fetch_latest_state`) now catches
  `(psycopg2.OperationalError, psycopg2.InterfaceError)` and re-raises as
  `DatabaseUnavailable` via a new `_to_unavailable()` helper. That helper
  also calls `_invalidate_pool()` to drop the cached pool — without that,
  every subsequent request would keep re-borrowing the same dead
  connection. `ping()` now runs `SELECT 1` instead of just borrowing
  (pooled connections can stay in the pool's bookkeeping after Postgres
  restarts but be dead on the wire).
- **G25 — frontend.** `useSystemStatus` returns TanStack Query's default
  `data` retention across errors, so `sys.data` still held the last
  successful body when the 5 s poll failed — `dbState = serviceToPill(...)`
  kept showing green. Fix: every pill derived from `sys.data` is gated on
  `sys.isError` (AppBar DB + ROS; Health page MQTT-backend, PostgreSQL,
  rosbridge-fleet, Node-RED rows). On error they collapse to `idle` (grey)
  with tooltip "unknown — API unreachable." The API pill itself, and the
  MQTT browser pill (separate channel), keep their direct signals.
- **Tests.** New `fastapi-service/tests/test_db_unavailable.py` (5 cases):
  pool invalidation, `ping()` true/false, `GET /robots/{serial}/state` →
  503, and `GET /system/status` → 200 with
  `database.status == 'unavailable'` (the response contract G25 relies on).
  Full pytest suite: **41 passed** (was 36). Frontend
  `npm run typecheck` exits 0.

**G28 + G29 — Frontend and Newman jobs added to CI (2026-05-22, uncommitted).**
The two medium-severity CI gaps are closed. `.github/workflows/ci.yml` grew
from 3 to 5 jobs.

- **Frontend job** — `npm ci` (cached against `frontend/package-lock.json`),
  `npm run typecheck` (`tsc -b --noEmit`), `npm run build` (`tsc -b && vite
  build`). Runs on every push / PR. Playwright deliberately excluded — it
  needs the live stack and is the kind of work the Newman job covers at the
  HTTP layer instead.
- **Newman job** — `docker compose up -d --build postgres mosquitto fastapi`,
  poll `docker inspect` for `fastapi`'s healthcheck (up to ~120 s), then
  `npx newman run` the 13-section / 61-request collection with the
  `htmlextra` reporter. JSON + HTML reports uploaded as
  `newman-reports` artifact on every run. On failure: dumps FastAPI
  container logs before tear-down. `node-red` and `ros-bridge` are
  intentionally skipped — the collection only hits the FastAPI HTTP
  surface, and `ros-bridge` would just log connect errors without a real
  rosbridge upstream.
- **Why these were medium, not low.** G22 and G23 (both shipped 2026-05-21)
  were exactly the kind of contract drift that an in-CI Newman job would
  have caught before merge — these jobs close that feedback loop.
- **Docs updated** — `gaps.md` (G28 + G29 moved to Resolved with notes;
  the "Detail" sub-section renamed G30–G33), `status.md` (CI section now
  lists 5 jobs; open-gap count rebalanced).

**Six untracked follow-ups promoted to tracked gaps (2026-05-22, uncommitted).**
`docs/status.md` had a "Not yet implemented (post-v1)" bullet list of things
that should happen but weren't on the tracker. They are now G28–G33 in
`gaps.md`. Two of them (G28 frontend-CI, G29 Newman-CI) were closed in the
same session — see above. Remaining open: G30 (frontend Dockerfile +
compose service), G31 (`GET /orders/{id}` detail endpoint), G32 (MQTT
auth + TLS), G33 (`noEmit: true` in `frontend/tsconfig.json`).

**Frontend typecheck zero-errored + stray .js cleanup (2026-05-22, uncommitted).**
The frontend `npm run typecheck` had been failing with 8 errors; `npm run build`
worked but `tsc -b` (the typecheck phase of build) was also emitting compiled
`.js` files next to every `.ts` source in `frontend/src/`. Both issues addressed
in one pass.

- **8 typecheck errors fixed** across four files:
  - `frontend/src/api/orders.ts` — `ListOrdersQuery` got an index signature so
    it satisfies `apiFetch`'s `Record<string, …>` query type.
  - `frontend/src/vite-env.d.ts` — **new file** with the standard
    `/// <reference types="vite/client" />` directive. This typed
    `import.meta.env` for `branding.ts` + `config.ts` (the 2 `TS2339` errors).
  - `frontend/src/pages/admin/Locations.tsx` + `frontend/src/pages/OEE.tsx` —
    four `valueFormatter` callbacks rewritten to read from the `row` arg
    instead of `value`. MUI X Data Grid v7's `GridValueFormatter` types
    `value` as `never` when the column's `V` generic isn't inferred, which
    was the cause of the four `'never'` errors.
  - Verified: `npx tsc -b --noEmit` exits 0. `npm run build` still produces
    `dist/` cleanly (only the chunk-size > 500 kB warning, which is a perf
    hint, not an error).
- **50 stray `.js` files removed** from `frontend/`:
  - 49 `.js` files under `frontend/src/` (every one had a `.ts`/`.tsx` sibling)
  - `frontend/vite.config.js` (orphan of `vite.config.ts`)
  - `frontend/tsconfig.tsbuildinfo` (tsc incremental cache)
  - These were emitted by `tsc -b` in the build script because `tsconfig.json`
    doesn't set `"noEmit": true` (only the `typecheck` script passes
    `--noEmit` inline). They'll regenerate on the next `npm run build` until
    `noEmit` is added to the config — left for a follow-up since the user
    said cleanup only this session.
- **Gitignore safety net.** Added `typecheck.txt` + `build-output.txt` to
  `frontend/.gitignore` under a new "Throwaway captures" section so future
  log dumps don't get accidentally committed.

**Manual-checklist walkthrough — 4 new gaps + test clarifications (2026-05-22).**
The user worked through `docs/manual-test-checklist.md` end-to-end and added
inline `{…}` remarks to ~20 items. Surfaced four real bugs and a batch of
ambiguous-prompt clarifications. New gaps:

- **G24** — `GET /robots/{serial}/state` and `GET /system/status` return
  **HTTP 500** instead of `503 Database unavailable: …` when Postgres is
  down. The `DatabaseUnavailable` fallback in `app/db.py` is in place but the
  router(s) aren't catching it. Found during Phase 8 chaos test.
- **G25** — Health pills don't update in real time when FastAPI goes down.
  Only the **API** pill flips red; **DB** and **ROS** stay green until the
  page is refreshed (then API red, others idle). They're derived from
  `/system/status` (5 s poll) — on a failed poll the derived pills should
  also degrade, but they don't.
- **G26** — Dashboard tile "last seen" timer stays stuck at `0s ago` rather
  than ticking upward as time passes since the last `state` MQTT message.
  Suspected: the elapsed-time formatter doesn't have a `setInterval` driver,
  or the `lastSeen` state is reset on every render.
- **G27** — Named-location pin **labels** on `MapCanvas` are barely visible
  against the dark slate background (color similarity). Pin markers
  themselves render fine.

A new doc `docs/manual-test-remarks.md` consolidates every item with a remark
(answered "what was asked", "what was observed", "next step"). Several items
that looked like bugs were actually expected behaviour (e.g. mid-order
replacement) or user-side test setup issues (e.g. the G19 retention test
plant timestamp didn't end up 90 d old, so prune correctly left it alone).

**Test-automation suite fully green (2026-05-21, uncommitted).**
Both `.\scripts\test\run-all.ps1` and `npm run e2e` end-to-end passing on a
quiet stack:

- Phase 4 ingestion: **6/6** (`test-ingest.ps1`)
- Phase 6 G19 retention: **6/6** (`test-retention.ps1`)
- Phase 8/9 misc: **4/4** (`test-misc.ps1`)
- Newman backend HTTP: **66/66 assertions** (Phase 4 G20 + Phase 5 OEE + Phase 8 negative cases + Phase 9 CORS + cursor pagination)
- pytest fastapi-service: **36 passed**, 7 deprecation warnings (Pydantic v1 + `app.on_event` migration noise — non-blocking)
- node:test ros-bridge-service: **19/19**
- Playwright frontend E2E: **24/24** (0 skipped, 0 failed, 2.2 min)

Two real bugs surfaced and fixed during this push: **G22** (frontend
`postNamedOrder` sent camelCase but FastAPI expected snake_case — 422 on
every Dispatch → Named send) and **G23** (single-row `/robots/{serial}`
endpoints returned snake_case while the list endpoint returned camelCase —
API self-inconsistency). Both logged in `docs/gaps.md`.

**Test-automation expansion (2026-05-21, uncommitted).** Took the long-form
manual checklist (`docs/manual-test-checklist.md`) and automated everything
that can be automated without a robot or a service-stop-and-restart:

- **Newman collection** (`docs/postman/amr-integration.postman_collection.json`)
  grew from 10 to **13 sections** (61 requests). New sections 11/12/13 cover
  Phase 8 negative cases (missing y, UNKNOWN robot, bogus instant-action type,
  bad map_id, duplicate map_id, 404 trio on `/maps/nope`, `limit=501` clamp),
  CORS positive + negative (allowed Origin gets ACAO; evil Origin doesn't),
  and `/orders` cursor pagination via a captured `cursorTs` variable.
- **PowerShell integration scripts** under `scripts/test/`:
  - `test-ingest.ps1` — Phase 4 MQTT→DB pipeline (state + connection +
    malformed dropped + G20 happy body).
  - `test-retention.ps1` — Phase 6 G19 prune SQL (plant 90-day row, run prune,
    assert recents untouched).
  - `test-misc.ps1` — Phase 8 5-rapid-orders distinct + Phase 9 G21 legacy
    suffix tolerated + Mosquitto :9001 reachable.
  - `run-all.ps1` — wraps all three plus Newman, pytest, and `npm test`.
- **pytest** additions: `fastapi-service/tests/test_retention.py` covers the
  G19 lifespan hook (disabled when `TELEMETRY_RETENTION_DAYS=0`, scheduled
  when >0) and the prune SQL shape.
- **Playwright suite** at `frontend/tests/e2e/` covers the non-robot React
  surface (AppShell + 404 + LeftNav, Health page rows + live timestamp,
  Dashboard render + click-through, Dispatch named/manual happy paths,
  Admin Maps/Robots/Fleet CRUD incl. 409 toasts, Orders + OEE empty state,
  no-CORS-errors check). Added `@playwright/test` devDep, `e2e` / `e2e:ui` /
  `e2e:headed` npm scripts, `playwright.config.ts` that auto-spawns the
  Vite dev server. First-time setup: `npm install` + `npx playwright install
  chromium` (~150 MB).
- **Docs**: `docs/manual-test-checklist.md` got a status legend at the top
  and `[auto: newman|pytest|node|ps|e2e]` tags inline next to every
  automated item. New companion doc `docs/manual-test-by-service.md`
  re-groups the *remaining* manual items by service (Mosquitto, PostgreSQL,
  FastAPI, Node-RED, ROS Bridge, Frontend, cross-service) so spot-checks
  can be picked at random instead of phase-walked.

What's left manual on purpose: `[robot]`-gated items, service-stop chaos
(stop Postgres / stop Mosquitto), Node-RED DB-Admin tab clicks, frontend
visual interactions (canvas pixel-clicks, key-hold teleop, tooltip hovers).

**Node-RED DB Admin — View Tables pipeline (2026-05-21, uncommitted).** Added
a third section to the DB Admin tab so the operator can verify writes from
inside Node-RED without opening psql:

- **Row Counts** button — single `postgresql` node runs a 15-table
  `UNION ALL SELECT COUNT(*)` and prints `{tbl, rows}` to the debug pane.
- **11 per-table buttons** — only the live/log tables: `orders`,
  `order_nodes`, `order_edges`, `instant_action_messages`, `instant_actions`,
  `state_snapshots`, `state_node_states`, `state_action_states`,
  `state_errors`, `connection_log`, `oee_cycles`. Each fires one `SELECT *`
  with `ORDER BY ts DESC LIMIT 20` (or `ORDER BY id` for tables without `ts`).
  Each button has its own debug node so multiple inspections don't overwrite
  each other. The four reference tables (`fleet_config`, `maps`, `robots`,
  `named_locations`) were intentionally omitted — they barely change at
  runtime, and the `Row Counts` button still includes them.

Doc updated: `docs/services/node-red.md` Tab 5.

**Node-RED DB Admin — inline-SQL reset pipelines (2026-05-21, uncommitted).**
The previous `Reset DB` flow read `docs/schema/schema.sql` from disk via a
`file in` node and piped the whole payload into one `postgresql` node. In
practice the read was truncating — the schema only partially applied. Replaced
with two side-by-side reset pipelines on the **DB Admin** tab so we can A/B
which the `node-red-contrib-postgresql` driver actually accepts:

- **Pipeline A** — `inject → Reset Schema (postgresql) → Setup Tables
  (postgresql) → debug`. DDL inline in the first node's `query`, INSERT seed
  inline in the second's.
- **Pipeline B** — `inject → Apply full schema (postgresql) → debug`. The
  entire DDL+seed lives in one node's `query` field.

Both reach the same end state (drop + recreate 15 tables, reseed fleet_config /
maps / robots / named_locations). No filesystem dependency. The `Run custom
SQL` flow is unchanged. Once one pipeline is confirmed working, delete the
other. Doc updated: `docs/services/node-red.md` Tab 5 section.

> Caveat: the inline SQL is a hand-maintained copy of `docs/schema/schema.sql`.
> Edit both when the schema changes. `schema.sql` remains canonical (FastAPI's
> docker-compose still applies it on first boot).

**FastAPI CI fix — DB stub in conftest (2026-05-21, uncommitted).** GitHub
Actions was red because `test_orders.py` imports `app.routers.orders`, which
transitively imports `app.robots`, which constructs `registry = RobotRegistry()`
at module load, which calls `db.fetch_fleet_config()` — no Postgres in CI.

- New `fastapi-service/tests/conftest.py` — starts four `unittest.mock.patch`
  instances against `app.db.fetch_fleet_config`, `app.db.fetch_robots`,
  `app.db.fetch_max_header_ids`, `app.db.fetch_max_order_suffixes` returning
  canned fleet data (one robot `amr001`, identity `amr/v2/moverobotic`).
- `conftest.py` is loaded by pytest before any test file, so the patches are
  in place when the module-level `RobotRegistry()` call fires.
- Production fail-fast design unchanged: `app/robots.py` still raises if
  Postgres is unreachable at startup; only the test-time path gets a stub.
- After this change the FastAPI CI job is green.

**Newman smoke-test suite (2026-05-21, uncommitted).** Replayable HTTP smoke
tests for the FastAPI gateway.

- New folder `docs/postman/` with:
  - `amr-integration.postman_collection.json` — collection v2.1 with 10
    grouped sections (health, fleet, robots read/write, orders + instant
    actions, order history, OEE, maps + locations CRUD, ingest). Every
    request carries at least a status-code assertion; CRUD blocks are
    self-cleaning.
  - `local.postman_environment.json` — `baseUrl` + `apiKey` placeholders.
  - `run-newman.ps1` — wraps `npx newman run` with CLI + JSON + HTML reporters.
    First run pulls `newman` + `newman-reporter-htmlextra` via the npx cache.
  - `README.md` — usage, what's covered, how to add tests, CI pointer.
- Pre-request script strips the `X-API-Key` header automatically when the
  environment's `apiKey` is empty, so the same collection works against an
  open-API local FastAPI and a locked-down deployment.
- `docs/manual-test-checklist.md` Conventions block now points to the Newman
  runner as the preferred path for HTTP smoke; the manual checklist remains
  for the behavioural scenarios Newman can't easily express.

**React frontend — Phase 4 analytics + admin (2026-05-20, uncommitted).** Every
route is now a real screen. The UI is feature-complete for v1.

- **Cross-cutting polish** — `SnackbarProvider` (wrapped in `AppProviders`)
  with a `useToast()` hook (`success`/`error`); `ConfirmDialog` for
  destructive actions; `EditDrawer` with header/body/footer slots that the
  four admin pages reuse.
- **Order History** (`/orders`) — DataGrid off `GET /orders` with
  `useInfiniteQuery`. Filter by robot, choose page size (25–200). "Load older"
  uses the last row's `ts` as the cursor; button changes to "End of history"
  when there's no more.
- **OEE** (`/oee`) — robot picker; four summary cards
  (`total`/`succeeded`/`failed`/`avg`) with success-rate hint, an availability
  bar, an MUI X `BarChart` of recent cycle durations, and a paginated
  cycles log via DataGrid.
- **Admin → Maps** — DataGrid + + Add / edit drawer / delete with 409
  surfaced as a toast; the EditDrawer keeps the ID field read-only on edit.
- **Admin → Named Locations** — same DataGrid pattern; the edit drawer embeds
  the Phase 3 `MapCanvas` and binds `onClickWorld` so clicking on the map
  sets `x` / `y` in the form. Pins re-render live as you type the label.
- **Admin → Robots** — DataGrid + drawer; `createRobot` / `updateRobot` /
  `deleteRobot` added to `api/robots.ts`. A persistent `Alert` reminds the
  operator that adding a robot still needs a ROS Bridge restart.
- **Admin → Fleet Config** — single form (interface_name, major_version,
  version, manufacturer) with a warning callout explaining that
  topic-prefix-affecting fields will silence robot firmware listening on the
  old prefix.
- **Deps** — added `@mui/x-data-grid` + `@mui/x-charts` (`^7.20.0`) to
  `frontend/package.json`. Run `npm install` again before `npm run dev`.

**React frontend — Phase 3 v1 screens (2026-05-20, uncommitted).** Dashboard,
Robot Detail (with live map), Dispatch, and Teleop are all real and reachable.
Order History, OEE, and the Admin pages are still Phase 4 placeholders.

- **Foundation** — `helper/angleHelper.ts` (degrees ↔ quaternion, direct port
  of the v1 interface helper); `helper/mqttTopics.ts` (VDA topic builder from
  fleet config); `types/ros.ts` (OccupancyGrid, Pose*, Path, CompressedImage,
  Twist). Rosbridge client extended with `subscribeRosTopic` /
  `acquireRosPublisher`. New hooks: `useRosTopic`, `useRosPublisher`,
  `useRobotState` (REST cold-load + MQTT live merge).
- **MapCanvas** (`components/map/MapCanvas.tsx`) — full custom canvas
  renderer, no `ros2djs`. Subscribes per-robot to `/reference/map`,
  `/amcl_pose`, `/robot_pose_ekf_node/odom_combined`, and the two DWA plan
  topics. ROS Y-flip + offscreen canvas for the bitmap, world→pixel transform
  for overlays. AMCL primary, EKF fallback after 2 s silence; the arrow gets
  an amber fill on fallback so the operator notices. Responsive via
  ResizeObserver. Click → world coordinate (used in Dispatch later).
- **Dashboard** — fleet grid of `RobotTile`. Each tile shows the connection
  state, mode, battery, current orderId, "last seen", map, and per-robot
  rosbridge status. Clicking a tile navigates to `/robots/:serial`.
- **Robot Detail** — MapCanvas left, tabbed side panel (State / Errors /
  Actions) right. Named-location pins drawn on the map from
  `/locations` filtered to the robot's map. Errors tab badge-counts the
  current error list.
- **Dispatch** — robot picker + Named-or-Manual toggle. Named mode adds
  locations from `/locations` (filtered to the robot's map) in order;
  manual mode is one-or-more x/y/θ rows. Below the builder, `ActiveOrderPanel`
  shows the live orderId, remaining `nodeStates`, and the Cancel / Retry /
  Skip buttons (instant actions).
- **Teleop** — robot picker + ENGAGED toggle (gates publishing). Camera
  stream (`/camera/front/image_raw/compressed`) on the left, 3×3 keyboard pad
  on the right. Velocity table inherits the v1 contract — LINEAR 0.3 m/s,
  ANGULAR 0.5 rad/s, 100 ms repeat — QWE/ASD/ZXC layout, mouse + touch +
  keyboard. Releases publish a zero Twist; auto-disengages if rosbridge
  drops.
- **Docs** — `schema/ROS_TOPICS.md` gained a "consumed directly by the React
  frontend" table at the top so the ROS-side contract is one click away.

Next (Phase 4): Order History (`GET /orders`, paged with cursor), OEE charts
(MUI X Charts on `GET /robots/{serial}/oee/*`), and the four Admin pages
(Maps, Locations, Robots, FleetConfig — DataGrid + drawer-style edit forms
on the existing CRUD endpoints).

**React frontend — Phase 2 connectivity layer (2026-05-20, uncommitted).** All
three live channels (REST, MQTT, rosbridge) are wired and the AppBar pills +
Health page show live data. Screens themselves still placeholder — Phase 3
builds the v1 features on top of this.

- **Typed REST client** — `src/api/client.ts` is a single `apiFetch` wrapper
  (base URL, optional `X-API-Key` from `VITE_API_KEY`, JSON body/parse, typed
  `ApiError`). Per-router modules `fleet.ts`, `robots.ts`, `orders.ts`,
  `system.ts`, `maps.ts`, `locations.ts`, `oee.ts` expose one async function
  per endpoint. Response types in `src/types/api.ts` are hand-written to match
  the FastAPI shapes — OpenAPI generation deferred (needs running backend).
- **MQTT singleton** — `src/realtime/mqttClient.ts` opens one WS to
  `VITE_MQTT_WS_URL` lazily on first subscribe/status listener. Reference-counted
  subscriptions, MQTT wildcard matching (`+`/`#`), JSON auto-parse, status
  observable, mqtt.js exponential reconnect with re-subscribe on reconnect.
- **Rosbridge factory** — `src/realtime/rosbridgeClient.ts` keeps one
  `ROSLIB.Ros` per URL, cached. `acquireRos(url)` + `release()` ref-counts
  the connection. `onRosStatus(url, listener)` is the per-robot status
  observable. Custom exponential backoff (1 s → 30 s). Topic / publisher /
  service wrappers deferred to Phase 3.
- **Hooks** — `useFleet` (React Query, `/fleet`), `useSystemStatus` (5 s
  poll, no retries — failure = red pill), `useMqttStatus`, `useMqttTopic`
  (returns `{ payload, topic }`), `useRosStatus(url)`.
- **AppBar pills** — four live pills: **API** (from `useSystemStatus`),
  **MQTT** (from `useMqttStatus`), **DB** + **ROS** (from
  `/system/status` body). Tooltips on each show the underlying state.
- **Health page** — upgraded from placeholder to a real readout: 6 service
  rows (FastAPI, MQTT browser, MQTT backend, Postgres, rosbridge fleet,
  Node-RED) with state pills + descriptive subtext.

Next (Phase 3 — v1 screens):
1. Dashboard — pulls `useFleet` + MQTT `state`+`connection` per robot,
   renders RobotTile grid.
2. Robot detail — map (`/reference/map` over rosbridge), pose arrow
   (AMCL primary, EKF fallback), order path overlays, errors panel.
3. Order dispatcher — click-on-map / named-location / x,y,θ inputs;
   POST + active-order panel with cancel/retry/skip.
4. Teleop — camera + 3×3 keyboard pad publishing `/web_teleop/cmd_vel`
   (LINEAR_SPEED 0.3, ANGULAR_SPEED 0.5, 100 ms repeat — inherited from
   the old interface).

**React frontend — Phase 1 scaffold (2026-05-20, uncommitted).** New `frontend/`
workspace; routes, layout, and branding are reviewable. No data wiring yet —
that lands in Phase 2.

- **Stack:** Vite 6 + React 19 + TypeScript, Tailwind 4 + MUI 7 (Tailwind
  `important: 'html'` so utilities win over MUI's component styles), TanStack
  Query, `mqtt`, `roslib`. Path alias `@/* → src/*`.
- **AppShell** — `components/layout/{AppShell,AppBar,LeftNav}.tsx`. Permanent
  left nav with two sections (Operate, Admin); the AppBar carries the brand
  logo + name and three stub StatusPills (MQTT / DB / ROS) that Phase 2 will
  wire to live data.
- **Branding** — `src/branding/branding.ts` is the single source of truth
  consumed by both Tailwind (build-time via `tailwind.config.ts`) and MUI
  (runtime via `AppProviders.tsx`). Default palette inherits the previous
  interface (slate-900 / indigo-500). Editing one file rebrands the app.
- **Routes** — `/`, `/robots`, `/robots/:serial`, `/dispatch`, `/orders`,
  `/oee`, `/teleop`, `/teleop/:serial`, `/health`, `/admin/{maps,locations,robots,fleet}`,
  `*` (404). Every page is a `PagePlaceholder` shell that names which phase
  will deliver it. The router compiles and navigates without any backend
  running.
- **Dev experience** — Vite proxies `/api/*` → `VITE_API_URL` so the React app
  can call same-origin paths in dev (CORS is still in place on the backend as
  a backup for prod). `.env.example` documents all `VITE_*` vars.
- **Docs** — new `frontend/README.md`; `docs/setup.md` got a step 6 and four
  `VITE_*` rows in the env-vars table.

**Next (Phase 2 — connectivity layer):** add `src/api/*` (typed REST client
wrappers, one per FastAPI router), `src/realtime/{mqttClient,rosbridgeClient}.ts`,
`src/hooks/{useFleet,useRobotState,useMqttTopic,useRosTopic,useSystemStatus}.ts`,
generate `types/openapi.d.ts` from FastAPI's `/openapi.json`, and wire the
three header StatusPills + the Health page to live data. Phase 3 builds the
v1 screens on top.

**React frontend — Phase 0 backend prep (2026-05-20, uncommitted).** Backend
work that unblocks the new React UI; no frontend code yet.

- **G18 closed — CORS.** `main.py` registers `CORSMiddleware`; origins from
  `CORS_ORIGINS` env (comma-separated, default `http://localhost:5173`).
  `.env.example` and `schema/REST_ENDPOINTS.md` document the var. The last open
  audit gap is now resolved.
- **New `GET /orders` endpoint** — paged historical order list for the UI's
  Order History screen. Filters: `serial`, `limit` (1–500, default 50), `before`
  (ISO timestamp cursor). New `routers/orders.py` + `db.fetch_orders()`
  (LEFT JOIN-aggregating `node_count` from `order_nodes`). Registered guarded
  by `X-API-Key` in `main.py`. Documented in `schema/REST_ENDPOINTS.md`.
- **Mosquitto WebSocket listener on port 9001** for the browser MQTT client.
  Added to `mosquitto/mosquitto.conf` (3-line block, `protocol websockets`,
  anonymous), exposed in `docker-compose.yml`. Backend services still use 1883
  unchanged. Documented in `schema/MQTT_TOPICS.md` (new "Broker listeners" §).
- **Tests** — `tests/test_orders.py` (5 SQL-shape + 3 router cases) and
  `tests/test_cors.py` (4 origin / preflight cases). `httpx` added to
  `requirements-dev.txt` for `TestClient`.

Next: Phase 1 — scaffold `frontend/` (Vite + React + TS + Tailwind + MUI), wire
the realtime singletons (REST client, MQTT-over-WS, rosbridge per robot), and
deliver the AppShell + health pills as the first vertical slice. ROS contract
to follow is captured in `docs/old-interface/PROJECT_OVERVIEW.md` (map topic
`/reference/map`, camera `/camera/front/image_raw/compressed`, teleop
`/web_teleop/cmd_vel`, action `/move_base`, degrees-at-UI angle convention).

**Node-RED DB Admin tab + db.py startup-crash fix (2026-05-20, uncommitted).**

- **`fetch_max_order_suffixes` crash on startup.** When seeding the per-robot
  order-suffix counters (G21), `app/db.py` was casting
  `split_part(order_id, '-order-', 2)` to INTEGER for every row in `orders`.
  Legacy / hand-inserted `order_id` values whose suffix wasn't numeric (e.g.
  a row whose suffix happened to be `goal`) made the CAST throw
  `InvalidTextRepresentation` and FastAPI failed to boot. Fixed by filtering rows
  to the canonical template — `WHERE split_part(order_id, '-order-', 2) ~ '^[0-9]+$'`
  — so non-matching rows are ignored.
- **New "DB Admin" tab in `node-red/flows.json`.** Two utility flows:
  - **Reset DB** — `inject` → `file in` reads `docs/schema/schema.sql` from disk
    → `postgresql` node executes it → `debug`. Drops + recreates all 15 tables
    and reseeds `fleet_config`, `maps`, `robots`, `named_locations`.
  - **Run custom SQL** — `inject` (editable SQL payload, preloaded with
    commented examples) → `postgresql` node → `debug`. For ad-hoc inserts.
  - Shared config node `db-pg-config` (host=localhost, db=amr_integration,
    user=postgres, password=admin) targets the same instance as
    `docker-compose.yml`.
- **Dependency:** `node-red-contrib-postgresql` (`~0.15.4`) added to
  `node-red/package.json`. `npm install` in `node-red/` before next Node-RED
  start.
- Docs updated: `docs/gaps.md` (note on G21 fix), `docs/services/node-red.md`
  (Tab 5 added), `docs/setup.md` (step 4b + DB-reset tip).

**Gaps G15–G21 closed except G18 (2026-05-18, uncommitted).** Six of the seven
audit gaps are resolved; **G18 (CORS) was deferred by the user** — not needed until
the React frontend work begins, kept open in [gaps.md](gaps.md).

- **G16 — DB connection pooling.** `app/db.py` serves connections from a lazily
  built `psycopg2.pool.ThreadedConnectionPool`; `_transaction` / `_query` /
  `_execute` borrow + return instead of connect-per-query. New `_execute_returning`
  helper for writes with `RETURNING` (also translates integrity errors). Pool size:
  `DB_POOL_MIN` / `DB_POOL_MAX`. `DatabaseUnavailable` fallback preserved.
- **G21 — counter persistence.** `RobotRegistry` seeds `headerId` / `orderId`
  counters from the DB at startup (`db.fetch_max_header_ids`,
  `db.fetch_max_order_suffixes`) so a restart resumes rather than resets.
- **G20 — ingest validation.** `/ingest/*` routes typed with Pydantic models
  (`IngestStateMessage` etc. in `app/schemas.py`, `extra="allow"` for VDA5050
  arrays); malformed payloads → 422, not 500.
- **G15 — reference-data CRUD.** New `routers/maps.py`, `routers/locations.py`;
  robot CRUD added to `routers/robots.py`; `PUT /fleet` added to `routers/fleet.py`.
  `db.py` CRUD helpers; `IntegrityConflict` → HTTP 409 (FK never cascaded).
  `registry.reload()` after robots / fleet_config writes. Registered in `main.py`.
- **G17 — navigation-failure observability.** `OrderStateMachine` records a
  `navigationFailed` error on a non-`SUCCEEDED` result and exposes `getErrors()`;
  `StateBuilder` merges it into `state.errors`. Cleared on the next node success.
- **G19 — telemetry retention.** `main.py` background task prunes `state_snapshots`
  + `connection_log` older than `TELEMETRY_RETENTION_DAYS` (default 30; 0 disables)
  every 6 h via `db.prune_telemetry`.
- **Tests.** ROS Bridge `npm test` — 19 passing (added G17 cases). FastAPI new
  `tests/test_schemas.py` (8 tests, ingest + CRUD model validation) — passing.

**Gap audit — G15–G21 opened (2026-05-18).** A code review surfaced seven gaps;
see [gaps.md](gaps.md).

**Operational gaps G10/G11/G13/G14 closed (2026-05-18, uncommitted).** The last four
operational-readiness gaps are resolved — all of G1–G14 are now done.

- **G10 — authentication.** New `fastapi-service/app/auth.py`: opt-in `X-API-Key`
  auth via the `API_KEY` env var (unset = open API, the local-dev default). Guards
  the client-facing routers (`robots`, `fleet`, `system`, `oee`); `/ingest/*` is
  left open as the internal Node-RED → DB boundary. The ROS Bridge (`index.js`)
  sends the key on `GET /fleet` when `API_KEY` is set.
- **G11 — rate limiting.** New `fastapi-service/app/ratelimit.py`: a per-client-IP
  sliding-window middleware, `RATE_LIMIT_PER_MINUTE` (default 120, `0` disables).
  `/ingest/*` and docs routes are exempt; over-limit → 429 + `Retry-After`.
- **G13 — tests.** ROS Bridge `node:test` suite under `ros-bridge-service/test/`
  (15 tests, `npm test` — passing locally). FastAPI `pytest` suite under
  `fastapi-service/tests/` (config/auth/ratelimit); needs `requirements-dev.txt`
  installed — **not run locally yet** (pytest not installed in this environment),
  but wired into CI. `mapStatus` was exported from `orderStateMachine.js` for tests.
- **G14 — Docker & CI.** `Dockerfile` for each service, root `docker-compose.yml`
  (full stack, healthcheck-gated start order, auto-applies `schema.sql`),
  `.github/workflows/ci.yml`. `mosquitto/mosquitto.conf` was written (it was empty).
  `node-red/flows.json` MQTT broker host is `${MQTT_HOST}` (a whole-property
  `${ENV}` — Node-RED substitutes those). The `/ingest/*` HTTP URLs are built in
  the validating `function` nodes via `env.get('FASTAPI_HOST')` and passed as
  `msg.url` (the `http request` nodes have a blank `url`) — embedded `${ENV}` in a
  URL string is *not* substituted by Node-RED, so this is the reliable form. Both
  default to `localhost` via `settings.js`; docker-compose overrides them
  (`MQTT_HOST: mosquitto`, `FASTAPI_HOST: fastapi`).

**Real map seed data (2026-05-18, uncommitted).** `docs/schema/schema.sql` —
replaced the `'default'` placeholder map with two real maps, `map-001`
("Default Sim World") and `map-002` ("Office CPR"). `amr001` and all four named
locations re-pointed from `'default'` to `map-001`. Added the `map-NNN`
(zero-padded 3-digit) naming convention so maps stay filterable
(`WHERE map_id LIKE 'map-%'`) and sortable. This resolves the old placeholder-`mapId`
caveat. No code changes — seed data only.

**The VDA5050 migration is fully implemented — Phases 0–7 done** (see
[plans/vda5050-migration.md](plans/vda5050-migration.md)). The project has moved off
the legacy `amr/*` scheme entirely; it now speaks VDA5050 end to end and is
multi-robot capable.

1. **Phase 0** — `docs/schema/VDA5050_MESSAGES.md`; `ros-bridge-service/robots.config.json`.
2. **Phase 1** — `ros-bridge-service` refactored into `Robot` + `FleetManager` classes.
3. **Phases 2 & 3** — `ros-bridge-service` rewritten for VDA5050: `vda5050.js`,
   `orderStateMachine.js`, `stateBuilder.js`; `Robot` subscribes `order`/
   `instantActions`, publishes `state`/`connection` (retained, `CONNECTIONBROKEN`
   Last-Will). `navigation.js`/`navFeedback.js`/`health.js` deleted. Per-robot MQTT
   client.
4. **Phase 4** — `fastapi-service` is the FMS gateway: `app/robots.py`, `app/vda5050.py`,
   robot-scoped routes; `routers/amr.py` deleted; `requirements.txt` added.
5. **Phase 5** — `node-red/flows.json` rewritten: Telemetry Ingestion, Command Audit,
   OEE, Test Harness tabs. Persists via HTTP POST to FastAPI `/ingest/*`.
6. **Phase 6** — `docs/schema/DATABASE_SCHEMA.md` rewritten serial-keyed; FastAPI
   `app/db.py` (lazy psycopg2) + `routers/ingest.py`.
7. **Phase 7** — `robots.config.example.json`; all schema docs + `architecture.md`,
   `status.md`, `gaps.md` updated.
8. **Knowledge-base sync** — `README.md`, `overview.md`, `setup.md`, `decisions.md`,
   `glossary.md`, all three `docs/services/*.md`, and the project memory updated to the
   VDA5050 implementation.
9. **Full database normalization (2026-05-17)** — the schema is now fully normalized
   (1NF-strict, BCNF — 14 tables). `DATABASE_SCHEMA.md` rewritten; `app/db.py` write
   helpers are multi-table transactions; `routers/ingest.py` and `node-red/flows.json`
   unchanged; `decisions.md` + `gaps.md` updated. See § below.

## Current state

- **Code-complete and syntax-checked, NOT end-to-end runtime-tested.**
  - ros-bridge-service: all files `node --check` + module-graph import OK;
    `npm test` (15 `node:test` tests) passing.
  - fastapi-service: all files `py_compile` OK; `pytest` suite written, runs in CI,
    not yet run locally (pytest not installed here).
  - node-red/flows.json: valid JSON, node-graph integrity OK.
- **Gaps G1–G17, G19–G21 resolved; only G18 (CORS) open** ([gaps.md](gaps.md)).
  G18 was deferred by the user until the React frontend work begins.

---

## ✅ DONE: full database normalization (2026-05-17)

The Phase 6 schema stored VDA5050 arrays as **JSONB** (a 1NF violation). It has been
rewritten as a fully normalized, 1NF-strict, BCNF relational schema — **14 tables**,
with real foreign keys (every log table FKs `serial_number` → `robots`).

### Schema — 14 tables

| Group | Tables |
|---|---|
| Reference (3) | `maps`, `robots`, `named_locations` |
| Orders (3) | `orders` (header), `order_nodes` (`nodePosition` flattened in), `order_edges` |
| Instant actions (2) | `instant_action_messages` (header), `instant_actions` |
| State (4) | `state_snapshots` (scalar only), `state_node_states`, `state_action_states`, `state_errors` |
| Connection + OEE (2) | `connection_log`, `oee_cycles` |

- The JSONB `order_log` table is gone; the JSONB columns on `state_snapshots` are gone.
- VDA5050 subset: order/edge `actions[]`, state `edgeStates[]`, `actionParameters[]`
  are always empty — no tables for them (documented in `DATABASE_SCHEMA.md`).
- Trade-off: each `state` message is now a multi-row transaction; `state_node_states`
  is the fastest-growing table. Fine for the FYP; documented.

### What changed

- `docs/schema/DATABASE_SCHEMA.md` — rewritten for the 14-table schema + Normalization §.
- `fastapi-service/app/db.py` — `insert_state()` / `_insert_order()` /
  `_insert_instant_actions()` are multi-table transactions via a new `_transaction()`
  context manager; `fetch_latest_state()` joins child tables back. `py_compile` OK.
- `fastapi-service/app/routers/ingest.py` — **unchanged** (`insert_command(kind, msg)`
  signature kept; dispatch is internal to `db.py`).
- `node-red/flows.json` — **unchanged**.
- `docs/decisions.md` + `gaps.md` — updated.
- `docs/schema/schema.sql` — added as the runnable copy of the schema (also drops the
  legacy `order_log` table).

## ✅ DONE: G7 + G8 + G9 (2026-05-17)

- **G7 — `/system/status` roslib + Node-RED.** FastAPI's MQTT client (`app/mqtt.py`)
  now subscribes the retained `connection` topics; `roslib_status()` infers rosbridge
  liveness from them. `node_red` is a best-effort HTTP probe of `NODE_RED_URL` (default
  `http://localhost:1880`). Neither field is `unknown` in normal operation.
- **G8 — named locations from the DB.** `POST /robots/{serial}/order/named` now reads
  the `named_locations` table via `db.fetch_named_locations()`; `app/data.py` deleted.
  `theta` is read straight from the table (radians) — the old degrees→radians
  conversion is gone.
- **G9 — env-var validation + `.env.example`.** FastAPI validates required vars at
  startup via `app/config.py` (`validate_env()` in `main.py`); the ROS Bridge checks
  in `index.js`. Both fail fast with a clear message. `.env.example` committed for both
  services.

## ✅ DONE: database as single source of truth (2026-05-17)

The fleet definition was duplicated — `robots.config.json` *and* a hand-copied DB seed.
It now lives **only in the database**:

- New `fleet_config` single-row table (interfaceName/majorVersion/version/manufacturer);
  `robots.manufacturer` column dropped. Schema is now **15 tables**.
- FastAPI `RobotRegistry` (`app/robots.py`) loads the fleet from the DB at startup via
  `db.fetch_fleet_config()` + `db.fetch_robots()`.
- New `GET /fleet` endpoint (`app/routers/fleet.py`).
- ROS Bridge `index.js` fetches `GET /fleet` from `FLEET_API_URL` at startup;
  `FleetManager` takes the config object instead of reading a file.
- `robots.config.json` + `robots.config.example.json` **deleted**; `ROBOTS_CONFIG`
  env var gone; ROS Bridge gains `FLEET_API_URL`.
- **Start order now matters:** PostgreSQL → FastAPI → ROS Bridge (startup deps, not
  retried).

### NEXT: runtime-test the pipeline

- **Runtime-test the pipeline** — needs MQTT broker, rosbridge + a robot, PostgreSQL.
  Either `docker compose up --build` (brings up the whole stack in order and
  auto-applies the schema), or manually: `pip install -r fastapi-service/requirements.txt`;
  create the DB + apply `docs/schema/schema.sql`; start services **in order**
  (Postgres → FastAPI → ROS Bridge → Node-RED). Then `POST /robots/amr001/order` and
  verify auto-advance, instant actions, and the retained `CONNECTIONBROKEN`.
- Run the FastAPI `pytest` suite once `requirements-dev.txt` is installed.
- All gaps G1–G14 are resolved. The reference-data CRUD API (G15) is the next
  feature — see the PLANNED section below.

---

## ✅ DONE: CRUD API for reference data (G15) — 2026-05-18

Per-row CRUD for the reference tables is implemented as designed below. Endpoints:
`maps` (`routers/maps.py`), `named_locations` (`routers/locations.py`), robot CRUD on
`routers/robots.py`, `PUT /fleet` on `routers/fleet.py`. FK / unique violations →
HTTP 409 via `db.IntegrityConflict` (never cascaded); `registry.reload()` runs after
robots / fleet_config writes. The original design follows for reference.

### Endpoints to add

| Resource | Routes | Router file |
|---|---|---|
| Maps | `GET /maps`, `GET /maps/{map_id}`, `POST /maps`, `PUT /maps/{map_id}`, `DELETE /maps/{map_id}` | new `routers/maps.py` |
| Named locations | `GET /locations`, `GET /locations/{id}`, `POST /locations`, `PUT /locations/{id}`, `DELETE /locations/{id}` | new `routers/locations.py` |
| Robots | add `GET /robots/{serial}`, `POST /robots`, `PUT /robots/{serial}`, `DELETE /robots/{serial}` (`GET /robots` exists) | extend `routers/robots.py` |
| Fleet config | add `PUT /fleet` to update the single `fleet_config` row (`GET /fleet` exists) | extend `routers/fleet.py` |

### Files to change

1. `fastapi-service/app/db.py` — add write helpers: `insert_map`/`update_map`/
   `delete_map`, `insert_robot`/`update_robot`/`delete_robot`,
   `insert_named_location`/`update_named_location`/`delete_named_location`,
   `update_fleet_config`. Single-row read helpers (`fetch_map`, `fetch_robot`, …) as
   needed. Reads `fetch_robots`/`fetch_named_locations`/`fetch_fleet_config` exist.
2. `fastapi-service/app/schemas.py` — Pydantic create/update models
   (`MapIn`, `RobotIn`, `NamedLocationIn`, `FleetConfigIn`).
3. `fastapi-service/app/routers/maps.py`, `locations.py` — new; register in `main.py`.
4. `fastapi-service/app/routers/robots.py`, `fleet.py` — add the robot / fleet routes.
5. `docs/schema/REST_ENDPOINTS.md`, `DATABASE_SCHEMA.md` — document the new endpoints.

### Cross-cutting concerns (must handle)

- **FK conflicts → HTTP 409.** Deleting a `map` that `robots` or `named_locations`
  still reference, or a `robot` that already has telemetry rows, raises a Postgres FK
  violation. Catch it and return **409 Conflict** with a clear message — do **not**
  cascade-delete (that would wipe telemetry history).
- **Registry refresh.** FastAPI's `RobotRegistry` loads the fleet **once at startup**.
  After any `robots` / `fleet_config` write, call a new `registry.reload()` (re-runs
  `fetch_fleet_config()` + `fetch_robots()`; keeps the in-memory `headerId`/`orderId`
  counters). Otherwise the new robot is invisible until a restart.
- **ROS Bridge still needs a restart for a new robot.** It instantiates one `Robot`
  per `GET /fleet` entry **at boot**. CRUD makes the DB live-editable, but a newly
  added robot only starts running after the ROS Bridge restarts. Document this; a
  later improvement could have the ROS Bridge re-poll `/fleet`.
- **Validation.** Enforce existing constraints at the API layer too — e.g. a robot's
  `mapId` must reference an existing map; reject before hitting the DB for a clearer
  error.

### Suggested sequencing

`maps` + `named_locations` first (simplest — no registry refresh, only delete needs
the 409 guard), then `robots` (FK + `registry.reload()`), then `fleet_config` (just a
`PUT`). Best done **after** the runtime test, so CRUD is built on a verified pipeline.

## Watch out for

- **Nothing has been committed** — the user pushes via GitHub Desktop.
- **Start order** — PostgreSQL must be up before FastAPI (it loads the fleet from the
  DB at boot, no DB = no start); FastAPI before the ROS Bridge (it fetches `GET /fleet`).
- **Node-RED userDir** — Node-RED defaults to `C:\Users\aimno\.node-red\` (old April
  flows). Start it with `node-red --userDir "d:\FYP\integration-system\node-red"`, and
  fully stop any old instance first or it overwrites `flows.json` on deploy.
- FastAPI DB env vars (defaults): `DB_HOST` localhost, `DB_PORT` 5432, `DB_NAME`
  amr_integration, `DB_USER` postgres, `DB_PASSWORD` admin.
- Node-RED's `/ingest/*` calls assume FastAPI at `http://localhost:8000`; the ROS
  Bridge's `FLEET_API_URL` defaults to `http://localhost:8000/fleet`.
- Maps now use the `map-NNN` convention (`map-001`, `map-002`) — seeded in
  `schema.sql`. Add new maps with the next `map-NNN` id and a human-readable `label`.

## Canonical docs

[overview.md](overview.md) · [architecture.md](architecture.md) ·
[status.md](status.md) · [gaps.md](gaps.md) ·
[plans/vda5050-migration.md](plans/vda5050-migration.md) ·
[schema/VDA5050_MESSAGES.md](schema/VDA5050_MESSAGES.md) ·
[schema/MQTT_TOPICS.md](schema/MQTT_TOPICS.md) ·
[schema/REST_ENDPOINTS.md](schema/REST_ENDPOINTS.md) ·
[schema/DATABASE_SCHEMA.md](schema/DATABASE_SCHEMA.md)

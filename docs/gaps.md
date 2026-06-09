# Gaps & Flagged Items

Open items not yet addressed, consolidated for visibility. For what *is* working see
[status.md](status.md). Resolved gaps are listed at the bottom.

> Last updated: 2026-06-09 (**Docker scope reversed — Docker is now a supported
> run AND deployment path**, superseding the 2026-06-08 CI-only decision below).
> `docker compose up --build` brings up the full stack (Postgres → Mosquitto →
> FastAPI → ROS Bridge → Node-RED → frontend); the same compose stack still
> backs the CI Newman smoke job. Images were also slimmed: ROS Bridge moved to
> `node:22-alpine` (pure-JS deps, musl-safe) and runs as the `node` user;
> FastAPI stays on `python:3.12-slim` (glibc — `psycopg2-binary` ships no musl
> wheel) with pyc/pip-cache disabled and a non-root `appuser`; the frontend
> builder bumped to `node:22-alpine`; `.dockerignore`s tightened. All three
> images build green. Docs reframed (setup.md gained a "Run with Docker"
> section, status.md, PROJECT_DETAIL.md 8.1, thesis-brief 03/07, testing.md,
> postman/README.md, CLAUDE.md). No application code changed.
>
> Last updated: 2026-06-08 (Docker scope clarified — decision: Docker is not
> adopted as a run or deployment path for this project — **SUPERSEDED 2026-06-09,
> see above**). Docker was logged as gap G14/G30 and built as forward progress;
> `decisions.md` records no ADR for it. The `docker-compose.yml`, per-service
> `Dockerfile`s, and `frontend/nginx.conf` were kept for the CI Newman smoke job
> and, at the time, not recommended for local run or deployment. No files were
> deleted.
>
> Last updated: 2026-05-25 (G40 closed — robot soft-delete (archive) shipped:
> `robots.archived_at` column, `POST /robots/{serial}/archive` + `/restore`
> endpoints, `GET /robots?include_archived=true` for admin, archive-aware
> 409 on `POST /robots` carrying `{code:"archived_serial",serialNumber,
> archivedAt}` so the UI offers Restore inline, command paths return 410
> for archived serials, `/ingest/*` rejects archived traffic with 410 via
> in-memory `registry.is_archived` (O(1), no per-message DB hit). Admin →
> Robots split into Active + Archived sections with Archive/Restore icon
> buttons. 15 new pytest cases (`test_robots_archive.py`); 59/59 pass.
> G41 added (cosmetic test-env note about `app/mqtt.py` connect-at-import).
>
> Last updated: 2026-05-25 (G26 + G27 + G30 + G31 closed. RobotTile drives
> a 1 s ticker so the "last seen" label counts up between MQTT messages;
> MapCanvas pin labels now render inside a slate-900 pill with a pin-coloured
> stroke so they read against both white free-space cells and the black
> out-of-map background; `GET /orders/{id}` added with joined nodes/edges,
> frontend `getOrder` + `OrderDetail` type wired; new `frontend/Dockerfile`
> (multi-stage Node 20 builder → nginx 1.27) + `frontend/nginx.conf`
> (SPA fallback + asset cache) + `frontend/.dockerignore`, `frontend`
> service added to `docker-compose.yml` on host port 5173. Three new
> pytest cases cover the order-detail router (header+children, 404, 503);
> frontend `npm run typecheck` exits 0, pytest 11/11 in `test_orders.py`.
> Last updated: 2026-05-22 (housekeeping pass — `frontend/tsconfig.tsbuildinfo`
> untracked from git (was tracked despite the G33-era `.gitignore` rule),
> ~8 MB of stale generated artifacts removed from `docs/postman/reports/`,
> `frontend/playwright-report/`, `frontend/dist/`, `frontend/test-results/`,
> and `fastapi-service/**/__pycache__/`. All gitignored and regenerate on
> next test/build run; no source code touched. G34 + G35 resolved
> earlier this session — instant-action wire format corrected from
> `{action:"cancel"}` to `{action_type:"cancelOrder"}` (G22-style fix),
> api client error formatter now handles FastAPI 422 validation arrays
> (no more `[object Object]`), instant-action panel wires success/failure
> toasts, and Admin DataGrid rows now use `IconButton` so both Edit
> and Delete fit in the actions column.
> G33 + G36 + G37 + G38 resolved earlier this session — the "cheap
> quartet" of frontend polish bugs. `noEmit` added to `tsconfig.json`;
> new `NumberField` component wraps MUI TextField so numeric inputs (a)
> select-on-focus so typing "2" replaces "0" instead of yielding "02"
> and (b) keep a string buffer mid-typing so negatives are accepted;
> ActiveOrderPanel disables Cancel/Retry/Skip when no nodes remain.
> G34–G39 added — six frontend bugs surfaced
> during the manual-test-checklist elaboration pass on 2026-05-22:
> instant-action toast renders `[object Object]`, Admin DataGrid
> row-actions menu unreachable, numeric inputs concat placeholder zero,
> instant-action buttons stay clickable after order completes, manual
> dispatch + location form reject negative coordinates, and Robot
> Detail connection pill misses simulator-side disconnect. G24 + G25
> resolved earlier this session — DB-down now surfaces as HTTP 503,
> Health pills degrade to idle on poll failure. G28 + G29 resolved
> earlier — Frontend typecheck/build and Newman smoke suite now run
> in GitHub Actions on every push/PR. G28–G33 added earlier this
> session — previously "untracked follow-ups" in `status.md`, now
> tracked as gaps. G24–G27 surfaced by the manual-checklist walkthrough
> on 2026-05-22; consolidated remarks in `manual-test-remarks.md`).
> Severity is a rough triage (High = blocks core function, Medium = limits
> usefulness, Low = polish / hardening). Gap IDs are stable — resolved ones
> keep their number rather than being renumbered.

## At a glance

| # | Gap | Area | Severity |
|---|---|---|---|
| G39 | Robot Detail "connection" pill stuck at ONLINE when simulator stops (only flips on rosbridge death) — needs investigation | Frontend | Low |
| G32 | MQTT broker anonymous on both `:1883` and `:9001` — no auth / no TLS | Mosquitto | Low |
| G41 | `app/mqtt.py` calls `mqtt_client.connect()` at module import — pytest fails without a live Mosquitto. Now worked-around in `tests/conftest.py` (paho client mocked) but the import-time side-effect should ideally move into a lifespan hook. | Backend / tests | Low |

See [manual-test-remarks.md](manual-test-remarks.md) for the full walkthrough
notes that surfaced G24–G27 — including items that looked like bugs but turned
out to be expected behaviour or test-setup issues.

### Detail — G39 (frontend bug surfaced during checklist elaboration, 2026-05-22)

- **G39 — Robot Detail "connection" pill stuck at ONLINE on sim
  shutdown.** Per the user remark: "Correct when online, but when robot
  sim is stopped. It doesnt reflect from online to offline. Only
  reflects when rosbridge is stopped. However error shows connection
  error." May be expected VDA5050 contract behaviour — the `connection`
  topic is published by the ROS Bridge process on behalf of each robot,
  so the bridge itself can't tell the sim has stopped unless rosbridge
  fails (Last-Will fires → CONNECTIONBROKEN). But the fact that
  "error shows connection error" means some other channel knows about
  the disconnect, so the pill could plausibly bind to that signal.
  **Needs investigation** before fixing — could resolve as EXPECTED.

### Detail — G32 (untracked → tracked, 2026-05-22)

- **G32 — MQTT auth + TLS.** Both Mosquitto listeners (`:1883` backend,
  `:9001` browser) are anonymous; password file + TLS cert config needed,
  plus credentials wired through FastAPI / ROS Bridge / Node-RED / frontend
  env. Fine for FYP / LAN; not for any wider deployment.
---

## Resolved

| # | Gap | Resolved |
|---|---|---|
| G1 | Waypoint sequence does not auto-advance | 2026-05-17 |
| G2 | No navigation goal status/feedback | 2026-05-17 |
| G3 | Bridge does not publish most outbound topics | 2026-05-17 |
| G4 | PostgreSQL not integrated | 2026-05-17 |
| G5 | Node-RED → PostgreSQL logging not wired | 2026-05-17 |
| G6 | 6 GET endpoints stubbed (503) | 2026-05-17 |
| G7 | `GET /system/status` roslib / Node-RED status unknown | 2026-05-17 |
| G8 | Named locations hardcoded in FastAPI | 2026-05-17 |
| G9 | No env-var validation / no `.env.example` | 2026-05-17 |
| G10 | No authentication / authorization | 2026-05-18 |
| G11 | No rate limiting | 2026-05-18 |
| G12 | No structured logging | 2026-05-17 |
| G13 | No tests (zero coverage) | 2026-05-18 |
| G14 | No Docker / docker-compose / CI | 2026-05-18 |
| G15 | No CRUD API for reference data | 2026-05-18 |
| G16 | No database connection pooling | 2026-05-18 |
| G17 | Navigation failures invisible to telemetry consumers | 2026-05-18 |
| G18 | No CORS configuration — browser frontend blocked | 2026-05-20 |
| G19 | Unbounded telemetry growth — no retention policy | 2026-05-18 |
| G20 | `/ingest/*` returns HTTP 500 on malformed payloads | 2026-05-18 |
| G21 | VDA5050 `headerId` / `orderId` counters reset on restart | 2026-05-18 |
| G22 | Frontend named-order POST sent camelCase, FastAPI expected snake_case (422 on every Dispatch → Named send) | 2026-05-21 |
| G23 | `GET/POST/PUT /robots/{serial}` returned snake_case while `GET /robots` (list) returned camelCase — API self-inconsistency | 2026-05-21 |
| G28 | Frontend not in CI — `tsc --noEmit` + `vite build` don't run on push/PR | 2026-05-22 |
| G29 | Newman smoke suite not in CI — contract drift only caught locally | 2026-05-22 |
| G24 | DB-down returns HTTP 500 instead of 503 from `GET /robots/{serial}/state` and `GET /system/status` | 2026-05-22 |
| G25 | Health pills don't degrade live when `/system/status` poll fails — DB / ROS stay green until refresh | 2026-05-22 |
| G33 | `frontend/tsconfig.json` lacks `"noEmit": true` — `npm run build` emits stray `.js` next to every `.ts` source | 2026-05-22 |
| G40 | Operators have no path to remove a robot once it has telemetry / order history — `DELETE /robots/{serial}` returns 409 with no UI alternative; archived robots stay visible on the Dashboard | 2026-05-25 |
| G36 | Numeric inputs (manual dispatch x/y/θ, location editor) concat placeholder "0" — typing "2" yields "02" | 2026-05-22 |
| G37 | Instant-action buttons (Cancel / Retry / Skip) stay clickable after order completes — risk of stray instant action | 2026-05-22 |
| G38 | Negative coordinates rejected by manual dispatch + named-location editor — world frame supports them | 2026-05-22 |
| G34 | Instant-action toast renders `[object Object]` instead of action name (Cancel / Retry / Skip) | 2026-05-22 |
| G35 | Admin DataGrid row-actions menu (triple-dot) unreachable — Delete inaccessible | 2026-05-22 |
| G26 | Dashboard tile "last seen" timer stuck at `0s ago`; doesn't tick upward | 2026-05-25 |
| G27 | Named-location pin labels invisible vs the dark MapCanvas background | 2026-05-25 |
| G31 | No `GET /orders/{id}` detail endpoint — blocks Order History click-to-expand drill-down | 2026-05-25 |
| G30 | Frontend has no Dockerfile / not in `docker-compose.yml` — local-dev only | 2026-05-25 |

G1–G3 — the ROS Bridge Service consumes `/move_base` feedback and the VDA5050
`OrderStateMachine` auto-advances orders node-by-node. G12 — JSON-line logging in the
ROS Bridge and FastAPI.

**G7** — `/system/status` now reports `roslib` (inferred from the robots' retained
VDA5050 `connection` topics — FastAPI's MQTT client subscribes them) and `node_red`
(a best-effort HTTP probe of `NODE_RED_URL`). Neither is `unknown` in normal operation.

**G8** — `POST /robots/{serial}/order/named` now sources named locations from the
`named_locations` table via `db.fetch_named_locations()`; the hardcoded `app/data.py`
dict is deleted. `theta` is read directly (the table stores radians), so the old
degrees→radians conversion is gone.

**G9** — required env vars are validated at startup: FastAPI via `app/config.py`
(`validate_env()` in `main.py`), the ROS Bridge via a check in `index.js`. Both fail
fast with a clear message. `.env.example` templates are committed for both services.

**G10** — API-key authentication (`app/auth.py`). Opt-in via the `API_KEY` env var:
unset = open API (local-development default); set = the client-facing endpoints
(`/robots/*`, `/fleet`, `/system/*`, `/maps/*`, `/locations/*`) require a matching
`X-API-Key` header or return 401. `/ingest/*` is left open — it is the internal
Node-RED → DB boundary. The ROS Bridge sends the key on `GET /fleet` when `API_KEY`
is set. MQTT-broker auth is a separate hardening step (anonymous access is documented
in `mosquitto.conf`).

**G11** — per-client-IP rate limiting (`app/ratelimit.py`), a sliding-window
middleware. `RATE_LIMIT_PER_MINUTE` caps requests per 60 s (default 120; `0`
disables it); over-limit returns 429 with `Retry-After`. `/ingest/*` is exempt
(internal high-volume telemetry). Targets the documented command-thrashing risk.

**G13** — per-service test suites. The ROS Bridge has `node:test` tests
(`ros-bridge-service/test/`, run with `npm test`) covering `vda5050.js`,
`stateBuilder.js`, and `orderStateMachine.js` helpers — including the G17
navigation-error path. FastAPI has `pytest` tests (`fastapi-service/tests/`) for
`config.py`, `auth.py`, `ratelimit.py`, and the ingest / CRUD schemas (`test_schemas.py`);
install `requirements-dev.txt` and run `pytest`. Both run in CI (G14).

**G14** — CI plus full Docker support. `.github/workflows/ci.yml` syntax-checks
every service and runs both test suites on push / PR. Each service has a
`Dockerfile` and there is a root `docker-compose.yml` (PostgreSQL → Mosquitto →
FastAPI → ROS Bridge → Node-RED → frontend); `docker compose up --build` is a
supported run and deployment path (per the 2026-06-09 decision), and the same
stack also backs the CI Newman smoke job. The manual route / `start-all.ps1`
remains the convenient hot-reload path for development.

**G15** — reference-data CRUD API. `GET/POST/PUT/DELETE` for `maps`
(`routers/maps.py`), `named_locations` (`routers/locations.py`), and `robots`
(`routers/robots.py`), plus `PUT /fleet` for the single `fleet_config` row. Editing
the reference tables no longer means re-applying `schema.sql`. Postgres FK / unique
violations are caught in `db.py` (`IntegrityConflict`) and returned as **409** — the
FK is never cascaded, so telemetry is never wiped. After any `robots` / `fleet_config`
write the in-memory `RobotRegistry` is reloaded (`registry.reload()`). See
[REST_ENDPOINTS.md](schema/REST_ENDPOINTS.md) § "Reference-data CRUD".

**G16** — database connection pooling. `app/db.py` now serves connections from a
lazily-built `psycopg2.pool.ThreadedConnectionPool`; `_transaction()` / `_query()` /
`_execute()` borrow and return connections instead of opening a fresh TCP connect +
auth handshake per query. The `DatabaseUnavailable` fallback is preserved (the
service still boots without a database). Pool size: `DB_POOL_MIN` / `DB_POOL_MAX`.

**G17** — navigation failures are now visible to telemetry consumers. On a
non-`SUCCEEDED` `/move_base` result the `OrderStateMachine` records a
`navigationFailed` error (`errorLevel: WARNING`, the failed `nodeId` in the
description); `StateBuilder` merges it into the VDA5050 `state.errors` array, so it
is persisted to `state_errors` and surfaced by `GET /robots/{serial}/state`. The
error is cleared when a later node succeeds.

**G18** — CORS. `main.py` registers Starlette's `CORSMiddleware`; the allowed
origins are read from `CORS_ORIGINS` (comma-separated, defaults to
`http://localhost:5173` so the Vite dev server works out of the box). Credentials
and `X-API-Key` are permitted; the configuration is documented in `.env.example`
and `schema/REST_ENDPOINTS.md`. This unblocks the React frontend work that began
on 2026-05-20.

**G19** — telemetry retention. A FastAPI background task prunes `state_snapshots`
and `connection_log` rows older than `TELEMETRY_RETENTION_DAYS` (default 30; `0`
disables it) every 6 h — child tables go via `ON DELETE CASCADE`. Documented in
[DATABASE_SCHEMA.md](schema/DATABASE_SCHEMA.md) § Notes.

**G20** — `/ingest/*` no longer returns 500 on malformed payloads. The ingest routes
are typed with Pydantic models (`app/schemas.py`) that pin the required top-level
keys; FastAPI now returns a **422** naming the offending field. The variable-length
VDA5050 arrays pass straight through via `extra="allow"`.

**G23** — single-row robots endpoints returned snake_case rows. `GET /robots`
went through `RobotRegistry.list()` which emits camelCase
(`{serialNumber, rosbridgeUrl, mapId}`), but `GET /robots/{serial}`,
`POST /robots`, and `PUT /robots/{serial}` returned the raw `db.fetch_robot()`
row (`{serial_number, rosbridge_url, map_id}`). Surfaced by the Newman
assertion `expected j.serialNumber to eql 'amr001'` failing against
`undefined` (already noted in the manual checklist as a REMARK from
2026-05-21 03:13). Fixed by adding a `_to_camel(row)` helper in
`app/routers/robots.py` and applying it to the get/post/put responses;
`db.py` stays SQL-shaped (snake_case) by convention.

**G28** — frontend now runs in CI. A `frontend` job in `.github/workflows/ci.yml`
runs `npm ci` (cached against `frontend/package-lock.json`), `npm run typecheck`
(`tsc -b --noEmit`), and `npm run build` (`tsc -b && vite build`) on every push
and PR. Playwright is intentionally **not** in this job — it needs the live
stack and is local-only for now (the Newman job covers the same endpoints at
the HTTP layer; a future `e2e` job could spin docker compose and run Playwright
against it).

**G24** — DB-down now returns 503 from the affected routes. Root cause:
`app/db.py`'s connection pool is built lazily; on first call it correctly
translated psycopg2 connection errors into `DatabaseUnavailable` (caught by
the routers' `except DatabaseUnavailable` → 503). Once the pool was built,
though, subsequent psycopg2 `OperationalError` / `InterfaceError` raised on
`cur.execute()` (because Postgres restarted, the wire died, etc.) propagated
unwrapped — the routers' guard didn't fire and FastAPI returned a generic
500. The fix wraps every helper (`_query`, `_execute`, `_execute_returning`,
`_transaction`, `fetch_latest_state`) so connection-level errors are
translated into `DatabaseUnavailable`. It also adds `_invalidate_pool()` —
called from `_to_unavailable()` so the cached pool is dropped after a
connection failure; without that, the pool would keep handing out the same
dead connection on every subsequent request even after Postgres recovers.
`ping()` now runs `SELECT 1` rather than just borrowing a connection (a
pooled connection survives a Postgres restart in the pool's bookkeeping
while being dead on the wire). New tests in
`fastapi-service/tests/test_db_unavailable.py` (5 cases) lock in: pool
invalidation, `ping()` true/false branches, `GET /robots/{serial}/state` →
503, and `GET /system/status` → 200 with `database.status == 'unavailable'`
(the contract G25 depends on).

**G34** — instant-action UX overhauled in three places. Root cause was
**not** a toast-string bug (as initially suspected from the user remark
"Returns object Object in the active order panel"); it was a
G22-style wire-format mismatch hiding behind a poor error formatter:

1. **Wire format.** `postInstantAction` in `frontend/src/api/robots.ts`
   sent `{"action": "cancel"}` (short, camelCase) but FastAPI's
   `InstantActionRequest` schema declares
   `action_type: Literal["cancelOrder", "retryNode", "skipNode"]`
   (snake_case + full VDA5050 action names). Every Cancel / Retry / Skip
   click returned **422 Unprocessable Entity**. Fixed by adding an
   `ACTION_TYPE` map (`cancel → cancelOrder`, `retry → retryNode`,
   `skip → skipNode`) and sending `{action_type: ACTION_TYPE[action]}`
   on the wire. The TS API surface stays short + camelCase for callers
   — translation lives at the boundary, same as G22.
2. **Error message formatter.** `apiFetch` in `frontend/src/api/client.ts`
   used `String((payload as { detail: unknown }).detail)` — fine for a
   string `detail` (`HTTPException(detail="...")`) but garbage for a 422
   whose `detail` is an **array** of pydantic validation entries
   (`String([{...}])` → `"[object Object]"`). New `formatErrorMessage`
   helper handles all three FastAPI detail shapes: plain string, array
   of validation entries (formatted as `loc.path: msg`), and the rarer
   single-entry object. So even future schema drift on other endpoints
   produces a readable error.
3. **Success toasts.** `ActiveOrderPanel` now imports `useToast` and
   fires `toast.success(\`${label} sent\`)` / `toast.error(...)` on the
   instant-action mutation result. Combined with G37's button gating,
   the operator now gets clear feedback on every Cancel / Retry / Skip
   click and can't fire a stray action against a finished order.

**G35** — Admin DataGrid row actions are now reachable. Root cause:
the row-actions column was rendering two MUI `Button` components. MUI
`Button` has `minWidth: 64px` by default; two of them = **128 px**
minimum, but the column was `width: 110`. The Delete button overflowed
the cell's bounds and the visible click target landed on Edit. The
user's mental model of "triple dot dropdown" was conjured by trying to
explain the broken click behaviour — there was never a triple-dot menu
in the code. Fixed by swapping to `IconButton` (sized to the icon,
~32 px each), wrapped in MUI `Tooltip` for hover labels. Applied to
all three admin grids: Maps, Locations, Robots. No column-width
change needed.

**G33** — `frontend/tsconfig.json` now sets `"noEmit": true`. The
`tsc -b` invocation in the `build` script no longer writes `.js` (or
`.d.ts`) next to source `.ts` files. Vite still produces `dist/` because
Vite handles emission via its own ESBuild/Rollup pipeline, independent
of tsc. Verified: `npm run build` followed by
`Get-ChildItem -Path src -Filter *.js -Recurse | Measure-Object` → `0`.
The `*.tsbuildinfo` file (tsc's incremental cache, controlled by
`incremental`, not `noEmit`) still appears at the project root and has
been added to `frontend/.gitignore` so it doesn't get committed.

**G36 + G38** — both gaps shared a single fix: new component
`frontend/src/components/common/NumberField.tsx`, a wrapper around MUI
`TextField` that:
- **Selects existing text on focus** (`onFocus={(e) => e.target.select()}`)
  so the first keystroke replaces the displayed "0" instead of
  concatenating to "02" — closes G36.
- **Keeps a transient string buffer** for the input (`""`, `"-"`, `"."`,
  `"-."`, `"1."` are all allowed mid-typing) so the user can type a
  negative or decimal number without the parent's numeric state being
  reset to NaN/0 on every keystroke — closes G38. The parsed number is
  only propagated to the parent when the buffer is a valid finite
  number; on blur, an unparseable buffer falls back to 0.
- **Resyncs from external value changes** (e.g. MapCanvas click → parent
  calls `set('x', …)`) via a `useEffect` that only resets the buffer when
  `Number(text) !== value`.

Swapped into:
- `OrderBuilder.tsx` — Manual mode x/y/θ inputs.
- `Locations.tsx` — x/y/θ inputs in the location editor form.
The Robots / Maps / Fleet admin forms don't have numeric coord inputs,
so they're untouched. The `id` field in the Locations form is left as a
plain `TextField` because IDs are non-negative integers entered as
whole numbers — no decimal/negative gymnastics needed.

**G37** — `ActiveOrderPanel` now disables Cancel / Retry / Skip when the
order is finished. Logic: `done = nodeStates.length === 0`. A completed
orderId stays visible (so the operator can see what just ran), but the
three action buttons go disabled-grey and a small subtext reads "Order
complete — instant actions disabled. Submit a new order to re-enable."
Closes the "stray instant action" risk that pairs with G34 — together
with G34's later fix (wire format + readable error formatter + success
toasts), the operator now has clear feedback on every Cancel / Retry /
Skip click and can't fire one by accident against a finished order.

**G26** — `RobotTile` now drives a 1 s ticker via
`useEffect` + `setInterval` + a throwaway `setTick` state. Root cause:
`agoLabel(lastSeen)` is pure, but `lastSeen` only changes when a new
MQTT `state` or `connection` message arrives — between messages there is
nothing to re-render the tile, so the displayed `Xs ago` sat frozen.
The interval fires `setTick((n) => n + 1)` every second, forcing a
re-render that re-evaluates the label off `Date.now()`. The interval is
cleared on unmount. Memory cost is one timer per visible tile, which is
the same shape as the existing `lastSeen` per-robot state.

**G27** — Named-location pin labels now render inside a slate-900
(`rgba(15,23,42,0.85)`) rounded pill with a thin pin-coloured stroke,
positioned to the right of the pin marker. Root cause: the old text
draw was `ctx.fillStyle = 'rgba(255,255,255,0.85)'` with no background,
so the label was white-on-white when the pin landed on a free-space
occupancy cell (rasterised as `v = 255` / pure white) and barely visible
on the dark map chrome too. The pill gives the label a guaranteed dark
backdrop independent of what's underneath; the pin-coloured border ties
it visually back to its marker when there are multiple pins close
together. Text colour is `slate-100` (`#f1f5f9`) for AA contrast against
the slate-900 fill. Also added a slate-900 stroke around the pin circle
itself so the marker reads against bright free-space areas.

**G31** — `GET /orders/{order_id}` added (`fastapi-service/app/routers/orders.py`).
Returns the `orders` header row plus joined `order_nodes` (ordered by
`sequence_id`) and `order_edges`. New `db.fetch_order(order_id)` borrows a
pooled connection, runs three queries in sequence on the same cursor, and
returns the assembled dict. If multiple rows share the same `order_id`
(an updated order), the newest by `ts` wins. Returns 404 for unknown
order IDs, 503 if the database is unreachable (same shape as the existing
`/orders` list endpoint). Three new pytest cases in `tests/test_orders.py`
cover the happy path, 404, and 503. On the frontend, `api/orders.ts`
exposes `getOrder(orderId)` and `types/api.ts` declares `OrderDetail`,
`OrderNode`, `OrderEdge` — wiring an Order History click-through is now
purely a UI exercise.

**G30** — Frontend Docker image, part of the full `docker compose` stack
(supported run/deploy path per the 2026-06-09 decision). `frontend/Dockerfile`:
multi-stage build, `node:22-alpine` builder runs `npm ci` + `npm run
build`, output is copied into a `nginx:1.27-alpine` stage that serves
`/usr/share/nginx/html`. `VITE_API_URL`, `VITE_MQTT_WS_URL`, and
`VITE_API_KEY` are exposed as build args (defaults `http://localhost:8000`,
`ws://localhost:9001`, empty) because Vite inlines `import.meta.env.*` at
build time — runtime config would have meant a config-json fetch + hydration
detour. New `frontend/nginx.conf` gives the SPA fallback
(`try_files $uri $uri/ /index.html`) so a hard refresh on `/robots/:serial`
doesn't 404, long-caches `/assets/*` (Vite emits content-hashed
filenames), and `no-cache`s `index.html` so the latest bundle hash is
always re-fetched. New `frontend/.dockerignore` keeps `node_modules`,
`dist`, `playwright-report`, and tsbuildinfo out of the build context. A
`frontend` service was added to `docker-compose.yml` on host port `5173`,
depends on the `fastapi` healthcheck, has its own `wget /` healthcheck.
Rebuild against different endpoints with
`docker compose build --build-arg VITE_API_URL=... frontend`.

**G25** — Health pills now degrade live when `/system/status` fails. Root
cause: `useSystemStatus` returns TanStack Query's default `data` retention
across errors — when the 5 s poll fails, `sys.data` still holds the last
successful response, so `dbState = serviceToPill(sys.data?.database.status)`
kept showing green. Fix: every pill derived from `sys.data` is now gated on
`sys.isError` (AppBar's DB + ROS pills; Health's MQTT-backend, PostgreSQL,
rosbridge-fleet, and Node-RED rows). When the poll errors they collapse to
`idle` (grey) and the tooltip reads "unknown — API unreachable" so the
operator can tell the answer is "we can't see," not "everything is fine."
The API pill itself (and the MQTT browser pill, which is a separate
channel) keep their direct signals. Verified manually + via `npm run
typecheck` (0 errors).

**G29** — Newman smoke suite now runs in CI. A `newman` job brings up
`postgres + mosquitto + fastapi` via `docker compose up -d --build`, polls
`docker inspect` for the FastAPI healthcheck to reach `healthy` (up to ~120 s),
then runs the 13-section / 61-request collection via `npx newman` with the
`htmlextra` reporter. Reports are uploaded as a GitHub Actions artifact
(`newman-reports`) on every run; on failure the FastAPI container logs are
dumped before tear-down. `node-red` and `ros-bridge` are skipped — the
collection only exercises the FastAPI HTTP surface, and `ros-bridge` would
just log "no robot" errors without a real rosbridge upstream. Catches the
kind of contract drift that G22 / G23 were.

**G22** — `postNamedOrder` in `frontend/src/api/robots.ts` was sending
`{ locationIds: [...] }` (camelCase) while FastAPI's `NamedOrderRequest`
pydantic schema declares `location_ids` (snake_case). Every Dispatch → Named
order in the React app returned **422 Unprocessable Entity**; the Manual
mode path was unaffected because `OrderRequest` uses `nodes` on both sides.
Surfaced by the Playwright E2E suite added 2026-05-21 (`dispatch.spec.ts`).
Fixed by translating at the wire boundary in `postNamedOrder` (snake_case
on the JSON, camelCase preserved on the TS interface for callers).

**G21** — VDA5050 counters persist across restarts. `RobotRegistry` seeds its
`headerId` (per topic) and `orderId` counters at startup from the database
(`MAX(header_id)` from `orders` / `instant_action_messages`, `MAX` order suffix per
robot) so they resume rather than restart at 0. The order-suffix query
(`fetch_max_order_suffixes` in `app/db.py`) filters rows by
`split_part(order_id, '-order-', 2) ~ '^[0-9]+$'` so legacy or hand-inserted
`order_id` values that don't match the `{serial}-order-N` template (e.g. test rows
with non-numeric suffixes) no longer crash the startup CAST.

**G4 / G5 / G6** were resolved by the VDA5050 migration
([plans/vda5050-migration.md](plans/vda5050-migration.md)):
- **G4** — the database schema is VDA5050-aligned, serial-keyed and fully normalized
  (1NF-strict, BCNF — 15 tables, VDA5050 arrays in child tables, not JSONB; see
  [schema/DATABASE_SCHEMA.md](schema/DATABASE_SCHEMA.md)); FastAPI `app/db.py`
  implements the read and write paths.
- **G5** — Node-RED ingests the VDA5050 `state` / `connection` / `order` topics and
  persists them via the FastAPI `/ingest/*` API (a documented refinement of the
  original "Node-RED writes directly" plan — see the migration plan §5.3).
- **G6** — the GET endpoints are now real, robot-scoped and PostgreSQL-backed
  (`GET /robots/{serial}/state`, `/oee/*`); the 503 stubs are gone.

> **Runtime caveat:** the resolved persistence path is **code-complete and
> syntax-checked, not yet end-to-end tested** — it needs a live PostgreSQL instance
> (apply `DATABASE_SCHEMA.md`) plus the `psycopg2-binary` dependency. See
> [status.md](status.md).

## Notes

- The VDA5050 migration (Phases 0–7) is implemented; see
  [plans/vda5050-migration.md](plans/vda5050-migration.md) and [status.md](status.md).
- Wiring the ROS safety topics (`/e_stop`, `/safety/error*`) into `state.errors` /
  `state.safetyState` is a documented simplification, not a tracked gap — the fields
  exist with safe defaults.

# Manual-Test Walkthrough — Items With Remarks

> **What this is.** During the 2026-05-21 / 2026-05-22 walkthrough of
> [`manual-test-checklist.md`](manual-test-checklist.md) the user added inline
> `{…}` remarks to ~20 checklist items — some are "I'm not sure what this is
> asking", some are "I think this is a bug", some are "I expected X, got Y".
> This page consolidates them so the next testing session can replay just the
> open questions instead of re-walking the full checklist.
>
> Phase numbers below match the source checklist. Each entry has the original
> checklist text (abbreviated), the user's remark, and either a clarification,
> the gap ID it became, or the next step to confirm it.

Last updated: 2026-05-22.

---

## How to read this page

| Outcome tag | What it means |
|---|---|
| **CLARIFY** | Ambiguous prompt — clarification of what to do / how to verify written below. Re-run when convenient; no code change needed. |
| **GAP** | Real bug; opened in [gaps.md](gaps.md) with a `G##` ID. Don't re-run until the fix lands. |
| **EXPECTED** | The observed behaviour is correct by design; the checklist could note this more explicitly. Re-run is optional. |
| **TEST SETUP** | The test passed/failed because of how the user set it up locally; not a code problem. Tips below. |
| **RESOLVED THIS SESSION** | Fixed during the 2026-05-22 session; box can stay checked. |

---

## Phase 3 — Orders & instant actions

### Node-RED Test Harness → "order: single goal"
- **Original:** the "Command Audit" tab debug shows `order logged`.
- **User remark:** "It shows status ok for order logged".
- **Outcome:** **EXPECTED.** "status ok for order logged" is the same thing
  — the debug pane just prints the full `{"status":"ok"}` response from
  `/ingest/command`. The checklist wording was looser. No action.

---

## Phase 6 — Gap fixes (G16–G21)

### G17 — navigation failure clears on a successful node `[robot]`
- **Original:** Send a reachable goal that succeeds → the `navigationFailed`
  error clears.
- **User remark:** "Second time send nav then only its cleared".
- **Outcome:** **EXPECTED — partial.** `OrderStateMachine` clears the
  `navigationFailed` error on the *next* `SUCCEEDED` move-base result, which
  in practice means the next node of a multi-node order — or the next order
  if you stopped at one. A single one-shot reachable goal after the failure
  should clear it on its `SUCCEEDED` though, so "second time" suggests the
  first reachable goal didn't actually `SUCCEEDED` (maybe was preempted /
  cancelled). Worth re-testing with a verified single successful goal; if
  the error still requires a 2nd goal, that's a real bug.
- **Next step:** Send one reachable goal after a known failure, watch the
  ROS Bridge log for `node 0 result: SUCCEEDED`, then check
  `GET /robots/amr001/state` immediately. If still present → open as a gap.

### G16 — connection-pool count stays at 2
- **Original:** Pool count stays at/below `DB_POOL_MAX` (default 10).
- **User remark:** "It stays at 2 before, during and after the command runs".
- **Outcome:** **EXPECTED.** 30 quick *reads* serialised through the pool will
  show only ~1-2 active backends in `pg_stat_activity` because each read
  borrows-then-returns immediately and PowerShell `curl.exe` calls run
  serially. The assertion is the *upper bound* — "≤10" — not "=10". The pool
  is doing what it should.

### G19 — telemetry retention prune
- **Original:** Plant a 90-day-old row, restart with `TELEMETRY_RETENTION_DAYS=30`,
  the row should be gone.
- **User remark:** "Selected to check, but still there. Telemetry retention
  is set to 1 [day]. The row ts is `2026-05-21 12:47:53`."
- **Outcome:** **TEST SETUP.** The remark is from 2026-05-21 ≈ same day the
  test was planted, so the row's age is hours, not 90 days. With
  `TELEMETRY_RETENTION_DAYS=1` rows older than 1 day get pruned — but the
  planted row is *less than 1 day old*, so it stays. The original step 1
  uses `now() - interval '90 days'` precisely so this can't happen; the user
  may have skipped or modified that step.
- **Re-test:** Re-run step 1 verbatim — `INSERT … VALUES ('amr001',
  now() - interval '90 days', 999)` — verify `SELECT ts FROM state_snapshots
  WHERE header_id=999` shows a timestamp **90 days back from today**, then
  restart FastAPI with `TELEMETRY_RETENTION_DAYS=30` (or =1 — both should
  prune it). The boot-time prune fires within seconds; watch the FastAPI log
  for `telemetry pruned`. The automated `test-retention.ps1` exercises this
  pipeline; if it passes but the manual repro doesn't, the difference is
  always the plant timestamp.

---

## Phase 8 — Extreme / failure cases

### Database loss — `GET /robots/{serial}/state` and `GET /system/status`
- **Original:** Stop PostgreSQL. `GET /robots/amr001/state` → **503**;
  `GET /system/status` → `database: unavailable`.
- **User remark:** Both return **500 Internal Server Error** instead.
- **Outcome:** **GAP — opened as G24** ([gaps.md](gaps.md#g24)). `app/db.py`
  raises `DatabaseUnavailable` when the pool can't connect, but neither
  router catches it; FastAPI's default handler then sends a 500.
  `/system/status` in particular should never crash — the whole point is
  reporting subsystem state, so a DB outage must degrade gracefully.
- **Fix sketch:** Wrap the two reads in a try/except for `DatabaseUnavailable`
  → return `JSONResponse(status_code=503, content={"detail": "Database
  unavailable: <msg>"})` for the state read; for `/system/status` mark the
  `database` field `unavailable` and keep the response 200.

### Ordering / concurrency — new order during execution `[robot]`
- **Original:** Submit a new order while one is mid-execution; behaviour is
  defined; confirm it matches expectation.
- **User remark:** "Directly goes to exec the next order. Abandoning the
  current order".
- **Outcome:** **EXPECTED.** The VDA5050 OrderStateMachine in the ROS Bridge
  *replaces* the current order on a new one — that's the documented design
  ("new order replaces current"). No cancel needed, by design. If you want
  *queueing* instead, that would be a feature request, not a gap.

---

## Phase 9 — Recent backend additions

### G21 startup-crash fix — manual restart vs script
- **Original step 2:** Stop FastAPI; restart it (after planting the
  non-numeric-suffix legacy row).
- **User remark:** "Quite unsure with what is needed here. Need to test using
  test-misc? Or just manual restart".
- **Outcome:** **CLARIFY.** Both paths work; they verify *different* things:
  - **Manual restart** verifies the **real boot** path. Before the G21 fix,
    `fetch_max_order_suffixes` would crash with
    `psycopg2.errors.InvalidTextRepresentation` and FastAPI would refuse to
    start. The pass-criterion is "FastAPI starts without traceback".
  - **`test-misc.ps1`** doesn't actually restart FastAPI; it runs the
    aggregation SQL verbatim against the live DB, so it exercises the regex
    filter (`WHERE split_part(...) ~ '^[0-9]+$'`) but skips the boot path.
  - For full coverage, run both. The script is the regression guard; the
    restart is the user-visible smoke.

### Phase 0 — CORS_ORIGINS override breaks the React app
- **Original:** Restart FastAPI with `CORS_ORIGINS=http://localhost:9999` →
  only that origin is now allowed; the Vite dev server (5173) is blocked.
- **User remark:** "API stays dead to the interface".
- **Outcome:** **EXPECTED.** When you whitelist only `localhost:9999`, the
  React app at `localhost:5173` can no longer make API calls — that's the
  *point* of the test. "API stays dead" is the symptom you want to observe.
  Hit DevTools Console; you should see `CORS policy: No
  'Access-Control-Allow-Origin' header is present` for every call. Reset
  `CORS_ORIGINS` (or remove it from `.env`) afterwards to restore.

### Phase 0 — `GET /orders` node_count assertion
- **Original:** `node_count` matches `SELECT count(*) FROM order_nodes WHERE
  order_pk=<id>;`.
- **User remark:** "Not sure what is asked here".
- **Outcome:** **CLARIFY.** Each row in `GET /orders` carries a `node_count`
  field synthesised by a `LEFT JOIN … COUNT(*) GROUP BY` in `db.fetch_orders()`.
  This step is checking the join math:
  1. From the response, pick any order row and note its `id` (DB primary key,
     not the `orderId` string) and `node_count`.
  2. Run `psql -U postgres -d amr_integration -c "SELECT count(*) FROM
     order_nodes WHERE order_pk=<that_id>;"`.
  3. The numbers should match exactly.
  - Optional script:
    ```powershell
    $first = (curl.exe -s http://localhost:8000/orders | ConvertFrom-Json).orders[0]
    Write-Host "API node_count=$($first.node_count) for order_pk=$($first.id)"
    psql -U postgres -d amr_integration -c "SELECT count(*) FROM order_nodes WHERE order_pk=$($first.id);"
    ```

### Phase 0 — Mosquitto WebSocket listener on :9001 (whole subsection)
- **User remark on the section:** "Not sure what is asked here".
- **Outcome:** **CLARIFY.** This verifies the second Mosquitto listener that
  the browser uses (port 9001, WebSocket-framed MQTT). The TCP listener
  (1883) is for backend services.
  - **`mosquitto.conf` block** — open `mosquitto/mosquitto.conf` in any
    editor. You should see something like:
    ```
    listener 9001
    protocol websockets
    allow_anonymous true
    ```
  - **Mosquitto logs** — when Mosquitto starts (either standalone or via
    `docker compose logs mosquitto`), it logs `Opening ipv4 listen socket
    on port 1883` *and* a similar line for 9001.
  - **`netstat`** — `netstat -an | findstr ":9001"` shows
    `TCP 0.0.0.0:9001 LISTENING`. (User already confirmed this.)
  - **Browser WS** — with `npm run dev` running, open
    `http://localhost:5173/`, F12 → Network → filter "WS" → you should see
    one WebSocket to `ws://localhost:9001/mqtt` in **Status 101 / state
    "open"**. Click it, switch to the "Messages" / "Frames" tab — you'll see
    MQTT control packets (CONNECT, SUBSCRIBE, PUBLISH).

---

## Phase 10 — Frontend smoke

### `npm install` warnings
- **Original:** `cd frontend && npm install` completes without errors.
- **User remark:** "No errors just npm warn".
- **Outcome:** **EXPECTED.** `npm WARN` lines are warnings, not errors —
  usually deprecated transitive deps. The pass-criterion is *no errors*.

### `optimizeDeps` complaint
- **Original:** If `optimizeDeps` complaint on first run, delete
  `node_modules/.vite/` and re-run `npm run dev`.
- **User remark:** "No complaints".
- **Outcome:** **EXPECTED.** That step is a *conditional* fallback, not a
  required assertion. The box should be checked.

### `npm run typecheck` zero errors
- **Original:** Exits 0.
- **User remark (2026-05-21):** "Found 7 errors, placed into
  frontend/typecheck.txt".
- **Outcome:** **RESOLVED THIS SESSION (2026-05-22).** 8 errors fixed across
  4 files (1 new file `vite-env.d.ts` to type `import.meta.env`, 1 index
  signature on `ListOrdersQuery`, 4 MUI X v7 `valueFormatter` rewrites to
  read from `row`). `npx tsc -b --noEmit` now exits 0. See CONTINUATION.md
  entry "Frontend typecheck zero-errored…".

### `npm run build` warnings
- **Original:** Produces `dist/` without errors.
- **User remark:** "Only some warnings".
- **Outcome:** **EXPECTED.** The warning is `Some chunks are larger than 500
  kB after minification` — a perf hint, not an error. The build succeeded.
  If first-load time becomes an issue, code-split routes with `React.lazy()`;
  for now it's fine on LAN.

### Health pills — only API turns red when FastAPI stops
- **Original:** Stop FastAPI → within 5 s: API red, **DB red, ROS red**.
- **User remark:** "Only API turns red, others stays green. On refresh
  others turn idle and api turns red and mqtt stays green".
- **Outcome:** **GAP — opened as G25** ([gaps.md](gaps.md#g25)). DB and ROS
  status are *derived* from `/system/status` — when that endpoint stops
  responding, the pills should degrade ("idle" or "unknown") on the next
  failed poll, not stay frozen green. They only update on page-refresh
  today.

### CORS — `Origin` request header check
- **Original:** Network tab: requests to `localhost:8000/*` carry
  `Origin: http://localhost:5173` and get back `access-control-allow-origin`
  matching.
- **User remark:** "Not sure what is asked here".
- **Outcome:** **CLARIFY.** Open the React app at `localhost:5173`, F12 →
  Network → click any API row (e.g. `system/status`):
  - **Request Headers** panel should list `Origin: http://localhost:5173`
    (the browser sets this automatically for cross-origin requests).
  - **Response Headers** panel should list
    `access-control-allow-origin: http://localhost:5173`.
  Both must be present and match. If the response is missing the ACAO
  header, the browser will block the response from JS and you'll see a
  red CORS error in the Console.

---

## Phase 11 — Frontend v1 screens

### Dashboard — "last seen" stuck at 0s
- **Original:** After a `state` MQTT message arrives, "last seen" resets to
  "0s ago" and ticks upward.
- **User remark:** "Stays 0, bug or because of repeated reset on message
  arrival".
- **Outcome:** **GAP — opened as G26** ([gaps.md](gaps.md#g26)). Possible
  causes (need to inspect the RobotTile component):
  1. No `setInterval` driving a re-render every second, so the elapsed-time
     calculation never re-runs.
  2. The robot is genuinely emitting `state` every <1 s (5 s heartbeat plus
     change-based publishes), so by the time the formatter runs the elapsed
     is always <1 s and rounds to 0. If true, that's not a bug — but the
     formatter could show `<1s` instead of `0s` so it's distinguishable.
- **Triage step:** open `RobotTile.tsx`, search for `lastSeen` /
  `lastUpdated` / `formatDistance`; if there's no `setInterval` or `useNow`
  hook, that's the root cause.

### Dashboard — no-robots empty state
- **Original:** No robots in fleet → "No robots in the fleet" hint with a
  pointer to Admin → Robots.
- **User remark:** "Not sure what is asked here".
- **Outcome:** **CLARIFY.** Reproduction:
  1. Go to **Admin → Robots**.
  2. Delete every robot row (only possible for robots with no telemetry —
     for `amr001` you'd have to truncate the telemetry tables first, which
     is destructive; skip unless you have a throwaway DB).
  3. Navigate to `/` (Dashboard).
  4. Instead of an empty grid, you should see a placeholder message like
     "No robots in the fleet" with a button/link to `/admin/robots`.
  - Easier alternative: read `frontend/src/components/robot/RobotTile.js` or
    the dashboard component to confirm the placeholder block exists — if
    there's no `if (robots.length === 0)` branch, that's an unimplemented
    feature, not a bug.

### Robot Detail Map — "Waiting for /reference/map…" without publisher
- **Original:** Without anyone publishing `/reference/map`: canvas shows
  "Waiting for /reference/map…"; no crash.
- **User remark:** "Not sure how to emulate this".
- **Outcome:** **CLARIFY.** Two ways:
  1. **No robot at all** — start the React app + FastAPI but no robot /
     rosbridge connected. The MapCanvas tries to subscribe to
     `/reference/map` on a closed rosbridge → shows the waiting state
     indefinitely.
  2. **Live robot, manually unpublish** — `rostopic pub /reference/map nav_msgs/OccupancyGrid '{}'` (impossible in
     practice — it's a sticky-publisher convention); easier: shut down the
     map node (`rosnode kill /map_server`) and refresh the React page.
  - Pass criterion: canvas shows the waiting overlay; no white screen, no
    console exception, no infinite spinner.

### Robot Detail Map — non-square map
- **Original:** Once map is publishing: occupancy grid renders. Aspect
  ratio preserved.
- **User remark:** "Current map is square, not yet tested with random map
  size".
- **Outcome:** **TEST SETUP.** Worth re-testing with `map-002` (the "Office
  CPR" seed) or any non-square `nav_msgs/OccupancyGrid` to confirm the
  canvas preserves aspect ratio (no stretch). The MapCanvas math uses
  `width/height` from the grid info, so it should handle any ratio — but
  it's not visually confirmed.

### Robot Detail Map — pin labels invisible
- **Original:** Named locations on the robot's map appear as violet pins
  with labels.
- **User remark:** "Pins are there, but labels are not visible due to color
  similarity with background. Make it violet too or change to other than
  bright colors".
- **Outcome:** **GAP — opened as G27** ([gaps.md](gaps.md#g27)). Trivial
  fix: change label text colour or add a contrast outline/halo in
  `MapCanvas.tsx`. Slate-900 background, so any near-slate colour
  disappears; needs a light or saturated colour with stroke.

---

## Cross-cutting takeaways

- **Real bugs surfaced (4):** G24 / G25 / G26 / G27 — see
  [gaps.md](gaps.md). G24 (500-not-503) and G25 (stale pills) are user-visible
  in any outage scenario; G26/G27 are polish.
- **Documentation clarity needs work** on Phase 9 + Phase 11 — multiple
  "not sure what is asked" remarks all map to checklist steps that assume
  context the operator may not have. When a step requires more than one
  line of setup or a SQL query, the step text should include the snippet
  (not just describe the intent).
- **The retention test (Phase 6 G19)** consistently trips users because the
  pass criterion depends on a *correctly timestamped* plant row. The
  automation (`scripts/test/test-retention.ps1`) sidesteps this by computing
  the timestamp itself; recommend pointing first-time testers to the script
  rather than the manual recipe.

---

## See also

- [`manual-test-checklist.md`](manual-test-checklist.md) — the source list, phase-ordered.
- [`manual-test-by-service.md`](manual-test-by-service.md) — the leftover manual items re-grouped by service.
- [`gaps.md`](gaps.md) — the gap registry (G24–G27 are the new entries from this walkthrough).
- [`CONTINUATION.md`](CONTINUATION.md) — handoff snapshot including this session's typecheck fixes.

# Extending the System

> **Who this is for:** developers adding a *feature* — a new REST endpoint, a
> new telemetry field, a new screen, a new table. This is the task-oriented
> companion to the [architecture reference](architecture.md) (which explains
> the system as-is) and the [contracts](../schema/) (the source of truth).

## Two kinds of change

Before writing code, check which kind of change you actually need — many
"customizations" need no code at all:

- **Data / configuration** — *which* robots, maps, and named locations exist,
  and the fleet's VDA5050 identity. These live in the **database**, edited
  through **Admin** screens or the [reference-data CRUD API](../schema/REST_ENDPOINTS.md#reference-data-crud).
  Adding a robot is a row, not a commit — see
  [Connecting a robot](../user-guide/connecting-a-robot.md). *No recipe below
  applies.*
- **Behaviour / code** — a new endpoint, message, topic, screen, or table.
  That's everything below.

## The one rule that ties it together

**Contracts in [`docs/schema/`](../schema/) are the source of truth.** Every
recipe ends by updating the matching contract file *in the same change*, and
adding the test that guards it. A feature that changes a contract without
updating `schema/` is not done.

| If you touch… | Update this contract | And this test tier |
|---|---|---|
| A REST route | [`REST_ENDPOINTS.md`](../schema/REST_ENDPOINTS.md) | pytest + Postman |
| An MQTT topic / VDA5050 message | [`MQTT_TOPICS.md`](../schema/MQTT_TOPICS.md), [`VDA5050_MESSAGES.md`](../schema/VDA5050_MESSAGES.md) | node:test |
| A ROS topic / telemetry field | [`ROS_TOPICS.md`](../schema/ROS_TOPICS.md) | node:test |
| A database table / column | [`DATABASE_SCHEMA.md`](../schema/DATABASE_SCHEMA.md) + `schema.sql` + a migration | integration |
| A frontend screen | [`services/frontend.md`](services/frontend.md) | Playwright |

Test commands per tier are in [Testing](testing.md).

---

## Recipe 1 — Add a REST endpoint (FastAPI)

The gateway is `fastapi-service/`. Routers are split by resource under
`app/routers/` and mounted in the root `main.py`.

1. **Define the request/response shapes** in `app/schemas.py` (Pydantic
   models — this is what produces 422 on bad input and the Swagger docs).
2. **Add the route.** Either extend an existing router or create
   `app/routers/<resource>.py` following the house pattern:
   ```python
   from fastapi import APIRouter
   from .. import db
   from ..schemas import MyThingIn

   router = APIRouter(prefix="/mything", tags=["mything"])

   @router.get("")
   def list_things():
       return {"things": db.fetch_things()}
   ```
3. **Put DB access in `app/db.py`**, not in the router — routers stay thin and
   catch `DatabaseUnavailable` → 503 / `IntegrityConflict` → 409, matching the
   existing routers.
4. **Mount it** in `fastapi-service/main.py`:
   ```python
   from app.routers import ..., mything
   app.include_router(mything.router, dependencies=_auth)
   ```
   Use `dependencies=_auth` for client-facing routes (honours the `API_KEY`
   guard); omit it only for the internal `/ingest/*` boundary.
5. **Document it** in [`REST_ENDPOINTS.md`](../schema/REST_ENDPOINTS.md) —
   purpose, body, every status code.
6. **Test it:** a pytest in `fastapi-service/tests/` (DB is mocked via
   `tests/conftest.py`), and a request in the Postman collection
   (`docs/postman/amr-integration.postman_collection.json`) so the Newman
   smoke suite and CI cover it.

> If the new route is meant to drive the UI, you also need a client function —
> see Recipe 4.

---

## Recipe 2 — Add or extend a VDA5050 message / MQTT topic

VDA5050 messages travel on `amr/v2/moverobotic/{serialNumber}/{topic}`. The
ROS Bridge publishes them; FastAPI's own subscriber persists them.

1. **Build the message** in `ros-bridge-service/src/vda5050.js` (the message
   builders / `headerId` stamping). If it's an addition to robot `state`, the
   builder is `src/stateBuilder.js` instead.
2. **Publish it** through `src/mqttClient.js` (the per-robot client that owns
   QoS and the retained `connection` Last-Will). Pick the QoS the contract
   specifies — `order`/`state`/`instantActions` are QoS 0; `connection` is
   QoS 1 + retained.
3. **Ingest it on the FastAPI side:** subscribe in `app/mqtt.py` and persist
   in `app/ingest_service.py` (the live telemetry path). The matching
   `/ingest/*` route is the secondary manual-injection path.
4. **Document it** in [`VDA5050_MESSAGES.md`](../schema/VDA5050_MESSAGES.md)
   (the JSON shape) and [`MQTT_TOPICS.md`](../schema/MQTT_TOPICS.md) (topic,
   QoS, retained?).
5. **Test it:** a `node:test` in `ros-bridge-service/test/` for the builder,
   and `scripts/test/test-ingest.ps1` covers the publish → ingest → Postgres
   round-trip.

---

## Recipe 3 — Consume a new ROS topic / add a telemetry field

The robot exposes its ROS topics over the rosbridge WebSocket; the Bridge
condenses them into one VDA5050 `state`.

1. **Subscribe** to the ROS topic in the relevant bridge module —
   `src/poseBridge.js` (pose/AMCL), `src/odomBridge.js` (odometry), or
   `src/robot.js` (wire-up for a new source).
2. **Fold the value into `state`** in `src/stateBuilder.js` — and remember the
   significant-change thresholds (>0.05 m, >5°, order/error change) that decide
   when `state` republishes.
3. **Surface it** in the frontend if needed — the realtime layer
   (`frontend/src/realtime/`) parses `state`; add the field to its types and
   the consuming component.
4. **Document it** in [`ROS_TOPICS.md`](../schema/ROS_TOPICS.md), and in
   [`VDA5050_MESSAGES.md`](../schema/VDA5050_MESSAGES.md) if it added a `state`
   field.
5. **Test it:** extend the `stateBuilder` `node:test`.

---

## Recipe 4 — Add a frontend screen

The console is `frontend/` (React + TypeScript + Vite). A screen is a page, a
route, a nav entry, and usually a typed API client.

1. **Page component** — `frontend/src/pages/<Name>.tsx`.
2. **Route** — register it in `frontend/src/router.tsx` (inside the `AppShell`
   route, mirroring the REST shape where it makes sense, e.g. `/things/:id`).
3. **Nav entry** — add to the list in
   `frontend/src/components/layout/LeftNav.tsx` (`{ to, label, icon }`).
4. **API client** — add a function in `frontend/src/api/<resource>.ts` built on
   the shared `client.ts` (it carries the base URL and `X-API-Key`); read it in
   the page with TanStack Query.
5. **Live data?** Subscribe to telemetry through `frontend/src/realtime/`
   rather than polling — that's the MQTT-over-WebSocket lane.
6. **Document it** in the Screens table of
   [`services/frontend.md`](services/frontend.md).
7. **Test it:** a Playwright spec in `frontend/tests/e2e/` (the non-robot
   surface is E2E-tested), and keep `npm run typecheck` green.

> Keep the UI conventions in [`services/frontend.md`](services/frontend.md):
> angles are **degrees** at the UI layer, converted to quaternion only at the
> rosbridge boundary.

---

## Recipe 5 — Add a database table or column

Postgres is initialised from `docs/schema/schema.sql`, which **drops and
recreates** every table — so it only helps a *fresh* database. Existing dev
databases need a migration.

1. **Add it to `docs/schema/schema.sql`** so new deployments get it. This file
   is mounted by `docker-compose.yml` as the init script — *do not move or
   rename it.*
2. **Write a migration** at
   `docs/schema/migrations/<YYYY-MM-DD>_<description>.sql` for databases that
   already exist. Make it idempotent (`ADD COLUMN IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`) and wrap it in `BEGIN; … COMMIT;` — see
   `migrations/2026-05-25_robots_archived_at.sql` as the template.
3. **Add access helpers** in `fastapi-service/app/db.py` and the Pydantic
   shapes in `app/schemas.py` (Recipe 1 covers exposing them over REST).
4. **Document it** in [`DATABASE_SCHEMA.md`](../schema/DATABASE_SCHEMA.md) —
   keep its table count and the relationships diagram in sync.

---

## Service-boundary cheat-sheet

Where a change has to land, by service:

| You want to… | Service(s) | Entry file(s) |
|---|---|---|
| New HTTP route | FastAPI | `app/routers/*`, `main.py`, `app/db.py` |
| New / changed VDA5050 message | ROS Bridge + FastAPI | `src/vda5050.js`, `src/mqttClient.js`, `app/ingest_service.py` |
| New robot telemetry field | ROS Bridge (+ frontend) | `src/stateBuilder.js`, `src/poseBridge.js`/`odomBridge.js` |
| New screen / widget | Frontend | `src/pages/*`, `router.tsx`, `LeftNav.tsx`, `src/api/*` |
| New table / column | DB + FastAPI | `schema/schema.sql`, `schema/migrations/*`, `app/db.py` |
| New robot / map / location | *none — it's data* | Admin UI or [CRUD API](../schema/REST_ENDPOINTS.md#reference-data-crud) |

## Start-order reminder

Two services read configuration once, at boot, so some changes need a restart:

- **FastAPI** loads the fleet from the database at startup (the in-memory
  `RobotRegistry` reloads after reference-data writes, so CRUD edits are live).
- **The ROS Bridge** instantiates one `Robot` per `GET /fleet` entry at boot —
  **adding or removing a robot needs `docker compose restart ros-bridge`.**

Full topology and the start order (Postgres → FastAPI → ROS Bridge) are in the
[architecture reference](architecture.md).

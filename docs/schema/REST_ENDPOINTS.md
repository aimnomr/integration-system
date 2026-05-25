# REST Endpoints

FastAPI is the **FMS gateway**: robot-scoped routes that publish VDA5050 `order` /
`instantActions`, read PostgreSQL-backed state/OEE, and accept telemetry ingestion
from Node-RED. The legacy flat `/amr/*` and `/system/connect|disconnect` routes have
been **removed**.

## Authentication & rate limiting

These are **cross-cutting** — they apply to the endpoints below in addition to each
endpoint's own status codes.

**Authentication (G10).** Opt-in via the `API_KEY` environment variable. When
`API_KEY` is unset (the local-development default) the API is open. When it is set,
every request to a guarded endpoint must carry a matching `X-API-Key` header, or it
is rejected with **401**.

| Scope | Endpoints | Guarded? |
|---|---|---|
| Client-facing | `/robots/*`, `/fleet`, `/system/*` | Yes — `X-API-Key` required when `API_KEY` is set |
| Internal ingestion | `/ingest/*` | No — internal Node-RED → DB boundary, left open |

When `API_KEY` is set, the ROS Bridge Service must also send it (set `API_KEY` in
`ros-bridge-service/.env`) so its `GET /fleet` call still succeeds.

**Rate limiting (G11).** A per-client-IP sliding window, `RATE_LIMIT_PER_MINUTE`
requests per 60 s (default 120; `0` disables it). Exceeding it returns **429** with a
`Retry-After` header. `/ingest/*` and the docs routes are exempt.

**CORS (G18).** Origins allowed to call the API from a browser come from the
`CORS_ORIGINS` env var (comma-separated; default `http://localhost:5173`, the Vite
dev server). Preflight `OPTIONS` requests are handled by `CORSMiddleware`; any
origin not in the list will have its responses stripped of the
`Access-Control-Allow-Origin` header and be blocked by the browser. All methods and
headers are allowed for listed origins; credentials (`X-API-Key`) are permitted.

## Table of Contents

**POST**
- [POST /robots/{serial}/order](#post-robotsserialorder)
- [POST /robots/{serial}/order/named](#post-robotsserialordernamed)
- [POST /robots/{serial}/instant-actions](#post-robotsserialinstant-actions)
- [POST /ingest/state](#post-ingeststate)
- [POST /ingest/connection](#post-ingestconnection)
- [POST /ingest/command](#post-ingestcommand)
- [POST /ingest/oee-cycle](#post-ingestoee-cycle)

**GET**
- [GET /robots](#get-robots)
- [GET /fleet](#get-fleet)
- [GET /robots/{serial}/state](#get-robotsserialstate)
- [GET /robots/{serial}/oee/summary](#get-robotsserialoeesummary)
- [GET /robots/{serial}/oee/cycles](#get-robotsserialoeecycles)
- [GET /robots/{serial}/oee/availability](#get-robotsserialoeeavailability)
- [GET /orders](#get-orders)
- [GET /orders/{order_id}](#get-ordersorder_id)
- [GET /system/status](#get-systemstatus)

**Reference-data CRUD (G15)** — `maps`, `named_locations`, `robots`, `fleet_config`
- [Reference-data CRUD](#reference-data-crud)

---

## POST

### POST /robots/{serial}/order

**Purpose:** Submit a navigation order (one node = a single goal, N nodes = a sequence) to a robot; the gateway builds a VDA5050 `order` and publishes it.

**Path Parameters:**
| Name | Type | Description |
|------|------|-------------|
| serial | string | Robot serial number (e.g. `amr001`) |

**Request Body:**
```json
{
  "nodes": [
    { "x": <float>, "y": <float>, "theta": <float> }
  ]
}
```

**Response Body:**
```json
{
  "status": "ok",
  "orderId": <string>,
  "nodeCount": <integer>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Order published |
| 404 | Robot serial not registered |
| 422 | Request body failed schema validation, or empty `nodes` |

---

### POST /robots/{serial}/order/named

**Purpose:** Submit an order using predefined named-location IDs; each ID resolves to one node of the resulting VDA5050 `order`.

**Path Parameters:**
| Name | Type | Description |
|------|------|-------------|
| serial | string | Robot serial number |

**Request Body:**
```json
{
  "location_ids": [<integer>]
}
```

**Response Body:**
```json
{
  "status": "ok",
  "orderId": <string>,
  "nodeCount": <integer>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Order published |
| 404 | Robot serial not registered, or a location ID not found |
| 422 | Request body failed schema validation, or empty `location_ids` |

---

### POST /robots/{serial}/instant-actions

**Purpose:** Send an immediate action (cancel / retry / skip) to a robot; the gateway builds a VDA5050 `instantActions` message.

**Path Parameters:**
| Name | Type | Description |
|------|------|-------------|
| serial | string | Robot serial number |

**Request Body:**
```json
{
  "action_type": "cancelOrder" | "retryNode" | "skipNode"
}
```

**Response Body:**
```json
{
  "status": "ok",
  "actionType": <string>,
  "actionId": <string>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Instant action published |
| 404 | Robot serial not registered |
| 422 | Request body failed schema validation |

---

### POST /ingest/state

**Purpose:** Internal ingestion — Node-RED POSTs a VDA5050 `state` message here to be persisted to `state_snapshots`.

**Request Body:**
```json
<VDA5050 state message>
```

**Response Body:**
```json
{ "status": "ok" }
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | State persisted |
| 422 | Request body missing/invalid a required field (`serialNumber`, `timestamp`) |
| 503 | Database unavailable |

---

### POST /ingest/connection

**Purpose:** Internal ingestion — Node-RED POSTs a VDA5050 `connection` message here to be persisted to `connection_log`.

**Request Body:**
```json
<VDA5050 connection message>
```

**Response Body:**
```json
{ "status": "ok" }
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Connection event persisted |
| 422 | Request body missing/invalid a required field (`serialNumber`, `timestamp`, `connectionState`) |
| 503 | Database unavailable |

---

### POST /ingest/command

**Purpose:** Internal ingestion — Node-RED's command-audit tap POSTs each `order` / `instantActions` message here to be persisted to `order_log`.

**Request Body:**
```json
{
  "kind": "order" | "instantActions",
  "message": <object>
}
```

**Response Body:**
```json
{ "status": "ok" }
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Command persisted |
| 422 | Request body failed schema validation |
| 503 | Database unavailable |

---

### POST /ingest/oee-cycle

**Purpose:** Internal ingestion — Node-RED POSTs a derived OEE trip cycle here to be persisted to `oee_cycles`.

**Request Body:**
```json
{
  "serialNumber": <string>,
  "orderId": <string>,
  "startTime": <string>,
  "endTime": <string>,
  "result": "SUCCEEDED" | "ABORTED"
}
```

**Response Body:**
```json
{ "status": "ok" }
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Cycle persisted |
| 422 | Request body missing/invalid a required field (`serialNumber`, `orderId`, `startTime`, `endTime`, `result`) |
| 503 | Database unavailable |

---

## GET

### GET /robots

**Purpose:** List every robot in the fleet registry.

**Request Body:** None

**Response Body:**
```json
{
  "robots": [
    { "serialNumber": <string>, "manufacturer": <string>, "mapId": <string>, "rosbridgeUrl": <string> }
  ]
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Registry returned |

---

### GET /fleet

**Purpose:** Return the full fleet definition. The ROS Bridge Service fetches this at
startup to learn its fleet roster — the database is the single source of truth, and
this endpoint is its gateway.

**Request Body:** None

**Response Body:**
```json
{
  "interfaceName": <string>,
  "majorVersion": <string>,
  "version": <string>,
  "manufacturer": <string>,
  "robots": [
    { "serialNumber": <string>, "rosbridgeUrl": <string>, "mapId": <string> }
  ]
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Fleet definition returned |

---

### GET /robots/{serial}/state

**Purpose:** Return the most recent VDA5050 `state` snapshot stored for a robot.

**Path Parameters:**
| Name | Type | Description |
|------|------|-------------|
| serial | string | Robot serial number |

**Request Body:** None

**Response Body:**
```json
<latest state_snapshots row>
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Latest state returned |
| 404 | Robot serial not registered, or no state recorded |
| 503 | Database unavailable |

---

### GET /robots/{serial}/oee/summary

**Purpose:** Return aggregate OEE figures for a robot — total/succeeded/failed cycles and average duration.

**Path Parameters:**
| Name | Type | Description |
|------|------|-------------|
| serial | string | Robot serial number |

**Request Body:** None

**Response Body:**
```json
{
  "total_cycles": <integer>,
  "succeeded": <integer>,
  "failed": <integer>,
  "avg_duration_s": <float>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Summary returned |
| 404 | Robot serial not registered |
| 503 | Database unavailable |

---

### GET /robots/{serial}/oee/cycles

**Purpose:** Return recent OEE trip cycles for a robot.

**Path Parameters:**
| Name | Type | Description |
|------|------|-------------|
| serial | string | Robot serial number |

**Request Body:** None

**Response Body:**
```json
{
  "cycles": [
    { "id": <integer>, "serial_number": <string>, "order_id": <string>, "start_time": <string>, "end_time": <string>, "duration_s": <float>, "result": <string> }
  ]
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Cycles returned |
| 404 | Robot serial not registered |
| 503 | Database unavailable |

---

### GET /robots/{serial}/oee/availability

**Purpose:** Return a rough availability figure — the fraction of state snapshots in which the robot was driving.

**Path Parameters:**
| Name | Type | Description |
|------|------|-------------|
| serial | string | Robot serial number |

**Request Body:** None

**Response Body:**
```json
{
  "driving_samples": <integer>,
  "total_samples": <integer>,
  "availability": <float>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Availability returned |
| 404 | Robot serial not registered |
| 503 | Database unavailable |

---

### GET /orders

**Purpose:** Paged historical order list (every `order` message persisted via the
gateway's publish path or the Node-RED audit tap). Used by the UI's Order History
screen.

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| serial | string | _(all)_ | Filter to one robot's orders |
| limit | integer | 50 | Max rows; clamped to `[1, 500]` |
| before | string (ISO-8601) | _(none)_ | Cursor — return rows older than this timestamp |

**Request Body:** None

**Response Body:**
```json
{
  "orders": [
    {
      "id":               <integer>,
      "serial_number":    <string>,
      "ts":               <string (ISO-8601)>,
      "header_id":        <integer>,
      "order_id":         <string>,
      "order_update_id":  <integer>,
      "node_count":       <integer>
    }
  ],
  "count": <integer>
}
```

Rows are newest-first. Paginate by passing the `ts` of the last row back as
`before` on the next request.

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Orders returned (empty list if none match) |
| 404 | `serial` was supplied but is not registered |
| 422 | `limit` out of range or malformed `before` |
| 503 | Database unavailable |

---

### GET /orders/{order_id}

**Purpose:** Detail view for one historical order — header row plus the joined
`order_nodes` and `order_edges`. Drives the Order History row drill-down (G31).

**Path Parameters:**
| Name | Type | Description |
|------|------|-------------|
| order_id | string | VDA5050 `orderId`, e.g. `amr001-order-7` |

**Request Body:** None

**Response Body:**
```json
{
  "id":               <integer>,
  "serial_number":    <string>,
  "ts":               <string (ISO-8601)>,
  "header_id":        <integer>,
  "order_id":         <string>,
  "order_update_id":  <integer>,
  "nodes": [
    {
      "node_id":     <string>,
      "sequence_id": <integer>,
      "released":    <boolean>,
      "pos_x":       <number>,
      "pos_y":       <number>,
      "theta":       <number>,
      "map_id":      <string>
    }
  ],
  "edges": [
    {
      "edge_id":       <string>,
      "sequence_id":   <integer>,
      "released":      <boolean>,
      "start_node_id": <string>,
      "end_node_id":   <string>
    }
  ]
}
```

If multiple rows share the same `order_id` (an updated order), the newest is
returned. `nodes` and `edges` are ordered by `sequence_id`.

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Order returned |
| 404 | `order_id` does not exist |
| 503 | Database unavailable |

---

### GET /system/status

**Purpose:** Report gateway health — MQTT broker, database, rosbridge, and Node-RED
connectivity.

**Request Body:** None

**Response Body:**
```json
{
  "timestamp": <string>,
  "mosquitto": { "status": "connected" | "disconnected" },
  "database": { "status": "connected" | "unavailable" },
  "roslib": { "status": "connected" | "disconnected" | "unknown" },
  "node_red": { "status": "connected" | "disconnected" }
}
```

- `roslib` — inferred from the robots' retained VDA5050 `connection` topics:
  `connected` if any robot reports `ONLINE`, `disconnected` if states are known but
  none are online, `unknown` until the first `connection` message is seen.
- `node_red` — a best-effort HTTP probe of `NODE_RED_URL` (default
  `http://localhost:1880`); `connected` if the port responds at all.

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Status returned |

---

## Reference-data CRUD

Per-row create / update / delete for the reference tables (`maps`,
`named_locations`, `robots`, `fleet_config`), so editing them no longer means
re-applying `schema.sql` (which drops every table and wipes all telemetry).
Added under **G15**. These endpoints are guarded by the same `X-API-Key` auth
and rate limiting as the rest of the client-facing API.

**Shared status codes**

| Code | Condition |
|------|-----------|
| 200 | Read / update succeeded |
| 201 | Resource created |
| 404 | Resource not found |
| 409 | Constraint conflict — duplicate primary key, or a `DELETE` that an existing foreign key still references (the FK is **never** cascaded) |
| 422 | Request body failed schema validation, or references a non-existent map |
| 503 | Database unavailable |

### Maps — `/maps`

| Method | Path | Purpose |
|---|---|---|
| GET | `/maps` | List all maps → `{ "maps": [{ "map_id", "label" }] }` |
| GET | `/maps/{map_id}` | One map |
| POST | `/maps` | Create. Body: `{ "map_id": <string>, "label": <string> }` → **201** |
| PUT | `/maps/{map_id}` | Update `label`. Body: `{ "label": <string> }` |
| DELETE | `/maps/{map_id}` | Delete. **409** if a robot or named location still references it |

### Named locations — `/locations`

| Method | Path | Purpose |
|---|---|---|
| GET | `/locations` | List all → `{ "locations": [...] }` |
| GET | `/locations/{id}` | One location |
| POST | `/locations` | Create. Body: `{ "id": <int>, "map_id": <string>, "label": <string>, "x": <float>, "y": <float>, "theta": <float> }` → **201** |
| PUT | `/locations/{id}` | Update. Body: as POST minus `id` |
| DELETE | `/locations/{id}` | Delete |

`theta` is the heading in radians (map frame); it defaults to `0.0`.

### Robots — `/robots`

In addition to the existing `GET /robots`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/robots?include_archived=true` | Admin view — adds archived rows. Each row carries `archivedAt` (ISO-8601 string when archived, `null` when active). |
| GET | `/robots/{serial}` | One robot → `{ "serial_number", "rosbridge_url", "map_id", "archived_at" }` |
| POST | `/robots` | Create. Body: `{ "serial_number": <string>, "rosbridge_url": <string>, "map_id": <string> }` → **201**. Returns **409** with `detail.code = "archived_serial"` (plus `serialNumber` + `archivedAt`) if the serial exists but is archived — the admin UI uses this to offer Restore inline. |
| PUT | `/robots/{serial}` | Update. Body: `{ "rosbridge_url": <string>, "map_id": <string> }`. **409** if the robot is archived — restore it first. |
| DELETE | `/robots/{serial}` | Hard-delete (no FK references). **409** if the robot still has telemetry / order history — use archive instead. |
| POST | `/robots/{serial}/archive` | Soft-delete. Hides the robot from operator surfaces and ingest. History rows survive intact. Idempotent. |
| POST | `/robots/{serial}/restore` | Un-archive a previously archived robot. Idempotent for already-active rows. |

Archive semantics:

- Operator surfaces (`GET /robots`, `GET /fleet`, Dashboard, Dispatch, Teleop, OEE) hide archived robots completely.
- Command paths (`POST /robots/{serial}/order`, `/instant-actions`, `GET /robots/{serial}/state`) return **410 Gone** for archived robots, naming the archive state.
- Ingest (`POST /ingest/state`, `/connection`, `/command`, `/oee-cycle`) returns **410** for archived serials, so a bridge that's still publishing for an archived robot does not bloat the database.
- History endpoints (`GET /orders`, `/oee/*`) still resolve archived serials — their historical rows remain readable.

After any robot write the in-memory `RobotRegistry` is reloaded, so the change is
visible without a FastAPI restart. **The ROS Bridge Service still needs a restart**
to actually start or stop a robot's process — it instantiates one `Robot` per
`GET /fleet` entry at boot.

### Fleet config — `PUT /fleet`

In addition to the existing `GET /fleet`:

| Method | Path | Purpose |
|---|---|---|
| PUT | `/fleet` | Update the single `fleet_config` row. Body: `{ "interface_name": <string>, "major_version": <string>, "version": <string>, "manufacturer": <string> }` |

The registry is reloaded after the write.

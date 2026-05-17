# REST Endpoints

FastAPI is the **FMS gateway**: robot-scoped routes that publish VDA5050 `order` /
`instantActions`, read PostgreSQL-backed state/OEE, and accept telemetry ingestion
from Node-RED. The legacy flat `/amr/*` and `/system/connect|disconnect` routes have
been **removed**.

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
- [GET /robots/{serial}/state](#get-robotsserialstate)
- [GET /robots/{serial}/oee/summary](#get-robotsserialoeesummary)
- [GET /robots/{serial}/oee/cycles](#get-robotsserialoeecycles)
- [GET /robots/{serial}/oee/availability](#get-robotsserialoeeavailability)
- [GET /system/status](#get-systemstatus)

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
| 422 | Request body is not a JSON object |
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
| 422 | Request body is not a JSON object |
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
| 422 | Request body is not a JSON object |
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

### GET /system/status

**Purpose:** Report gateway health — MQTT broker and database connectivity.

**Request Body:** None

**Response Body:**
```json
{
  "timestamp": <string>,
  "mosquitto": { "status": "connected" | "disconnected" },
  "database": { "status": "connected" | "unavailable" },
  "roslib": { "status": "unknown" },
  "node_red": { "status": "unknown" }
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Status returned |

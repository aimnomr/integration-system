# REST Endpoints

## Table of Contents

**POST**
- [POST /amr/goal](#post-amrgoal)
- [POST /amr/goal/named](#post-amrgoalnamed)
- [POST /amr/waypoints/start](#post-amrwaypointsstart)
- [POST /amr/waypoints/stop](#post-amrwaypointsstop)
- [POST /amr/waypoints/retry](#post-amrwaypointsretry)
- [POST /amr/waypoints/skip](#post-amrwaypointsskip)
- [POST /amr/cancel](#post-amrcancel)
- [POST /system/connect](#post-systemconnect)
- [POST /system/disconnect](#post-systemdisconnect)

**GET**
- [GET /amr/state](#get-amrstate)
- [GET /amr/health](#get-amrhealth)
- [GET /amr/nav/status](#get-amrnavstatus)
- [GET /oee/summary](#get-oeesummary)
- [GET /oee/cycles](#get-oeecycles)
- [GET /oee/availability](#get-oeeavailability)
- [GET /system/status](#get-systemstatus)

---

## POST

### POST /amr/goal

**Purpose:** Sends a single navigation goal to the AMR, called by React when the user submits a manual goal coordinate.

**Request Body:**
```json
{
  "x": <float>,
  "y": <float>,
  "angle": {
    "x": <float>,
    "y": <float>,
    "z": <float>
  }
}
```

**Response Body:**
```json
{
  "status": "ok",
  "message": <string>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Goal accepted and forwarded to MQTT |
| 422 | Request body failed schema validation |

---

### POST /amr/goal/named

**Purpose:** Sends a navigation goal to a predefined named location, called by React when the user selects a location from the location list.

**Request Body:**
```json
{
  "location_id": <integer>
}
```

**Response Body:**
```json
{
  "status": "ok",
  "location": <string>,
  "message": <string>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Goal accepted and forwarded to MQTT |
| 404 | Location ID not found in predefined locations |
| 422 | Request body failed schema validation |

---

### POST /amr/waypoints/start

**Purpose:** Begins an ordered waypoint navigation sequence, called by React when the user initiates a waypoint run.

**Request Body:**
```json
{
  "waypoints": [
    {
      "id": <integer>,
      "label": <string>,
      "x": <float>,
      "y": <float>,
      "angle": {
        "x": <float>,
        "y": <float>,
        "z": <float>
      }
    }
  ]
}
```

**Response Body:**
```json
{
  "status": "ok",
  "waypoint_count": <integer>,
  "message": <string>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Waypoint sequence accepted and forwarded to MQTT |
| 422 | Request body failed schema validation |

---

### POST /amr/waypoints/stop

**Purpose:** Cancels the active goal and resets the waypoint sequence to IDLE, called by React when the user stops a waypoint run.

**Request Body:** None

**Response Body:**
```json
{
  "status": "ok",
  "message": <string>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Cancel command forwarded to MQTT |

---

### POST /amr/waypoints/retry

**Purpose:** Resends the current failed waypoint goal, called by React when the user retries after a navigation error.

**Request Body:** None

**Response Body:**
```json
{
  "status": "ok",
  "message": <string>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Retry command forwarded to MQTT |

---

### POST /amr/waypoints/skip

**Purpose:** Cancels the current waypoint goal and advances to the next in the sequence, called by React when the user skips a waypoint.

**Request Body:** None

**Response Body:**
```json
{
  "status": "ok",
  "message": <string>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Skip command forwarded to MQTT |

---

### POST /amr/cancel

**Purpose:** Cancels all active navigation goals immediately, called by React when the user issues an emergency stop.

**Request Body:** None

**Response Body:**
```json
{
  "status": "ok",
  "message": <string>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Cancel command forwarded to MQTT |

---

### POST /system/connect

**Purpose:** Instructs roslib.js to open a WebSocket connection to the rosbridge server at the given URL, called by React on the connection screen.

**Request Body:**
```json
{
  "url": <string>
}
```

**Response Body:**
```json
{
  "status": "ok",
  "url": <string>,
  "message": <string>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Connection attempt initiated |
| 422 | Request body failed schema validation |

---

### POST /system/disconnect

**Purpose:** Instructs roslib.js to close the active rosbridge WebSocket connection, called by React when the user disconnects from the robot.

**Request Body:** None

**Response Body:**
```json
{
  "status": "ok",
  "message": <string>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Disconnect command sent to roslib.js |

---

## GET

### GET /amr/state

**Purpose:** Returns the latest recorded pose and odometry snapshot from the database, called by React to display the current robot position.

**Request Body:** None

**Response Body:**
```json
{
  "timestamp": <string>,
  "pose": {
    "px": <float>,
    "py": <float>,
    "rz": <float>
  },
  "odom": {
    "position": {
      "x": <float>,
      "y": <float>,
      "z": <float>
    },
    "orientation": {
      "x": <float>,
      "y": <float>,
      "z": <float>,
      "w": <float>
    },
    "linear_velocity": <float>,
    "angular_velocity": <float>
  },
  "moving": <boolean>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Latest state returned successfully |
| 404 | No state records found in the database |

---

### GET /amr/health

**Purpose:** Returns the latest connection status and battery level from the database, called by React to display the system health panel.

**Request Body:** None

**Response Body:**
```json
{
  "timestamp": <string>,
  "connected": <boolean>,
  "rosbridge_url": <string>,
  "battery": {
    "level_pct": <float>,
    "charging": <boolean>
  }
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Latest health data returned successfully |
| 404 | No health records found in the database |

---

### GET /amr/nav/status

**Purpose:** Returns the current navigation state and waypoint progress from the database, called by React to update the navigation status panel.

**Request Body:** None

**Response Body:**
```json
{
  "timestamp": <string>,
  "status": "IDLE" | "NAVIGATING" | "SUCCEEDED" | "ABORTED" | "PREEMPTED",
  "goal_id": <string>,
  "progress": {
    "current_idx": <integer>,
    "total": <integer>,
    "progress_pct": <float>,
    "current_label": <string>
  }
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Navigation status returned successfully |
| 404 | No navigation records found in the database |

---

### GET /oee/summary

**Purpose:** Returns aggregated OEE scores over a time window, called by React to populate the OEE dashboard.

**Request Body:** None

**Response Body:**
```json
{
  "from": <string>,
  "to": <string>,
  "availability_pct": <float>,
  "performance_pct": <float>,
  "quality_pct": <float>,
  "oee_pct": <float>,
  "total_trips": <integer>,
  "successful_trips": <integer>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | OEE summary returned successfully |
| 422 | Query parameters failed validation |

---

### GET /oee/cycles

**Purpose:** Returns the paginated trip log with optional filters, called by React to display the trip history table.

**Request Body:** None

**Response Body:**
```json
{
  "from": <string>,
  "to": <string>,
  "result_filter": "SUCCEEDED" | "ABORTED" | "PREEMPTED" | null,
  "total": <integer>,
  "cycles": [
    {
      "trip_id": <string>,
      "origin": <string>,
      "destination": <string>,
      "start_time": <string>,
      "end_time": <string>,
      "duration_s": <float>,
      "result": "SUCCEEDED" | "ABORTED" | "PREEMPTED"
    }
  ]
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Trip log returned successfully |
| 422 | Query parameters failed validation |

---

### GET /oee/availability

**Purpose:** Returns an uptime breakdown over a time window, called by React to display the availability chart on the OEE dashboard.

**Request Body:** None

**Response Body:**
```json
{
  "from": <string>,
  "to": <string>,
  "total_time_s": <float>,
  "operational_time_s": <float>,
  "availability_pct": <float>
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Availability breakdown returned successfully |
| 422 | Query parameters failed validation |

---

### GET /system/status

**Purpose:** Returns the current health state of all integration services, called by React to display the system status panel.

**Request Body:** None

**Response Body:**
```json
{
  "timestamp": <string>,
  "roslib": {
    "status": "connected" | "disconnected" | "error",
    "rosbridge_url": <string>
  },
  "mosquitto": {
    "status": "connected" | "disconnected" | "error"
  },
  "node_red": {
    "status": "connected" | "disconnected" | "error"
  },
  "database": {
    "status": "connected" | "disconnected" | "error"
  }
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | System status returned successfully |

# MQTT Topics

## Table of Contents

**Inbound (Commands to Robot)**
- [amr/cmd/raw](#amrcmdraw)
- [amr/cmd/goal](#amrcmdgoal)
- [amr/cmd/waypoints](#amrcmdwaypoints)
- [amr/cmd/cancel](#amrcmdcancel)
- [amr/cmd/waypoints/retry](#amrcmdwaypointsretry)
- [amr/cmd/waypoints/skip](#amrcmdwaypointsskip)
- [amr/system/connect](#amrsystemconnect)
- [amr/system/disconnect](#amrsystemdisconnect)

**Outbound (Data from Robot)**
- [amr/state/odom](#amrstateodom)
- [amr/state/pose](#amrstatepose)
- [amr/state/nav/status](#amrstatenavstatus)
- [amr/state/nav/progress](#amrstatenavprogress)
- [amr/health/connection](#amrhealthconnection)
- [amr/health/battery](#amrhealthbattery)
- [amr/health/error](#amrhealtherror)
- [amr/oee/cycle](#amroeecycle)

---

## Inbound (Commands to Robot)

### amr/cmd/raw

**Direction:** FastAPI → Mosquitto → Node-RED  
**QoS:** 2  
**Purpose:** Carries the raw forwarded REST request body from the API gateway, triggering Node-RED to validate and route it to the correct typed command topic.

**Message Format:**
```json
{
  "command": "goal" | "waypoints" | "cancel",
  "payload": <object>
}
```

---

### amr/cmd/goal

**Direction:** Node-RED → Mosquitto → roslib.js  
**QoS:** 1  
**Purpose:** Carries a single validated navigation goal after Node-RED routes it from `amr/cmd/raw`.

**Message Format:**
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

---

### amr/cmd/waypoints

**Direction:** Node-RED → Mosquitto → roslib.js  
**QoS:** 1  
**Purpose:** Carries a validated ordered waypoint sequence after Node-RED routes it from `amr/cmd/raw`.

**Message Format:**
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

---

### amr/cmd/cancel

**Direction:** Node-RED → Mosquitto → roslib.js  
**QoS:** 1  
**Purpose:** Signals roslib.js to cancel all active navigation goals immediately after Node-RED routes it from `amr/cmd/raw`.

**Message Format:**
```json
{}
```

---

### amr/cmd/waypoints/retry

**Direction:** FastAPI → Mosquitto → roslib.js  
**QoS:** 1  
**Purpose:** Signals roslib.js to resend the current waypoint goal after a navigation error; published directly by FastAPI, not routed through Node-RED.

**Message Format:**
```json
{}
```

---

### amr/cmd/waypoints/skip

**Direction:** FastAPI → Mosquitto → roslib.js  
**QoS:** 1  
**Purpose:** Signals roslib.js to cancel the current waypoint goal and advance to the next in the sequence; published directly by FastAPI, not routed through Node-RED.

**Message Format:**
```json
{}
```

---

### amr/system/connect

**Direction:** FastAPI → Mosquitto → roslib.js  
**QoS:** 1  
**Purpose:** Instructs roslib.js to open a WebSocket connection to the rosbridge server at the given URL; published directly by FastAPI, not routed through Node-RED.

**Message Format:**
```json
{
  "url": <string>
}
```

---

### amr/system/disconnect

**Direction:** FastAPI → Mosquitto → roslib.js  
**QoS:** 1  
**Purpose:** Instructs roslib.js to close the active rosbridge WebSocket connection; published directly by FastAPI, not routed through Node-RED.

**Message Format:**
```json
{}
```

---

## Outbound (Data from Robot)

### amr/state/odom

**Direction:** roslib.js → Mosquitto → Node-RED  
**QoS:** 1  
**Purpose:** Carries robot odometry data, published when movement exceeds a distance or heading threshold, or every 5 seconds as a heartbeat when stationary.

**Message Format:**
```json
{
  "timestamp": <string>,
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
  "angular_velocity": <float>,
  "moving": <boolean>,
  "trigger": "distance" | "heading" | "heartbeat"
}
```

---

### amr/state/pose

**Direction:** roslib.js → Mosquitto → Node-RED  
**QoS:** 1  
**Purpose:** Carries the AMCL map-localised pose, published when movement exceeds a distance or heading threshold, or every 5 seconds as a heartbeat when stationary.

**Message Format:**
```json
{
  "timestamp": <string>,
  "px": <float>,
  "py": <float>,
  "qz": <float>,
  "qw": <float>,
  "rz": <float>,
  "moving": <boolean>,
  "trigger": "distance" | "heading" | "heartbeat"
}
```

---

### amr/state/nav/status

**Direction:** roslib.js → Mosquitto → Node-RED  
**QoS:** 1  
**Purpose:** Carries the current navigation goal status, published once per goal state transition.

**Message Format:**
```json
{
  "timestamp": <string>,
  "status": "IDLE" | "NAVIGATING" | "SUCCEEDED" | "ABORTED" | "PREEMPTED",
  "goal_id": <string>,
  "status_code": <integer>,
  "text": <string>
}
```

---

### amr/state/nav/progress

**Direction:** roslib.js → Mosquitto → Node-RED  
**QoS:** 0  
**Purpose:** Carries waypoint sequence progress, published after each waypoint in a sequence is completed or skipped.

**Message Format:**
```json
{
  "timestamp": <string>,
  "current_idx": <integer>,
  "total": <integer>,
  "progress_pct": <float>,
  "current_label": <string>
}
```

---

### amr/health/connection

**Direction:** roslib.js → Mosquitto → Node-RED  
**QoS:** 1  
**Purpose:** Carries the rosbridge connection state, published whenever the connection to rosbridge is established or lost.

**Message Format:**
```json
{
  "timestamp": <string>,
  "connected": <boolean>,
  "rosbridge_url": <string>
}
```

---

### amr/health/battery

**Direction:** roslib.js → Mosquitto → Node-RED  
**QoS:** 1  
**Purpose:** Carries the current battery level, published periodically from the robot's battery state topic.

**Message Format:**
```json
{
  "timestamp": <string>,
  "level_pct": <float>,
  "charging": <boolean>
}
```

---

### amr/health/error

**Direction:** roslib.js → Mosquitto → Node-RED  
**QoS:** 2  
**Purpose:** Carries error event details, published whenever roslib.js detects a fault in the ROS connection, command execution, or message handling.

**Message Format:**
```json
{
  "timestamp": <string>,
  "error_type": <string>,
  "message": <string>,
  "source": <string>
}
```

---

### amr/oee/cycle

**Direction:** roslib.js → Mosquitto → Node-RED  
**QoS:** 1  
**Purpose:** Carries a completed trip record, published once per navigation goal when the goal reaches a terminal state (SUCCEEDED, ABORTED, or PREEMPTED).

**Message Format:**
```json
{
  "timestamp": <string>,
  "trip_id": <string>,
  "origin": <string>,
  "destination": <string>,
  "start_time": <string>,
  "end_time": <string>,
  "duration_s": <float>,
  "result": "SUCCEEDED" | "ABORTED" | "PREEMPTED"
}
```

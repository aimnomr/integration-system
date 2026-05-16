# Service Reference: Node-RED

Node-RED validates and routes inbound commands and processes outbound robot data. The
flow lives in `node-red/flows.json` and is organised into **5 tabs**.

Run it with `node-red --settings settings.js --userDir .` (UI at
`http://localhost:1880`). All MQTT nodes use the shared `Local MQTT` broker config
(`localhost:1883`).

---

## Tab 1 — Library Init

Loads shared helper code once at startup.

- **Startup** (inject, `once: true`) → **loadLibrary** (function).
- `loadLibrary` populates `global.lib` with:
  - `validators` — `rawCommand`, `goal`, `waypoints` (throw on invalid input).
  - `transformers` — `goal`, `waypoints`, `cancel` (shape the outgoing payload).
  - `errors.wrap` — wraps an exception into a structured error object.
- Other tabs read `global.get('lib')`; this tab must run first.

## Tab 2 — Command Router

Routes inbound commands. **This is the only tab in the command path.**

```
amr/cmd/raw (mqtt in, QoS 2)
  → validateRaw        (validates envelope; ok → out1, error → out2)
      → Route by command (switch on msg.command)
          → transformGoal    → amr/cmd/goal     (mqtt out, QoS 1)
          → transformWaypoints → amr/cmd/waypoints (mqtt out, QoS 1)
          → transformCancel  → amr/cmd/cancel   (mqtt out, QoS 1)
      → Routing Errors (debug)
```

Validation/transform failures are caught and sent to the **Routing Errors** debug node.
Only `goal`, `waypoints`, and `cancel` are routed here — `waypoints/retry`,
`waypoints/skip`, and `system/*` bypass Node-RED entirely.

## Tab 3 — State Handler

Subscribes to robot state topics, validates them, and shows live status. Each handler
has a `// TODO: INSERT INTO ...` placeholder — **persistence is not implemented yet.**

| MQTT in | Handler | Planned table |
|---|---|---|
| `amr/state/odom` | `handleOdom` | `odom` |
| `amr/state/pose` | `handlePose` | `pose` |
| `amr/state/nav/status` | `handleNavStatus` | `nav_status` |
| `amr/state/nav/progress` | `handleNavProgress` | `nav_progress` |

> Only `amr/state/odom` actually receives data today — the bridge does not publish the
> others yet (see [../status.md](../status.md)).

## Tab 4 — Health Handler

Same pattern for health topics.

| MQTT in | Handler | Planned table |
|---|---|---|
| `amr/health/connection` | `handleConnection` | `health_connection` |
| `amr/health/battery` | `handleBattery` | `health_battery` |
| `amr/health/error` | `handleError` | `health_error` |

## Tab 5 — OEE Handler

| MQTT in | Handler | Planned table |
|---|---|---|
| `amr/oee/cycle` | `handleCycle` | `oee_cycle` |

---

## Known limitation

The State/Health/OEE handlers currently only display node status and write to debug
output. The `INSERT INTO ...` steps to PostgreSQL are not implemented — see
[../schema/DATABASE_SCHEMA.md](../schema/DATABASE_SCHEMA.md) for the target
schema.

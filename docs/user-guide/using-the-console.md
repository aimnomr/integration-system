# Using the Console

> **Who this is for:** operators using the web console day-to-day. For how the
> frontend is built internally, see the
> [frontend service reference](../reference/services/frontend.md).

Open the console at `http://<host>:5173`. The left nav lists every screen;
the top bar shows live health pills (API, database, ROS).

## Dashboard — `/`

The fleet at a glance: one tile per robot showing its connection state
(ONLINE / OFFLINE / CONNECTIONBROKEN), operating mode, current order, when it
was last seen, and which map it's on. Click a tile to open Robot Detail.

Tiles update live from telemetry — no refresh needed. The "last seen" label
ticks up in real time, so a robot that's gone quiet is visible at a glance.

## Robot Detail — `/robots/<serial>`

The live map view for one robot:

- **Map canvas** — the robot's occupancy-grid map with a live robot arrow,
  planned paths, and pins for named locations. The arrow turns **amber** when
  the primary localisation source (AMCL) goes silent and the display falls
  back to odometry — your cue that the shown pose may drift.
- **Side panel tabs** — State (position, velocity, order progress), Errors
  (active robot errors), and Actions.

## Dispatch — `/dispatch`

Send a robot somewhere:

1. Pick a robot.
2. **Named** mode — choose one or more saved locations (the robot visits them
   in order), or **Manual** mode — type x / y / heading directly. Headings are
   in degrees; negative coordinates are fine.
3. Send. The **active order panel** appears and tracks each waypoint live.

While an order runs you have three instant actions:

- **Cancel** — abandon the order.
- **Retry** — re-attempt the current waypoint after a navigation failure.
- **Skip** — give up on the current waypoint and move on to the next.

When the order finishes the buttons grey out — send a new order to re-enable.

## Teleop — `/teleop`

Manual driving with a live camera feed. Safety-gated: you must explicitly
**engage** before the pad sends anything, and it auto-disengages if the robot
connection drops.

Drive with the on-screen 3×3 pad (mouse or touch) or the keyboard
(`QWE` / `ASD` / `ZXC` — forward-left, forward, forward-right, etc.).
Commands send while held and stop when released.

> Teleop talks to the robot **directly** (browser → robot WebSocket), so it
> keeps working even if parts of the backend are down — and it requires the
> robot's rosbridge to be reachable *from your browser*.

## Order History — `/orders`

Every order ever dispatched, newest first. Filter by robot, page through with
"Load older".

## OEE — `/oee`

Productivity metrics derived from completed trips: totals
(succeeded / failed), average trip duration, an availability bar, and a chart
of recent cycle durations.

## Health — `/health`

Six service rows — FastAPI, MQTT (browser and backend), PostgreSQL, the
robots' rosbridge connections, Node-RED — polled every 5 seconds. If the API
itself becomes unreachable the dependent pills go grey ("unknown — API
unreachable") rather than pretending everything is fine.

## Admin — `/admin/*`

CRUD screens for the reference data (all stored in PostgreSQL):

| Screen | Manages |
|---|---|
| **Robots** | The robot roster — serial number, rosbridge URL, map. Robots with history can't be deleted, but can be **archived** (and restored later). Adding a robot needs a ROS Bridge service restart to take effect. |
| **Locations** | Named locations used by Dispatch. Click directly on the embedded map to set the coordinates. |
| **Maps** | The map registry. Deleting a map that's still referenced is refused with a clear conflict message. |
| **Fleet** | Fleet-wide VDA5050 identity (manufacturer, interface name, version). |

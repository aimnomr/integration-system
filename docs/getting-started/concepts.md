# Concepts

> **Who this is for:** beginners. Every domain term used in this project,
> grouped by world and explained in context. Skim now, return when a doc uses
> a word you don't know.

## The robot world (ROS)

**ROS — Robot Operating System.** Not an OS, despite the name: middleware
running *on* the robot that organises its software as small programs (nodes)
exchanging messages over named channels called **topics** (e.g.
`/diff_controller/odom`). Publish/subscribe: a node publishes to a topic,
any number of nodes subscribe.

**rosbridge.** ROS topics are normally only reachable from inside ROS.
`rosbridge_server` exposes them over a plain **WebSocket** (default port
9090), so any program that speaks JSON — a Node.js service, a browser — can
publish and subscribe. This single WebSocket is the *only* connection this
project makes to the robot. (**roslib** is the client library used to talk
to it.)

**move_base.** The standard ROS navigation component. Give it a goal pose and
it plans a path, avoids obstacles, and drives there — reporting back
`SUCCEEDED`, `ABORTED`, etc. Orders in this system ultimately become a series
of `move_base` goals.

**Pose, odometry, AMCL.** A **pose** is position + orientation.
**Odometry** estimates pose from wheel rotation — smooth but drifting over
time. **AMCL** (Adaptive Monte Carlo Localization) corrects that drift by
matching laser scans against a known map, giving a trustworthy *map-frame*
pose. The console's map arrow uses AMCL when available and falls back to
odometry (turning amber) when AMCL goes quiet.

**Occupancy grid.** The robot's map format — a grid of cells marked free,
occupied, or unknown. The console renders it live on a canvas.

**Teleop.** Teleoperation — manually driving the robot by streaming velocity
commands, as opposed to autonomous navigation.

**Waypoint.** One target pose in an ordered navigation sequence.

## The messaging world (MQTT)

**MQTT.** A lightweight publish/subscribe messaging protocol. Clients connect
to a central **broker** and publish messages to named **topics**; the broker
delivers each message to every subscriber of that topic. Senders and
receivers never know about each other — that's the decoupling this
architecture is built on. **Mosquitto** is the broker implementation used
here (plain TCP on `:1883` for services, WebSocket on `:9001` so the browser
can join too).

**QoS — Quality of Service.** MQTT's delivery guarantee per message:
0 = at-most-once (fire and forget), 1 = at-least-once, 2 = exactly-once.

**Retained message.** A message the broker stores and hands immediately to
any *future* subscriber of that topic — how a late-joining dashboard learns a
robot's connection state without waiting for the next update.

**Last-Will (LWT).** A message the broker publishes *on behalf of* a client
that vanishes without disconnecting cleanly. Each robot's bridge registers a
"connection broken" Last-Will, so a crash is announced automatically.

**Heartbeat.** A periodic re-send proving a component is alive even when
nothing changed (robot state re-publishes every 5 s when idle).

## The fleet world (VDA5050)

**VDA5050.** The open industry standard defining how a fleet management
system talks to AGVs/AMRs over MQTT — which topics, which JSON message
shapes. Adopting it (instead of a homemade protocol) is the project's central
design decision. This implementation is a structural subset of VDA5050 2.0.0;
exact message shapes are in
[VDA5050_MESSAGES.md](../schema/VDA5050_MESSAGES.md).

**FMS — Fleet Management System.** The central brain issuing orders and
monitoring the fleet. The FastAPI service plays this role.

**Order.** VDA5050's navigation job: a graph of **nodes** (target positions)
and **edges** (the connections between consecutive nodes). "Send the robot to
A, then B, then C" is one order with three nodes.

**instantActions.** VDA5050's immediate commands that bypass the order graph
— cancel this order, retry the current node, skip it.

**state.** The robot's consolidated telemetry message — position, velocity,
order progress, errors — published on every significant change plus a 5 s
heartbeat.

**connection.** The robot's liveness message: `ONLINE`, `OFFLINE`, or
`CONNECTIONBROKEN`. Published retained, with the broken state wired up as the
MQTT Last-Will.

**serialNumber.** A robot's unique ID, and a segment of every topic the robot
uses: `amr/v2/moverobotic/{serialNumber}/order`, `.../state`, and so on. This
per-robot namespace is what makes the system fleet-capable.

**headerId.** A per-topic, per-robot counter stamped on every VDA5050
message, letting a receiver detect dropped or reordered messages.

## The metrics world

**OEE — Overall Equipment Effectiveness.** A standard industrial productivity
metric (availability × performance × quality). Here, the system derives one
**cycle** (or trip) per completed navigation order and aggregates durations,
success/failure counts, and availability from them.

## The application world

**FastAPI** — the Python web framework behind the REST API. **PostgreSQL** —
the relational database persisting telemetry, history, and the fleet
definition. **Node-RED** — a flow-based programming tool, used here purely as
a live message viewer and DB admin utility. **Vite / React / TypeScript** —
the frontend toolchain; **MUI** and **Tailwind CSS** style it; **TanStack
Query** caches the REST data. **Newman** — the CLI runner for the Postman
HTTP smoke-test collection. **MapCanvas** — the project's custom live-map
React component.

---

Next: see these pieces working together in the
[Architecture tour](architecture-tour.md).

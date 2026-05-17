# Glossary

Domain terms used across this project.

| Term | Meaning |
|---|---|
| **AMR** | Autonomous Mobile Robot — a robot that navigates without fixed guide paths, using onboard sensing and mapping. |
| **AGV** | Automated Guided Vehicle — older term; in VDA5050 used interchangeably for the controlled vehicle. |
| **ROS** | Robot Operating System — the middleware running *on* the robot; organises software as nodes communicating over named topics. |
| **ROS topic** | A named publish/subscribe channel inside ROS (e.g. `/diff_controller/odom`). |
| **rosbridge** | A ROS package (`rosbridge_server`) that exposes ROS topics over a WebSocket, so non-ROS programs can talk to ROS. |
| **roslib** | The client library used to talk to rosbridge over WebSocket. The ROS Bridge Service uses `roslib` for Node.js. |
| **move_base** | The ROS navigation component that drives the robot to a goal pose, handling path planning and obstacle avoidance. |
| **AMCL** | Adaptive Monte Carlo Localization — the ROS algorithm that tracks the robot's pose *on a known map* using laser scans, correcting odometry drift. |
| **Odometry** | Position estimated from wheel rotation since startup. Relative to the start point and **drifts** over time. ROS topic: `/diff_controller/odom`. |
| **Pose** | Position + orientation. A *map-frame* pose is the robot's location on the map; an *odom-frame* pose is relative to startup. |
| **tf / transform tree** | ROS's tree of coordinate-frame relationships (e.g. `map → odom → base_link`). The map-frame pose is derived from it. |
| **Waypoint** | One target pose in an ordered navigation sequence. |
| **Teleop** | Teleoperation — direct manual driving of the robot (velocity commands), as opposed to autonomous navigation. |
| **MQTT** | Lightweight publish/subscribe messaging protocol; the project's central backbone. |
| **Mosquitto** | The MQTT broker implementation used here. |
| **QoS** | Quality of Service — MQTT delivery guarantee: `0` at-most-once, `1` at-least-once, `2` exactly-once. |
| **Retained message** | An MQTT message the broker stores and delivers immediately to any new subscriber of that topic. |
| **Last-Will (LWT)** | A message the broker publishes automatically if a client disconnects ungracefully. |
| **Node-RED** | A flow-based tool used here to validate and route MQTT messages. |
| **FastAPI** | The Python web framework providing the project's REST API. |
| **Heartbeat** | A periodic message sent to prove a component is alive even when nothing else changed (e.g. odometry every 5 s when stationary). |
| **OEE** | Overall Equipment Effectiveness — a productivity metric, `Availability × Performance × Quality`. |
| **Trip / cycle** | One completed navigation job (origin → destination), the unit of OEE measurement. |
| **VDA5050** | Open standard defining the MQTT interface between a fleet manager and AGVs/AMRs. See [plans/vda5050-migration.md](plans/vda5050-migration.md). |
| **FMS** | Fleet Management System — the central system that issues orders to and monitors a fleet of robots (VDA5050 term). |
| **Order** | In VDA5050, a navigation job expressed as a graph of nodes and edges. |
| **Node / Edge** | In a VDA5050 order, a node is a target position; an edge connects two consecutive nodes. Each carries a `sequenceId` (nodes even, edges odd). |
| **instantActions** | In VDA5050, immediate commands not tied to an order (e.g. cancel). |
| **state (message)** | The VDA5050 telemetry message — one consolidated snapshot of a robot's position, motion, order progress, errors and safety state. |
| **connection (message)** | The VDA5050 liveness message — `ONLINE` / `OFFLINE` / `CONNECTIONBROKEN`; published retained, the broken state set as the MQTT Last-Will. |
| **headerId** | A counter on every VDA5050 message, incrementing per topic per robot — lets a receiver detect dropped or reordered messages. |
| **serialNumber** | The unique identifier of one robot; a segment of every VDA5050 topic (`amr/v2/moverobotic/{serialNumber}/...`). |

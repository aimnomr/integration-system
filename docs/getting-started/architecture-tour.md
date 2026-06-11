# Architecture Tour

> **Who this is for:** beginners who know the [concepts](concepts.md) and want
> to see how the pieces fit. We follow two journeys end to end: one command
> *into* the robot, one telemetry message *out of* it. The terse, complete
> version of this page is the [architecture reference](../reference/architecture.md).

## The cast

```
        ┌─────────────┐   REST    ┌─────────────┐
        │   Browser   │──────────▶│   FastAPI   │────────┐
        │  (console)  │           │ (FMS gateway)│        │ SQL
        └──┬───────┬──┘           └──────┬──────┘   ┌────▼─────┐
           │       │                     │ MQTT     │ Postgres │
           │       │ MQTT-over-WS  ┌─────▼─────┐    └──────────┘
           │       └──────────────▶│ Mosquitto │◀──────────┐
           │                       │  (broker) │           │ MQTT
           │                       └─────┬─────┘    ┌──────┴──────┐
           │                             └─────────▶│  ROS Bridge │
           │            rosbridge WebSocket         │   service   │
           └───────────────────────────────────────┐└──────┬──────┘
                                                   ▼       ▼ rosbridge WS
                                                ┌─────────────┐
                                                │  ROS robot  │
                                                └─────────────┘
```

Six players: the browser console, FastAPI, Mosquitto (the broker), the ROS
Bridge service, PostgreSQL, and the robot itself. (Node-RED also subscribes
to watch the traffic, but nothing depends on it.)

## Journey 1 — an order, inbound

You click **Send** on the Dispatch screen, targeting two named locations.

1. **Browser → FastAPI (REST).** The console POSTs to
   `/robots/amr001/order/named`. FastAPI looks the locations up in
   PostgreSQL, resolves them to coordinates, and builds a **VDA5050 order** —
   a JSON message with two nodes and one edge, stamped with a fresh `orderId`
   and `headerId`.

2. **FastAPI → Mosquitto (MQTT).** FastAPI publishes the order to the robot's
   own topic: `amr/v2/moverobotic/amr001/order`. Its job is done — it doesn't
   know or care who's listening. (It does keep a copy: its own subscriber
   will write the order to the database for history. More in Journey 2.)

3. **Mosquitto → ROS Bridge.** The ROS Bridge service runs one `Robot`
   instance per robot in the fleet, each subscribed to its own `order` topic.
   `amr001`'s instance receives the order and hands it to its
   **OrderStateMachine**.

4. **ROS Bridge → robot (rosbridge WebSocket).** The state machine sends the
   *first* node as a `move_base` goal over the robot's rosbridge WebSocket —
   then waits. When `move_base` reports `SUCCEEDED`, it sends the next node.
   That wait-then-advance loop is the heart of multi-waypoint navigation. A
   failure (`ABORTED`) pauses the loop and surfaces an error — which is what
   the console's **Retry** / **Skip** buttons resolve, arriving as VDA5050
   `instantActions` along the same path the order took.

The robot drives to location one, then location two.

## Journey 2 — telemetry, outbound

While driving, the robot's ROS topics chatter constantly: odometry, AMCL
pose, `move_base` status.

1. **Robot → ROS Bridge.** `amr001`'s `Robot` instance subscribes to those
   ROS topics over the same rosbridge WebSocket. Its **StateBuilder**
   condenses them into one VDA5050 **state** message — position, velocity,
   order progress, errors.

2. **ROS Bridge → Mosquitto.** The state is published to
   `amr/v2/moverobotic/amr001/state` — on every significant change (moved
   >5 cm, turned >5°, order progressed) plus a 5-second heartbeat. Alongside
   it lives the retained **connection** message (`ONLINE`), with
   `CONNECTIONBROKEN` registered as the Last-Will so the broker announces a
   crash automatically.

3. **Mosquitto → two subscribers, in parallel:**
   - **The browser** (over the WebSocket listener `:9001`) updates the
     dashboard tile and the order panel live. No polling, no backend in the
     loop.
   - **FastAPI** persists every message to PostgreSQL — state snapshots,
     connection events, the command audit, and derived **OEE cycles** (one
     per completed order). This is what makes Order History and the OEE page
     possible.

## The third lane: browser ↔ robot, direct

Look back at the diagram: the browser also holds its **own** rosbridge
WebSocket straight to the robot. High-frequency, high-volume data — the live
map, the camera stream, teleop velocity commands — flows on this direct lane
and never touches MQTT or the backend.

The browser therefore has **three independent lanes**: REST (commands, cold
reads), MQTT-over-WS (live VDA5050 telemetry), and rosbridge (map/camera/
teleop). Losing one degrades only its own features — with the whole backend
down you can *still* teleoperate, because the browser↔robot lane doesn't
need it. The [failure matrix](../reference/failure-matrix.md) plays this game
for every component.

## Why the database matters more than it looks

PostgreSQL isn't just history. The **fleet definition itself** — which robots
exist, their rosbridge URLs, the fleet's VDA5050 identity — lives in the
database as the single source of truth. FastAPI loads it at startup; the ROS
Bridge fetches it from FastAPI (`GET /fleet`) at startup. Adding a robot is a
database row, not a code change.

This dictates the **start order**: PostgreSQL → FastAPI → ROS Bridge.
(Mosquitto anytime before; the frontend and Node-RED anytime at all.)

## Where to look next

- Run it: [Quickstart](../user-guide/quickstart.md) (Docker) or
  [Running locally](running-locally.md) (manual).
- Exact message shapes and topics: [`docs/schema/`](../schema/) — the
  contracts.
- Per-service internals: [reference/services/](../reference/services/).

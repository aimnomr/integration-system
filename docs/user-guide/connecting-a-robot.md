# Connecting a Robot

> **Who this is for:** users wiring the running stack to a real ROS robot or a
> simulator. For the exact ROS topics consumed and published, see the
> [ROS topics contract](../schema/ROS_TOPICS.md).

## What the robot must provide

The system talks to the robot through **`rosbridge_server`** — a standard ROS
package that exposes ROS topics over a WebSocket (default port **9090**). The
robot (or simulator) must be running:

- `rosbridge_server` — the WebSocket entry point.
- `move_base` — for autonomous navigation (orders).
- AMCL localisation on a known map — for live position.
- *(Optional)* a camera publishing compressed images — for the Teleop screen.

Two independent things connect to that one WebSocket:

1. **The ROS Bridge service** (backend) — sends navigation goals, reads
   odometry/pose/results, publishes VDA5050 telemetry.
2. **Your browser** (frontend) — streams the map, camera, and teleop directly.

So the robot's rosbridge must be reachable from **both** the backend and the
operator's browser.

## Where the address lives

Each robot's rosbridge URL is stored in the database — the `robots` table —
and editable in the console under **Admin → Robots** (`rosbridge_url`, e.g.
`ws://192.168.1.77:9090`). The seed value for the demo robot is
`ws://localhost:9090`.

After changing a robot's URL (or adding a robot), **restart the ROS Bridge
service** so it picks up the new fleet definition:

```bash
docker compose restart ros-bridge
```

## The three placement scenarios

### 1. Robot/sim on a separate machine (the normal case)

Set the robot's `rosbridge_url` to its real address, e.g.
`ws://192.168.1.77:9090`. Leave `ROSBRIDGE_HOST_OVERRIDE` **blank** in `.env`.
Both the backend container and the browser reach the same address. Done.

### 2. Robot/sim on the same machine as the Docker stack

A subtlety: the seeded URL `ws://localhost:9090` is correct for your
*browser*, but inside the ROS Bridge **container**, `localhost` means the
container itself — so the backend can never connect.

Fix: in `.env`, set

```
ROSBRIDGE_HOST_OVERRIDE=host.docker.internal
```

(the default `.env.example` ships this). The ROS Bridge container then
rewrites any *loopback* rosbridge host to `host.docker.internal` for itself
only — the browser still uses `localhost`. Real hostnames/IPs are never
rewritten.

### 3. Everything manual (no Docker)

`ws://localhost:9090` works as-is for both browser and backend. See
[Running locally](../getting-started/running-locally.md).

## Verifying the connection

1. **Backend:** `docker compose logs -f ros-bridge` — you should see a
   rosbridge connection log per robot, then VDA5050 `state` publishing.
2. **Console:** the Dashboard tile flips to **ONLINE**, and the Health page's
   rosbridge row goes green.
3. **End to end:** dispatch an order from `/dispatch` — the robot drives, the
   active-order panel ticks through the waypoints.

If the robot stays offline, work through
[Troubleshooting → Robot won't connect](troubleshooting.md#robot-shows-offline--orders-dont-move-the-robot).

## Adding more robots

The system is fleet-capable; one robot vs. many is purely configuration:

1. **Admin → Robots → Add** — serial number, rosbridge URL, map.
2. Restart the ROS Bridge service.

Each robot gets its own VDA5050 topic namespace, its own connection
monitoring, and its own tile on the Dashboard. No code changes.

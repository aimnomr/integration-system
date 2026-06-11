# Troubleshooting

> **Who this is for:** anyone whose running stack is misbehaving. Work from
> symptom to fix. For *what is expected to break* when a service is down, see
> the [failure matrix](../reference/failure-matrix.md).

## First move: check Health

Open **Health** in the console (`/health`), or run `docker compose ps` and
`docker compose logs -f <service>`. Most symptoms below map to one red row.

---

## The frontend shows a blank page

**Symptom:** `http://<host>:5173` loads but renders nothing (background only).

**Cause:** the browser is running a stale or broken frontend bundle.

**Fix:** rebuild the frontend image and hard-refresh the browser
(Ctrl+Shift+R):

```bash
docker compose build frontend && docker compose up -d frontend
```

If it persists, open the browser dev console (F12) — an import-time JS error
means the image needs rebuilding from current source.

## Console unreachable from a phone / another PC

**Symptom:** works on `localhost`, but other devices can't load it — or the
page loads and every API call fails.

**Cause:** the frontend was built with `PUBLIC_HOST=localhost`, so the
JavaScript in *their* browser calls `localhost:8000` — which is their own
device.

**Fix:** set `PUBLIC_HOST` to this machine's LAN IP in `.env`, then rebuild
the frontend (build-time setting):

```bash
docker compose up --build -d frontend
```

See [Configuration](configuration.md).

## Robot shows OFFLINE / orders don't move the robot

**Symptom:** Dashboard tile stuck OFFLINE (or status stuck "idle"); orders are
accepted but nothing drives.

**Check 1 — is rosbridge actually listening?** On the robot/sim machine,
confirm `rosbridge_server` is up on port 9090 and reachable over the network.

**Check 2 — can the *container* reach it?** If the robot/sim runs on the same
machine as Docker, the seeded `ws://localhost:9090` points at the container
itself. Set `ROSBRIDGE_HOST_OVERRIDE=host.docker.internal` in `.env` and
restart: `docker compose up -d ros-bridge`. If the robot is a separate
machine, instead set its real IP in **Admin → Robots** and leave the override
blank. Full explanation in [Connecting a robot](connecting-a-robot.md).

**Check 3 — logs.** `docker compose logs -f ros-bridge` should show
`rosbridge connected` per robot. A `Starting robot ... ws://localhost:9090`
line that never progresses is Check 2.

> A robot that can't be reached no longer crashes the ROS Bridge — orders are
> recorded and the robot simply doesn't move until rosbridge connects.

## Teleop pad doesn't move the robot

Teleop is browser → robot **direct**, so the backend being healthy proves
nothing here.

1. The camera/map on the same screen must be live — if they're dead, your
   *browser* can't reach the robot's rosbridge (URL in Admin → Robots; the
   browser needs a real IP, not `host.docker.internal`).
2. You must **engage** first; the pad auto-disengages on connection drop.
3. If the connection is live but the robot ignores commands, confirm the
   robot subscribes the teleop velocity topic listed in the
   [ROS topics contract](../schema/ROS_TOPICS.md).

## Health shows database red / history and admin screens fail

**Symptom:** 503s on history/OEE/admin; live map and telemetry still fine.

**Cause:** PostgreSQL is down or restarting. Live monitoring intentionally
survives this (it doesn't touch the DB), but anything persisted breaks.

**Fix:** `docker compose up -d postgres`, then check `docker compose ps` for
`healthy`. The API recovers on its own — but if you need to restart FastAPI
or the ROS Bridge while Postgres is down, they will fail to boot (they load
the fleet definition at startup). Start order: Postgres → FastAPI → ROS Bridge.

## Everything is red / nothing updates live

**Cause:** Mosquitto (the MQTT broker) is down — it's the spine of the system.

**Fix:** `docker compose up -d mosquitto`. All services reconnect
automatically; retained connection messages re-deliver on their own.

## REST calls return 401

`API_KEY` is set, and the caller didn't send a matching `X-API-Key` header.
Either send the header or clear `API_KEY` in `.env` (open API) and
`docker compose up --build -d` (the frontend bakes the key at build time).

## REST calls return 429

The per-IP rate limiter (default 120 requests/min) kicked in. Raise
`RATE_LIMIT_PER_MINUTE` in `.env` (or `0` to disable) and restart FastAPI.

## Database wiped / want a clean slate

```bash
docker compose down -v        # removes containers AND the Postgres volume
docker compose up --build -d  # next start re-creates + re-seeds the schema
```

The schema and seed live in [`docs/schema/schema.sql`](../schema/schema.sql),
applied automatically the first time the Postgres volume is empty.

## Known limitations (not bugs)

- **Connection pill stays ONLINE when only the sim stops.** The ONLINE signal
  is published by the ROS Bridge on the robot's behalf; it flips only when the
  bridge↔rosbridge link breaks, not when the simulation behind rosbridge
  halts. Robot errors will still surface in the Errors tab.
- **No MQTT auth/TLS.** The broker is anonymous on both listeners — LAN-grade
  security only (see [Configuration → Security notes](configuration.md#security-notes)).
- **Telemetry during an outage is not replayed.** If FastAPI or Postgres is
  down, telemetry from that window is simply not recorded (no
  store-and-forward buffer).
- **One camera.** Teleop shows the robot's front camera topic only.

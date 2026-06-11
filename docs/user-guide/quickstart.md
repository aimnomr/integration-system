# Quickstart

> **Who this is for:** anyone who wants the system running as-is, with Docker.
> No code reading, no per-service installs.
> New to the project? [Introduction](../getting-started/introduction.md) explains
> what you're about to run. Developing on the code? Use
> [Running locally](../getting-started/running-locally.md) instead.

## Prerequisites

- **Docker** with Compose (Docker Desktop on Windows/macOS, `docker` + compose
  plugin on Linux). That's it — Postgres, Mosquitto, Python, and Node all run
  in containers.
- *(Optional)* A ROS robot or simulator exposing `rosbridge_server` on a
  WebSocket (default port 9090). Without one, everything still runs — robots
  just show as offline and orders won't produce motion. See
  [Connecting a robot](connecting-a-robot.md).

## Run it

From the repository root:

```bash
cp .env.example .env            # optional — defaults work for same-machine use
docker compose up --build -d
```

The first build takes a few minutes. Then check:

```bash
docker compose ps               # all services should be running / healthy
```

Open:

| URL | What you get |
|---|---|
| `http://localhost:5173` | **The operator console** — start here |
| `http://localhost:8000/docs` | FastAPI Swagger UI (the REST API) |
| `http://localhost:1880` | Node-RED (optional dev/admin tool) |

The database is created and seeded automatically on the first run (one demo
robot, `amr001`, plus a map and named locations).

## Try it

1. Open `http://localhost:5173` — the **Dashboard** shows the fleet (one tile,
   `amr001`).
2. Open **Health** in the left nav — FastAPI, MQTT, and PostgreSQL rows should
   be green. The rosbridge row is red until a robot is connected.
3. Open **Dispatch**, pick the robot, choose a named location or enter
   coordinates, and send an order. With a robot connected it drives; without
   one, the order is accepted and recorded but no motion happens.

## Stop / reset

```bash
docker compose down             # stop and remove containers (data kept)
docker compose down -v          # ...and wipe the database (re-seeds next run)
```

## Next steps

- Phones or other PCs can't reach it? You need to set `PUBLIC_HOST` —
  see [Configuration](configuration.md).
- Connect a real robot or simulator — see [Connecting a robot](connecting-a-robot.md).
- Learn the screens — see [Using the console](using-the-console.md).
- Something not working? — see [Troubleshooting](troubleshooting.md).

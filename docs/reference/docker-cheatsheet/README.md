# Docker Cheatsheet

Commonly used Docker commands for this project, organised from development
through to deployment. Each category is its own page.

| Category | What it covers |
|---|---|
| [compose.md](compose.md) | `docker compose` — the day-to-day way to run this stack |
| [images.md](images.md) | Build, tag, inspect, and manage images |
| [containers.md](containers.md) | Run, exec, logs, stop, and remove containers |
| [volumes-networks.md](volumes-networks.md) | Persistent data and container networking |
| [debugging.md](debugging.md) | Inspecting, troubleshooting, and healthchecks |
| [cleanup.md](cleanup.md) | Reclaiming disk, pruning stale resources |
| [deployment.md](deployment.md) | Registries, prod builds, and shipping the stack |

## This project at a glance

The stack is defined in the root `docker-compose.yml` (services: `postgres`,
`mosquitto`, `fastapi`, `ros-bridge`, `node-red`, `frontend`). The fastest way
to run everything:

```bash
docker compose up --build          # build + start the whole stack
docker compose up --build -d       # ...detached (background)
docker compose ps                  # health / status
docker compose down                # stop and remove
docker compose down -v             # ...and wipe the Postgres volume to re-seed
```

Ports once up: FastAPI `:8000`, Node-RED `:1880`, frontend `:5173`,
Mosquitto `:1883`/`:9001`, Postgres `:5432`. See the
[Quickstart](../../user-guide/quickstart.md) for the full run guide.

> **Compose v2 syntax** — these pages use `docker compose` (space, the modern
> plugin). Older installs use the hyphenated `docker-compose`; the subcommands
> are otherwise identical.

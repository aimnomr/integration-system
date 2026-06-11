# Configuration

> **Who this is for:** users running the Docker stack who need to change where
> it's reachable from, secure it, or deploy it to another device.
> For the per-service env vars used in manual (non-Docker) runs, see
> [Running locally](../getting-started/running-locally.md).

All per-device settings live in a single **`.env`** file next to
`docker-compose.yml` (auto-loaded by Compose). Every value has a default baked
into the compose file, so the stack runs **with no `.env` at all** — the file
only *overrides* defaults. The committed template is **`.env.example`**; your
real `.env` is git-ignored.

## The values you actually change

| Variable | Set it to | Notes |
|---|---|---|
| `PUBLIC_HOST` | the machine's **LAN IP** (e.g. `192.168.1.50`) if phones / other PCs will use the console; `localhost` if only this machine's browser | **Baked into the frontend at build time** — after changing it, run `docker compose up --build -d frontend`. Also feeds the backend's allowed CORS origins. |
| `POSTGRES_PASSWORD` | a real password | Only applies on a fresh database volume (`docker compose down -v` first). |
| `API_KEY` | a secret string to require an `X-API-Key` header on the REST API; blank = open | Picked up by FastAPI, the frontend, and the ROS Bridge together. |
| `ROSBRIDGE_HOST_OVERRIDE` | `host.docker.internal` if the robot/sim runs **on this same machine**; **blank** if the robot is a separate device (then set its real IP in the robot registry) | Lets the ROS Bridge *container* reach a robot on the host. See [Connecting a robot](connecting-a-robot.md). |

Other available overrides (ports, DB name/user, rate limit) are listed with
comments in `.env.example`.

## Why `PUBLIC_HOST` needs a rebuild

The frontend is static JavaScript served to the browser, and Vite inlines its
`VITE_*` settings into that JavaScript **at build time**. The API and MQTT
addresses are therefore frozen into the frontend image when it's built.
Backend services read their env at *runtime*, so for them a plain
`docker compose up -d` (restart, no rebuild) is enough.

Rule of thumb:

- Changed `PUBLIC_HOST` (or `API_KEY` that the browser must send)?
  → `docker compose up --build -d frontend`
- Changed anything else? → `docker compose up -d`

## Deploying to another device

Build-from-repo (simplest):

```bash
# on the target machine
git clone <repo>   # or copy the folder
cd integration-system
cp .env.example .env       # edit: PUBLIC_HOST = this machine's LAN IP, etc.
docker compose up --build -d
```

Alternatives for offline or fleet-style targets — image tarballs
(`docker save` / `docker load`) or a registry push + `docker compose pull` —
are covered in the [Docker cheatsheet](../reference/docker-cheatsheet/deployment.md).
In every case the **frontend image is the one piece that must be (re)built
with the target's `PUBLIC_HOST`**.

## Security notes

- With `API_KEY` unset the REST API is open — fine on a trusted LAN, not
  beyond it.
- The MQTT broker accepts anonymous connections on both listeners (`:1883`
  TCP, `:9001` WebSocket) and has no TLS. Suitable for a lab/LAN deployment;
  add Mosquitto auth + TLS before any wider exposure.

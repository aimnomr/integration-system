# Debugging & Troubleshooting

When a container won't start, a service can't connect, or you need to see what's
happening inside.

## First look

```bash
docker compose ps                  # which services are up / healthy / exited
docker compose logs -f fastapi     # follow one service's logs
docker compose logs --tail=200     # recent logs, all services
docker stats                       # live CPU / mem / IO
docker events                      # stream daemon events (starts, dies, OOM)
```

## Get inside a container

```bash
docker compose exec fastapi sh          # shell into a running service
docker compose exec postgres psql -U postgres -d amr_integration

# Container exits immediately? Override the entrypoint to poke around:
docker run -it --entrypoint sh amr-fastapi
docker compose run --rm --entrypoint sh fastapi
```

## Inspect state

```bash
docker inspect <container>                                   # full JSON
docker inspect <container> --format '{{.State.Status}}'     # running/exited
docker inspect <container> --format '{{.State.ExitCode}}'   # why it exited
docker inspect <container> --format '{{json .State.Health}}'  # healthcheck log
docker top <container>                                       # processes inside
docker diff <container>                                      # filesystem changes
docker port <container>                                      # port mappings
```

## Healthchecks

This project's services declare healthchecks (FastAPI hits `/openapi.json`,
Postgres uses `pg_isready`, etc.) and `depends_on: condition: service_healthy`.

```bash
docker compose ps                  # STATUS column shows (healthy)/(starting)
docker inspect <container> --format '{{json .State.Health}}' | jq
# A service stuck "starting" usually means its healthcheck never passes —
# check that the command/port inside the container is correct.
```

## Networking checks

```bash
# Can fastapi resolve and reach postgres on the compose network?
docker compose exec fastapi sh -c "getent hosts postgres"
docker compose exec fastapi sh -c "nc -zv mosquitto 1883"   # if nc is present
docker network inspect integration-system_default           # who's attached
```

## Common gotchas

- **`localhost` inside a container is the container itself**, not the host or
  another service. Use the service name (`postgres`, `mosquitto`).
- **`Connection refused` at startup** often means start order — but compose
  handles that here via healthchecks. If you run a service standalone, start its
  dependencies first.
- **Stale image after a code change** — rebuild: `docker compose up --build`.
- **Frontend shows old API URL** — `VITE_*` is baked at build time; rebuild with
  `--build-arg`, a restart won't pick it up.
- **DB schema didn't seed** — `schema.sql` only runs on an *empty* volume.
  `docker compose down -v` then `up` to force a re-seed.

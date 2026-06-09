# Docker Compose

The primary way to run this project. Run these from the repo root (where
`docker-compose.yml` lives).

## Lifecycle

```bash
docker compose up                  # start (foreground, streams logs)
docker compose up -d               # start detached (background)
docker compose up --build          # rebuild images first, then start
docker compose up -d --build       # rebuild + detached
docker compose up -d fastapi       # start one service (and its dependencies)

docker compose stop                # stop containers, keep them
docker compose start               # start stopped containers
docker compose restart fastapi     # restart one service

docker compose down                # stop + remove containers and network
docker compose down -v             # ...also remove named volumes (wipes the DB)
docker compose down --rmi local    # ...also remove images built by compose
```

## Building

```bash
docker compose build               # build all services with a build context
docker compose build fastapi       # build one service
docker compose build --no-cache    # ignore the layer cache (clean build)
docker compose build --pull        # pull newer base images first

# Pass build args (e.g. point the frontend bundle at other endpoints)
docker compose build --build-arg VITE_API_URL=https://api.example.com frontend
```

## Status, logs, exec

```bash
docker compose ps                  # services + health + published ports
docker compose ps -a               # include stopped

docker compose logs                # all services
docker compose logs -f             # follow (live tail)
docker compose logs -f fastapi     # follow one service
docker compose logs --tail=100 ros-bridge

docker compose exec fastapi sh         # shell into a running service
docker compose exec postgres psql -U postgres -d amr_integration
docker compose run --rm fastapi pytest # one-off command in a fresh container
```

## Config & validation

```bash
docker compose config              # render the merged, resolved config
docker compose config --quiet      # validate only (exit non-zero on error)
docker compose config --services   # list service names
docker compose images              # images used by the stack
docker compose top                 # running processes per service
```

## Project-specific notes

- **Start order is enforced** by `depends_on` + healthchecks
  (`postgres → fastapi → ros-bridge`). You don't need to sequence `up` yourself.
- **First-run DB seed**: Postgres applies `docs/schema/schema.sql` only when its
  data volume is empty. To re-seed, `docker compose down -v` then `up` again.
- **Frontend env is baked at build time** (Vite inlines `VITE_*`). Changing an
  endpoint means a rebuild with `--build-arg`, not just a restart.

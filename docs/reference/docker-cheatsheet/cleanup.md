# Cleanup & Disk

Docker accumulates stopped containers, dangling images, and build cache. These
commands reclaim space.

## See what's using disk

```bash
docker system df                   # summary: images, containers, volumes, cache
docker system df -v                # verbose, per-item breakdown
```

## Targeted prune

```bash
docker container prune             # remove all stopped containers
docker image prune                 # remove dangling (untagged) images
docker image prune -a              # remove all images not used by a container
docker volume prune                # remove unused volumes (DATA LOSS — careful)
docker network prune               # remove unused networks
docker builder prune               # clear the build cache
docker builder prune -a            # clear all build cache
```

## One-shot full clean

```bash
docker system prune                # stopped containers + dangling images +
                                   # unused networks + dangling build cache
docker system prune -a             # ...also images not used by any container
docker system prune -a --volumes   # ...AND unused volumes (nukes data — careful)
```

## Filters

```bash
docker image prune -a --filter "until=24h"      # only older than 24h
docker container prune --filter "label=stage=test"
```

## For this project

```bash
docker compose down                # remove this stack's containers + network
docker compose down -v             # ...and its named volumes (re-seeds the DB next up)
docker compose down --rmi local    # ...and images compose built (fastapi/ros-bridge/frontend)
```

> ⚠️ `--volumes` / `down -v` deletes `postgres-data` — the database is gone and
> re-seeds from `schema.sql` on the next `up`. Take a `pg_dump` first if you
> need the data.

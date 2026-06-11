# Containers

Running and managing individual containers. For this project the stack runs via
[compose.md](compose.md), but these are essential for one-off runs and poking at
a single service.

## Run

```bash
docker run amr-fastapi                      # run in the foreground
docker run -d amr-fastapi                   # detached
docker run --rm amr-fastapi                 # auto-remove on exit
docker run -d --name api amr-fastapi        # give it a name
docker run -p 8000:8000 amr-fastapi         # publish a port (host:container)
docker run -e DB_HOST=db amr-fastapi        # set an env var
docker run --env-file fastapi-service/.env amr-fastapi
docker run -v "$PWD/data:/data" amr-fastapi # bind-mount a host dir
docker run -it node:22-alpine sh            # interactive shell in a fresh container
```

## List & status

```bash
docker ps                          # running containers
docker ps -a                       # include stopped
docker ps -q                       # IDs only (handy for scripting)
docker stats                       # live CPU / memory / IO per container
docker port api                    # show published ports for a container
```

## Logs & exec

```bash
docker logs api                    # container logs
docker logs -f api                 # follow
docker logs --tail=100 --timestamps api

docker exec -it api sh             # shell into a running container
docker exec api env                # run a command inside it
docker cp api:/app/log.txt ./      # copy a file out of a container
docker cp ./seed.sql api:/tmp/     # copy a file in
```

## Stop, start, remove

```bash
docker stop api                    # graceful stop (SIGTERM, then SIGKILL)
docker start api
docker restart api
docker kill api                    # immediate SIGKILL

docker rm api                      # remove a stopped container
docker rm -f api                   # force-remove a running one
docker container prune             # remove all stopped containers
```

## Inspect

```bash
docker inspect api                 # full container metadata (JSON)
docker inspect api --format '{{.State.Health.Status}}'   # healthcheck state
docker inspect api --format '{{.NetworkSettings.IPAddress}}'
docker diff api                    # filesystem changes vs the image
```

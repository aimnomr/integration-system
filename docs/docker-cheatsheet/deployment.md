# Deployment

Shipping the stack beyond your dev machine — registries, production builds, and
running compose on a server.

## Registry: login, push, pull

```bash
docker login registry.example.com               # authenticate (Docker Hub: docker login)

# Tag for a registry, then push
docker tag amr-fastapi registry.example.com/amr/fastapi:1.0
docker push registry.example.com/amr/fastapi:1.0

docker pull registry.example.com/amr/fastapi:1.0
docker logout registry.example.com
```

Push every image compose builds in one go (after tagging them under your
registry, or by setting `image:` keys in the compose file):

```bash
docker compose build
docker compose push
docker compose pull                # on the target host
```

## Production build tips

```bash
# Always pin and tag deliberately — avoid relying on :latest in prod
docker build --pull -t registry.example.com/amr/fastapi:1.0 ./fastapi-service

# Multi-arch (e.g. build on x86 for an ARM server) with buildx
docker buildx build --platform linux/amd64,linux/arm64 \
  -t registry.example.com/amr/fastapi:1.0 --push ./fastapi-service
```

- Build with the **production endpoints baked into the frontend**:
  `docker compose build --build-arg VITE_API_URL=https://api.example.com \
  --build-arg VITE_MQTT_WS_URL=wss://mqtt.example.com frontend`.
- Don't ship secrets in the image. Pass them at runtime via `--env-file` or the
  orchestrator's secret store. Set FastAPI's `API_KEY` / DB password there.

## Running compose on a server

```bash
docker compose pull                          # fetch the tagged images
docker compose up -d                         # start detached
docker compose up -d --no-build              # don't rebuild, use pulled images

# Roll out a new version (pull, then recreate only what changed)
docker compose pull && docker compose up -d

docker compose logs -f                        # watch it come up
docker compose ps                             # confirm healthy
```

### Restart policies

Keep services alive across crashes and host reboots. Add to each service in
`docker-compose.yml`:

```yaml
services:
  fastapi:
    restart: unless-stopped     # or: always | on-failure
```

Or on a plain `docker run`:

```bash
docker run -d --restart unless-stopped amr-fastapi
docker update --restart=always api            # change policy on a live container
```

## Production checklist

- [ ] Images tagged with explicit versions (not just `latest`) and pushed to a
      registry.
- [ ] Secrets injected at runtime (`--env-file` / secret store), never baked in.
- [ ] Frontend built against the real public API / MQTT URLs (`--build-arg`).
- [ ] `restart:` policy set so services recover from crashes and reboots.
- [ ] Persistent volumes backed up (`pg_dump` for Postgres) and a restore tested.
- [ ] Healthchecks green in `docker compose ps` before sending traffic.
- [ ] Resource limits considered (`deploy.resources` / `--memory`, `--cpus`).
- [ ] The robot's `rosbridge_server` is reachable from the `ros-bridge`
      container's network.

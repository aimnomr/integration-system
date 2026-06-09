# Images

Building, tagging, and managing images. For the multi-service stack you'll
usually go through [compose.md](compose.md); these are the lower-level commands.

## Build

```bash
docker build -t amr-fastapi ./fastapi-service       # build + tag from a context
docker build -t amr-fastapi:1.0 .                   # tag a specific version
docker build --no-cache -t amr-fastapi ./fastapi-service
docker build --pull -t amr-fastapi ./fastapi-service   # refresh the base image

# Build args (the frontend bakes VITE_* at build time)
docker build \
  --build-arg VITE_API_URL=https://api.example.com \
  --build-arg VITE_MQTT_WS_URL=wss://mqtt.example.com \
  -t amr-frontend ./frontend

# Target a specific stage of a multi-stage Dockerfile
docker build --target builder -t amr-frontend-build ./frontend
```

## List & inspect

```bash
docker images                      # list images
docker images -a                   # include intermediate layers
docker image inspect amr-fastapi   # full metadata (JSON)
docker history amr-fastapi         # layer-by-layer size breakdown
docker image inspect amr-fastapi --format '{{.Size}}'
```

## Tag & rename

```bash
docker tag amr-fastapi registry.example.com/amr-fastapi:1.0
docker tag amr-fastapi amr-fastapi:latest
```

## Remove

```bash
docker rmi amr-fastapi             # remove an image
docker rmi -f amr-fastapi          # force (even if a container references it)
docker image prune                 # remove dangling (untagged) images
docker image prune -a              # remove all images not used by a container
```

## Keeping images lean (what this project does)

- **Pick the smallest viable base.** ROS Bridge and the frontend use Alpine;
  FastAPI uses `python:3.12-slim` (glibc — `psycopg2-binary` has no musl wheel,
  so Alpine would force a slow source compile).
- **Order layers cache-friendly.** Copy dependency manifests and install
  *before* copying source, so code-only changes don't re-run the install.
- **Multi-stage builds.** The frontend builds with Node, then copies only the
  static `dist/` into a tiny `nginx:1.27-alpine` runtime stage.
- **Use `.dockerignore`** to keep `node_modules`, tests, venvs, and docs out of
  the build context.
- **Disable caches that bloat layers**: `pip install --no-cache-dir`,
  `PYTHONDONTWRITEBYTECODE=1`, `npm ci --omit=dev --no-audit --no-fund`.

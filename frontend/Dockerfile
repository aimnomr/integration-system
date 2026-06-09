# Frontend container — multi-stage: Node builder produces the static bundle,
# nginx serves it. (G30)
#
# VITE_* vars are inlined at build time by Vite, so they have to be supplied
# as build args. The defaults match docker-compose service names so the
# bundle Just Works in the compose stack. Override at build time for other
# deployments, e.g.:
#
#   docker build --build-arg VITE_API_URL=https://api.example.com \
#                --build-arg VITE_MQTT_WS_URL=wss://mqtt.example.com \
#                -t amr-frontend ./frontend

# ---- Stage 1: build the static bundle ------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Install deps first so the layer caches across source-only changes.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Bake the runtime endpoints into the bundle. Defaults are wired for the
# compose stack — the browser talks to host-published ports, so localhost
# here means "the host machine running docker compose", not the container.
ARG VITE_API_URL=http://localhost:8000
ARG VITE_MQTT_WS_URL=ws://localhost:9001
ARG VITE_API_KEY=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_MQTT_WS_URL=$VITE_MQTT_WS_URL \
    VITE_API_KEY=$VITE_API_KEY

COPY . .
RUN npm run build

# ---- Stage 2: serve with nginx -------------------------------------------
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]

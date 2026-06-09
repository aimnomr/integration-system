# ROS Bridge Service (G14).
# Alpine base — deps are pure JS (mqtt, roslib, dotenv), no native modules,
# so musl is safe and the image is ~5x smaller than node:22-slim.
FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

# Install dependencies first so the layer is cached across code-only changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

# Drop to the unprivileged user that ships with the node image.
USER node

# Fetches GET /fleet from FastAPI at startup, then bridges each robot.
CMD ["node", "index.js"]

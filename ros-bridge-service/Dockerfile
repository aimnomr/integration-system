# ROS Bridge Service (G14).
FROM node:22-slim

WORKDIR /app

# Install dependencies first so the layer is cached across code-only changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Fetches GET /fleet from FastAPI at startup, then bridges each robot.
CMD ["node", "index.js"]

# AMR Integration System

A full-stack **fleet console for ROS-based autonomous mobile robots**: a React
operator console and a fleet-management backend, speaking the **VDA5050**
industry standard over MQTT. One robot or many — by configuration alone.

```
Commands:   Browser / client ──HTTP──> FastAPI ──VDA5050/MQTT──> ROS Bridge ──rosbridge──> Robot
Telemetry:  Robot ──rosbridge──> ROS Bridge ──VDA5050/MQTT──> Browser (live) + FastAPI ──> PostgreSQL
            (Mosquitto is the broker throughout; Node-RED is an optional passive viewer)
```

## Run it (Docker)

```bash
cp .env.example .env            # optional — defaults work on one machine
docker compose up --build -d
```

Console at `http://localhost:5173`, API docs at `http://localhost:8000/docs`.
Full steps: [Quickstart](docs/user-guide/quickstart.md).

## Documentation

The knowledge base lives in [`docs/`](docs/README.md), organised by audience:

| You are… | Start at |
|---|---|
| 🟢 **Using the system as-is** | [User Guide](docs/user-guide/quickstart.md) — quickstart, configuration, console tour, connecting a robot, troubleshooting |
| 🟡 **New and learning the project** | [Getting Started](docs/getting-started/introduction.md) — introduction, concepts, architecture tour, local dev setup |
| 🔴 **Building on or integrating with it** | [Reference](docs/README.md#-im-building-on-it--reference) — architecture, per-service internals, contracts ([`docs/schema/`](docs/schema/)), decisions, failure matrix, testing |

## Services

| Service | Tech | Address |
|---|---|---|
| Frontend (operator console) | Vite + React 19 + TS | `:5173` |
| FastAPI (FMS gateway) | Python, FastAPI | `:8000` |
| Mosquitto (MQTT broker) | Mosquitto | `:1883` TCP / `:9001` WS |
| ROS Bridge (VDA5050 ↔ ROS) | Node.js, roslib | — |
| Node-RED (optional viewer) | Node-RED | `:1880` |
| PostgreSQL | PostgreSQL | `:5432` |

`CLAUDE.md` holds guidance for the Claude Code agent. `thesis/` is a
thesis-writing snapshot, separate from the live documentation.

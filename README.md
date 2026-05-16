# AMR Integration System

Middleware that bridges a ROS-based Autonomous Mobile Robot to external REST clients,
using MQTT as the central messaging backbone across four services.

```
React / client ──HTTP──> FastAPI ──MQTT──> Node-RED ──MQTT──> ROS Bridge ──> Robot
                                              (Mosquitto broker throughout)
```

## Getting started

New to the project? Read in this order:

1. [docs/overview.md](docs/overview.md) — what this project is
2. [docs/architecture.md](docs/architecture.md) — how the services connect
3. [docs/setup.md](docs/setup.md) — prerequisites and how to run it

## Documentation map

All documentation lives under `docs/`.

| Area | Location |
|---|---|
| Overview & doc map | [docs/overview.md](docs/overview.md) |
| Architecture & message pathways | [docs/architecture.md](docs/architecture.md) |
| Setup & running | [docs/setup.md](docs/setup.md) |
| Implementation status | [docs/status.md](docs/status.md) |
| Gaps & flagged items | [docs/gaps.md](docs/gaps.md) |
| Continuation / handoff notes | [docs/CONTINUATION.md](docs/CONTINUATION.md) |
| Decision log (the *why*) | [docs/decisions.md](docs/decisions.md) |
| Glossary | [docs/glossary.md](docs/glossary.md) |
| Per-service reference | [docs/services/](docs/services/) |
| Contracts — REST, MQTT, ROS, database | [docs/schema/](docs/schema/) |
| Documentation format standards | [docs/convention/](docs/convention/) |
| Forward-looking plans (e.g. VDA5050) | [docs/plans/](docs/plans/) |

## Services

| Service | Tech | Address |
|---|---|---|
| FastAPI Service | Python 3.14, FastAPI | `:8000` |
| Mosquitto | MQTT broker | `:1883` |
| Node-RED | Node-RED | `:1880` |
| ROS Bridge Service | Node.js, roslib | — |

`CLAUDE.md` holds guidance for the Claude Code agent.

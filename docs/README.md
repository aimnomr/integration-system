# Documentation

Welcome to the knowledge base for the **AMR Integration System** — a full-stack
fleet console for ROS-based autonomous mobile robots, speaking the **VDA5050**
standard over MQTT.

Pick the path that matches you:

## 🟢 I just want to run it — [User Guide](user-guide/quickstart.md)

You have Docker and want the system working. No code reading required.

| Page | What it gives you |
|---|---|
| [Quickstart](user-guide/quickstart.md) | From clone to a running stack in three commands |
| [Configuration](user-guide/configuration.md) | The `.env` file — deploying on your machine, your LAN, or another device |
| [Using the console](user-guide/using-the-console.md) | A tour of every screen: dashboard, dispatch, teleop, OEE, admin |
| [Connecting a robot](user-guide/connecting-a-robot.md) | Pointing the system at a real robot or simulator |
| [Troubleshooting](user-guide/troubleshooting.md) | Symptom → cause → fix |

## 🟡 I'm new and want to understand it — [Getting Started](getting-started/introduction.md)

You're a student, examiner, or new contributor who wants the *why* before the *how*.

| Page | What it gives you |
|---|---|
| [Introduction](getting-started/introduction.md) | What the project is and the problem it solves, in plain language |
| [Concepts](getting-started/concepts.md) | ROS, MQTT, VDA5050, OEE — every domain term explained |
| [Architecture tour](getting-started/architecture-tour.md) | Follow one command and one telemetry message through the whole system |
| [Running locally](getting-started/running-locally.md) | The manual (non-Docker) developer setup, step by step |

## 🔴 I'm building on it — [Reference](#reference)

You're maintaining, extending, or integrating against the system. Precise
contracts and as-built internals.

| Page | What it gives you |
|---|---|
| [Architecture](reference/architecture.md) | Full topology, the three realtime lanes, key design points |
| [Extending the system](reference/extending.md) | How to add an endpoint, message, topic, screen, or table — one recipe per service |
| [Services](reference/services/) | As-built internals per service: [FastAPI](reference/services/fastapi-service.md), [ROS Bridge](reference/services/ros-bridge-service.md), [Node-RED](reference/services/node-red.md), [Frontend](reference/services/frontend.md) |
| [Contracts](schema/) | The source of truth — [REST](schema/REST_ENDPOINTS.md), [MQTT](schema/MQTT_TOPICS.md), [VDA5050 messages](schema/VDA5050_MESSAGES.md), [ROS topics](schema/ROS_TOPICS.md), [database](schema/DATABASE_SCHEMA.md) |
| [Decisions](reference/decisions.md) | Why the key design choices were made |
| [Failure matrix](reference/failure-matrix.md) | What breaks (and what survives) when each service goes down |
| [Testing](reference/testing.md) | Unit, integration, and E2E suites — what to run and when |
| [Docker cheatsheet](reference/docker-cheatsheet/README.md) | Command reference from dev to deployment |

> **Contracts are the source of truth.** When you add an endpoint, topic, or
> table, update the matching file in [`schema/`](schema/) in the same change.

## Repository layout

```
fastapi-service/     FMS gateway — REST API, VDA5050 publisher, telemetry ingester
ros-bridge-service/  VDA5050 ↔ ROS translator (one Robot instance per robot)
frontend/            React operator console
node-red/            Passive viewer / dev tool flows
mosquitto/           MQTT broker config
docs/                This knowledge base (+ schema/ contracts, postman/ smoke suite)
scripts/             start-all.ps1 + integration test scripts
thesis/              Thesis-writing snapshot (not part of this knowledge base)
```

# Introduction

> **Who this is for:** someone new to the project — a student, examiner, or
> new contributor — who wants to understand what it is before touching it.
> Unfamiliar terms? Everything is defined in [Concepts](concepts.md).

## The problem

A ROS robot is an island. Everything it knows — its position, its camera, its
navigation stack — lives inside ROS, on the robot. If you want a normal web
application to *send the robot somewhere* and *watch it go*, something has to
bridge two very different worlds:

- the **robot world**: ROS topics, poses, occupancy grids, `move_base` goals;
- the **application world**: REST APIs, databases, browsers, dashboards.

And if tomorrow there are *five* robots instead of one, that bridge shouldn't
need rewriting.

## What this project is

The **AMR Integration System** is that bridge, built as a complete product: a
fleet management backend plus a browser-based operator console for ROS robots.

From an operator's chair, it lets you:

- see every robot in the fleet live on a dashboard — position on the map,
  connection state, what it's working on;
- **dispatch** a robot to one or more destinations and watch progress
  waypoint by waypoint, with cancel/retry/skip control;
- **teleoperate** — drive a robot manually with a live camera feed;
- review **history and productivity** — every order ever sent, plus OEE
  metrics derived from completed trips;
- manage the fleet itself — robots, maps, named locations — from admin
  screens, with everything stored in a real database.

## The two ideas that shape the design

**1. Everything speaks through a message broker.** Services don't call each
other directly; they publish and subscribe messages through an MQTT broker
(Mosquitto). That decouples them — each service can start, stop, and fail
independently, and adding a listener never disturbs the sender. The
[failure matrix](../reference/failure-matrix.md) shows how much of the system
survives any single outage; that resilience falls straight out of this choice.

**2. The robot interface follows an industry standard — VDA5050.** Rather
than inventing a custom robot protocol, the system uses VDA5050, the open
standard for fleet-manager ↔ AMR communication used in real industry. Orders,
robot state, and connection liveness all travel as standard VDA5050 messages
on per-robot topics. One robot or twenty is then just configuration — each
robot gets its own topic namespace and its own database row, and no code
changes.

## The five components

| Component | In one sentence |
|---|---|
| **React frontend** | The operator console in the browser — dashboard, dispatch, teleop, history, admin. |
| **FastAPI service** | The fleet-management gateway — receives REST commands, turns them into VDA5050 orders, and records all robot telemetry into PostgreSQL. |
| **Mosquitto** | The MQTT broker every message travels through — the system's spine. |
| **ROS Bridge service** | The translator — speaks VDA5050 on one side and ROS (via the robot's rosbridge WebSocket) on the other, one instance per robot. |
| **Node-RED** | An optional dev tool — a live window onto the message traffic, plus database admin utilities. The system runs fine without it. |

Plus **PostgreSQL**, which persists everything: telemetry, order history, OEE
cycles, and the fleet definition itself (the database — not a config file —
is the single source of truth for which robots exist).

## Where to go next

1. [Concepts](concepts.md) — the vocabulary: ROS, MQTT, VDA5050, OEE.
2. [Architecture tour](architecture-tour.md) — follow one order and one
   telemetry message through every component.
3. [Running locally](running-locally.md) — set up the developer environment.

Or, if you'd rather see it run first:
[User Guide → Quickstart](../user-guide/quickstart.md) gets the whole stack up
with Docker in three commands.

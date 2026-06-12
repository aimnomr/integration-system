# Presentation Poster Reference (Master)

**Purpose:** A single, complete reference for drafting the FYP presentation
poster and slides. It merges the authoritative framing of the submitted report
with the precise technical specifics from the codebase knowledge base
(`docs/`). Organised around the sections requested by the supervisor: Problem
Statement, Objectives, System Architecture, Tech Stack, Screenshots, Results and
Achievements, Conclusion, and References.

**Project Title:** System Architecture and Integration Towards an Intelligent
Cyber-Physical Manufacturing Line

**Author:** Aiman Bin Omar (5022 2123 098)
**Supervisor:** Dr. Yusman Bin Yusof
**Institution:** Universiti Kuala Lumpur Malaysia France Institute (UniKL MFI)
**Program:** Bachelor of Engineering Technology (HONS) in Automation and Robotics

> **Framing note (read first).** This project is a **backend integration
> framework**, not a web application. The deliverable is the gateway and its
> **public contract** (a REST API plus an MQTT / VDA5050 wire contract) through
> which any API-capable client can command and monitor the robot. The React
> operator console is a **bundled reference client**: it proves the contract
> works end-to-end and ships as a turnkey operator surface, but a client is free
> to build their own consumer against the documented contract instead. The
> poster should keep the API and the architecture in the foreground; the console
> is the visible demonstration of them, not the product itself.

> **Reconciliation note.** The submitted report describes Node-RED as the active
> telemetry sink. After submission the architecture was refined so that the
> FastAPI gateway is now the sole telemetry ingester and Node-RED is a passive
> viewer. This document reflects the current, accurate system. That single role
> change is the only divergence from the report text.

---

## 1. Problem Statement

### Short form (poster headline)
There is no common, reusable interface through which any client system can drive
and observe the Autonomous Mobile Robot (AMR), which forces every new device or
supervisory tool to build its own bespoke point-to-point integration.

### Standard form (poster body)
The Solo Labeller and the MoveRobotic AMR arrive at UniKL MFI as standalone
systems, each with its own controller, workflow logic, and communication method.
There is no common integration layer between them, or between the AMR and any
other system that might need to use it. Without such a layer, every new device,
application, or supervisory tool that wants to drive the AMR would need its own
bespoke connection, coupling each client directly to the robot's low-level
interfaces and producing a brittle web of one-off integrations that does not
scale. The core problem is therefore not that two specific machines fail to
coordinate, but that the AMR lacks a reusable, standards-aligned interface that
any API-capable client can target.

### Why it matters
- Each bespoke integration duplicates effort and is unique to one client device.
- Point-to-point integrations couple every client directly to the robot's
  low-level interfaces.
- The Cyber-Physical Teaching Factory (CPTF) initiative requires a reusable
  foundation onto which future subsystems can be connected without reopening the
  integration design.

---

## 2. Objectives

Three formal objectives, referenced throughout the report as O1, O2, and O3.

- **O1 (Architecture):** To design a decoupled, standards-aligned integration
  architecture for the AMR, comprising an operator console, a fleet-management
  gateway, a message-broker backbone, a telemetry sink, and a robot-side
  adapter, communicating through a structural subset of the VDA5050 standard.
- **O2 (Data Model):** To design a normalised relational data model that
  captures the architecture's state, command, and OEE information as the
  persistent system of record, with the database also serving as the single
  source of truth for the fleet definition.
- **O3 (Implementation and Validation):** To implement the architecture
  end-to-end and validate it in simulation through an operator console with live
  monitoring and OEE visualisation.

### Project aim (one sentence)
To design and implement a centralised integration framework that exposes an
autonomous mobile robot through a standards-aligned, reusable interface,
enabling any API-capable system to command and monitor it, validated in
simulation.

---

## 3. System Architecture

### 3.1 The plug-in seam (the central contribution, the poster's main idea)
The FastAPI gateway is a **protocol-neutral plug-in seam**. Any API-capable
client targets the gateway over plain HTTP and MQTT, with no robot-specific
wiring on the client side. The gateway translates client intent into the VDA5050
standard, and an external adapter (the ROS Bridge Service) translates VDA5050
into the robot's ROS topics. The robot's onboard ROS software is never modified;
VDA5050 is genuinely spoken on the wire. This is what replaces a brittle web of
point-to-point integrations with one reusable contract.

### 3.2 Backend services plus a database

| Service | Technology | Role |
|---|---|---|
| **FMS Gateway (the product)** | Python, FastAPI, paho-mqtt | The integration boundary. Exposes the REST API; translates REST to VDA5050 and publishes `order` / `instantActions`; subscribes the telemetry topics over MQTT and is the **sole ingester** (persists state, connection, command audit, and OEE to PostgreSQL); serves all reads and reference-data CRUD. |
| **MQTT Broker** | Mosquitto 2.x | Central messaging backbone (TCP 1883 for services, WebSocket 9001 for browser clients). |
| **ROS Bridge Service** | Node.js, roslib, mqtt | External adapter translating VDA5050 to MoveRobotic ROS topics; one Robot instance per robot. |
| **Persistent Storage** | PostgreSQL 16 | 15-table normalised schema; the fleet definition's single source of truth. |
| **Live Viewer (optional)** | Node-RED | Passive viewer of live VDA5050 traffic and a DB-admin utility; the stack functions whether it runs or not. |
| **Reference Client (bundled)** | React 19, TypeScript, Vite, Tailwind, MUI | A complete operator console built entirely on the public contract. Ships ready to run; demonstrates and validates the API. See Section 6. |

### 3.3 The public contract has two halves (plus one direct lane)
A custom client integrates through two documented contracts. A third lane exists
for high-frequency robot media and is browser-to-robot direct.

| Contract / lane | Transport | What a client does with it |
|---|---|---|
| **REST API** | HTTP to FastAPI (`:8000`) | Submit orders and instant actions; read state, order history, OEE, fleet, and system health; manage reference data (full CRUD). The primary integration surface. |
| **MQTT / VDA5050 wire contract** | MQTT, TCP `:1883` or WebSocket `:9001` | Subscribe live `state` and `connection` per robot; optionally observe the `order` / `instantActions` topics. The live telemetry feed. |
| **rosbridge lane (direct)** | WebSocket, browser to each robot | High-frequency robot media: occupancy-grid map, AMCL pose, camera feed, teleop `cmd_vel`. This bypasses the gateway. The bundled console uses it; a custom client may also use it, since it is a standard documented lane. |

Each lane is decoupled. Loss of one lane degrades only the features that depend
on it, which is the headline resilience property of the design.

### 3.4 Inbound command path (client to robot)
```
Any API-capable client
  -> HTTP POST                              (FastAPI builds the VDA5050 message)
FastAPI Gateway
  -> MQTT publish: order / instantActions   (per-robot topic)
Mosquitto Broker
  -> ROS Bridge Service (FleetManager routes to the Robot; OrderStateMachine)
  -> rosbridge WebSocket -> /move_base_simple/goal
MoveRobotic AMR
```
The OrderStateMachine sends one waypoint goal at a time, waiting for each
`/move_base/result` before issuing the next. This is the automatic
waypoint-advance loop. There is no separate command router; the gateway
publishes directly.

### 3.5 Outbound telemetry path (robot to persistence)
```
MoveRobotic AMR
  -> ROS topics: /amcl_pose, /move_base/result, /move_base/status
ROS Bridge Service (StateBuilder)
  -> MQTT publish: state / connection
Mosquitto Broker
  -> FastAPI (its own MQTT subscriber persists each message and derives OEE)
  -> PostgreSQL
```
Telemetry persistence lives in the gateway. Its own MQTT client subscribes the
telemetry topics and writes each message to PostgreSQL. The HTTP `/ingest/*`
routes remain as a secondary path for manual injection and the smoke suite.

### 3.6 Startup dependency chain
```
PostgreSQL  ->  FastAPI (loads fleet from DB)  ->  ROS Bridge (GET /fleet)
Mosquitto must be up before FastAPI / ROS Bridge can connect.
The bundled console can start anytime; it cold-loads from FastAPI then joins the
live lanes.
```
Safe boot order: PostgreSQL, Mosquitto, FastAPI, ROS Bridge, Node-RED, console.

---

## 4. API Surface (the product contract)

This is the heart of the framework and the most important technical exhibit on
the poster. The gateway auto-publishes interactive OpenAPI / Swagger
documentation (report Figure 4.2), so the contract is self-describing.

### 4.1 Command endpoints (drive the robot)

| Method and path | Purpose |
|---|---|
| `POST /robots/{serial}/order` | Submit a navigation order. Body `{ "nodes": [{ "x", "y", "theta" }] }`. One node is a single goal; N nodes are a sequence. The gateway builds and publishes a VDA5050 `order`. |
| `POST /robots/{serial}/order/named` | Submit an order by named-location IDs. Body `{ "location_ids": [int] }`. Each ID resolves to one node. |
| `POST /robots/{serial}/instant-actions` | Immediate action. Body `{ "action_type": "cancelOrder" \| "retryNode" \| "skipNode" }`. The gateway builds a VDA5050 `instantActions`. |

### 4.2 Monitoring and read endpoints

| Method and path | Purpose |
|---|---|
| `GET /robots` | List the fleet registry (`include_archived=true` adds archived rows). |
| `GET /robots/{serial}` | One robot's record. |
| `GET /fleet` | Full fleet definition. The ROS Bridge fetches this at startup; the database is the single source of truth and this endpoint is its gateway. |
| `GET /robots/{serial}/state` | The most recent VDA5050 `state` snapshot for a robot. |
| `GET /orders` | Paged historical order list (cursor pagination via `before`, filter by `serial`, `limit` 1 to 500). |
| `GET /orders/{order_id}` | Order detail: header plus joined `order_nodes` and `order_edges`. |
| `GET /system/status` | Gateway health: MQTT, database, rosbridge (inferred from retained `connection`), and Node-RED. |

### 4.3 OEE (productivity) endpoints

| Method and path | Purpose |
|---|---|
| `GET /robots/{serial}/oee/summary` | Total, succeeded, failed cycles and average duration. |
| `GET /robots/{serial}/oee/cycles` | Recent trip cycles. |
| `GET /robots/{serial}/oee/availability` | Fraction of state samples in which the robot was driving. |

### 4.4 Reference-data CRUD (the fleet is editable through the API)

Per-row create, update, and delete for the reference tables, so editing them
never means re-applying `schema.sql`. After any robot or fleet write the
in-memory registry reloads, so changes apply without a FastAPI restart. Shared
status codes include `201` created, `409` conflict (duplicate key, or a delete
still referenced by a foreign key, which is never cascaded), and `503` database
unavailable.

| Resource | Endpoints |
|---|---|
| **Maps** | `GET /maps`, `GET /maps/{id}`, `POST /maps`, `PUT /maps/{id}`, `DELETE /maps/{id}` (409 if still referenced). |
| **Named locations** | `GET /locations`, `GET /locations/{id}`, `POST /locations`, `PUT /locations/{id}`, `DELETE /locations/{id}`. |
| **Robots** | `POST /robots`, `PUT /robots/{serial}`, `DELETE /robots/{serial}`, plus soft-delete `POST /robots/{serial}/archive` and `POST /robots/{serial}/restore`. Archived robots are hidden from operator surfaces and return `410 Gone` on command and ingest paths, while history stays readable. |
| **Fleet config** | `PUT /fleet` updates the single `fleet_config` row (interface name, major version, version, manufacturer). |

### 4.5 Internal ingestion endpoints (secondary path)

`POST /ingest/state`, `/ingest/connection`, `/ingest/command`,
`/ingest/oee-cycle`. The live path is the gateway's own MQTT subscriber; these
HTTP routes remain for manual injection, the test harness, and the smoke suite.
They sit on the internal boundary and are left unauthenticated by design.

### 4.6 Cross-cutting API policies

- **Authentication.** Opt-in via the `API_KEY` env var. When set, every
  client-facing endpoint (`/robots/*`, `/fleet`, `/system/*`) requires a matching
  `X-API-Key` header or returns `401`. Off by default for local development.
- **Rate limiting.** A per-client-IP sliding window, `RATE_LIMIT_PER_MINUTE`
  requests per 60 seconds (default 120). Exceeding it returns `429` with a
  `Retry-After` header.
- **CORS.** Browser origins allowed to call the API come from `CORS_ORIGINS`
  (default the Vite dev server). This is what lets a third-party browser client
  call the gateway safely.

### 4.7 The MQTT / VDA5050 wire contract (second public contract)

VDA5050 topic hierarchy, fixed for this project as
`amr/v2/moverobotic/{serialNumber}/{topic}`.

| Topic | Direction | QoS | Retained | Purpose |
|---|---|---|---|---|
| `order` | client to robot | 0 | No | Navigation order: a graph of nodes (and edges). |
| `instantActions` | client to robot | 0 | No | Immediate actions: cancel, retry, skip. |
| `state` | robot to client | 0 | No | Consolidated state snapshot; on significant change (greater than 0.05 m, greater than 5 degrees, or an order or error change) plus a 5 second heartbeat. |
| `connection` | robot to client | 1 | Yes | Liveness: ONLINE, OFFLINE, CONNECTIONBROKEN. The CONNECTIONBROKEN value is the MQTT Last-Will, emitted automatically if a bridge process dies. |

Each Robot instance owns its own MQTT client, because MQTT permits only one
Last-Will per connection, so per-robot liveness needs a client per robot.

### 4.8 Documented deviations from VDA5050 v2.0.0
1. **batteryState omitted** from the state message (the target robot exposes no
   battery topic; a synthetic stub would be misleading).
2. **Custom retryNode and skipNode instantActions** instead of full order-update
   merges (avoids implementing full horizon semantics).
3. **visualization and factsheet topics not implemented** (clients read live pose
   and map directly via the rosbridge lane).

---

## 5. Tech Stack Summary

**Backend gateway (the product):** Python 3.10 or later, FastAPI, paho-mqtt,
ThreadedConnectionPool for PostgreSQL. Auto-generated OpenAPI / Swagger docs.

**Middleware and messaging:** Mosquitto 2.x MQTT broker, Node.js 20.x ROS Bridge
Service, rosbridge WebSocket protocol, Node-RED (optional live viewer and DB
admin).

**Persistence:** PostgreSQL 16, 15-table schema in 1NF and Boyce-Codd Normal
Form (BCNF).

**Standards and protocols:** VDA5050 version 2.0.0 (structural subset), MQTT
(publish-subscribe), REST over HTTP, WebSocket.

**Bundled reference client:** React 19, TypeScript 5.x, Vite 6, Tailwind CSS,
Material UI (MUI 7) with MUI X DataGrid and Charts, TanStack Query, MQTT.js
(MQTT-over-WebSocket), roslib (rosbridge client), custom `MapCanvas` renderer.

**Simulation:** Gazebo with the MoveRobotic AMR model, ROS 1.

**Testing and CI:** pytest with FastAPI TestClient (41 tests), Node.js `node:test`
runner (15 tests), Newman / Postman (61 requests, 66 assertions), Playwright (24
end-to-end tests), PowerShell integration scripts, GitHub Actions (5-job
pipeline).

**Host OS:** Windows 25H2 (local development), ubuntu-latest (CI runner).

---

## 6. The Bundled Reference Client (and Screenshots)

The React console is **one consumer of the contract**, shipped with the framework
so the system is usable out of the box and so the API is demonstrably complete.
It is not the product; it is the proof and the default surface.

### 6.1 What a custom client gets from the contract versus what the console adds
- **Available to any client through the public contract (REST plus MQTT):**
  submit single, multi-node, and named orders; cancel, retry, and skip; read
  latest state, full order history and order detail, OEE summary, cycles, and
  availability; read fleet and system health; and perform full reference-data
  CRUD. Subscribe live `state` and `connection`. This is the entire command,
  control, monitoring, history, and administration surface.
- **What the bundled console uniquely delivers:** the operator user experience.
  A rendered occupancy-grid map (the custom `MapCanvas`), the OEE charts, the
  safety-gated teleoperation, and the CRUD screens, plus pre-wired handling of
  the direct rosbridge lane (live map, camera, teleop). A client that skips the
  console does not lose access to anything in the contract; it would simply
  re-implement the operator surface and the rosbridge wiring itself. The
  rosbridge lane is a standard, documented lane, so even those media features
  remain open to a custom client.

This openness is a selling point: the framework is extensible at every layer, and
the bundled console is the turnkey default rather than a lock-in.

### 6.2 Screens (screenshot reference)
Seven primary screens plus a Health page. Figure numbers reference the report.
Capture these from the running console at `http://<host>:5173`.

| Screen | Figure | What it shows | Capture priority |
|---|---|---|---|
| Robot Detail | 4.9 | Live occupancy-grid map, AMCL pose arrow, tabbed state panel | High |
| Dashboard | 4.8 | Fleet-level overview, one tile per registered robot | High |
| Dispatch (named location) | 4.10 | Order submission via the named-location selector | High |
| Dispatch (manual coordinates) | 4.11 | Order submission via a coordinate picker pinned on the live map | Medium |
| Teleoperation | 4.12 | Camera feed with the 3x3 keypad and ENGAGED safety gate | Medium |
| OEE | 4.14 | Availability bar, cycles bar chart, cycles log grid | Medium |
| Order History | 4.13 | Cursor-paged datagrid of past orders | Low |
| Admin (CRUD) | 4.15 | Reference-data management (Maps, Locations, Robots, Fleet Config) | Low |
| Health | 4.16 | Service liveness readout | Low |

### 6.3 Map and teleop specifics (useful captions)
- **MapCanvas pose source:** AMCL is primary; EKF
  (`/robot_pose_ekf_node/odom_combined`) is the fallback after 2 seconds of AMCL
  silence, and the robot arrow turns amber so the operator notices the possible
  drift.
- **Teleop velocity contract (kept from the previous interface):** linear
  0.3 m/s, angular 0.5 rad/s, 100 ms repeat, QWE/ASD/ZXC keypad layout, mouse,
  touch, and keyboard supported, auto-disengages on a rosbridge drop.

### 6.4 Non-screenshot figures worth placing on the poster
- **Figure 4.1** Final Integration Architecture (main system diagram).
- **Figure 4.2** FastAPI gateway native API documentation listing REST endpoints.
  Strong evidence that the API is the product.
- **Figure 4.3** ROS Bridge log showing fleet loading and VDA5050-to-ROS translation.
- **Figure 4.4** Live VDA5050 traffic on the Mosquitto broker via a wildcard subscription.
- **Figure 4.6** Persisted records in PostgreSQL after a simulation session.
- **Figure 4.7** Composed deployment showing all services running.
- **Figure 4.17** Entity Relationship Diagram (15-table schema).
- **Figure 3.1** Overall Methodology diagram.
- **Figure 3.3 / 3.4** Inbound command and outbound telemetry path diagrams.

A clean architecture diagram (Figure 4.1, or the lane view in Section 3.3) and
the API documentation (Figure 4.2) carry more weight on this poster than any UI
screenshot, because they show the contribution directly.

---

## 7. Data Model

### 15-table normalised PostgreSQL schema
- Strict First Normal Form (1NF) and Boyce-Codd Normal Form (BCNF) compliance.
- Every log and telemetry table references the `robots` table by a foreign key
  on `serial_number`.
- VDA5050 variable-length arrays (nodes, edges, actions, nodeStates,
  actionStates, errors) are decomposed into child tables rather than stored as
  JSONB. This is correct relational design and is queryable with ordinary SQL,
  with no JSON operators.

### Fleet definition tables
- `fleet_config`: a single-row table holding the VDA5050 identity fields.
- `robots`: one row per registered robot, `serial_number` primary key,
  `archived_at` for soft-delete.

### Key outcomes
- Each node, action, and error is individually queryable.
- Adding a robot is a database edit, not a code change, and is done through the
  API (Section 4.4).
- The 15-table BCNF schema is a gradeable deliverable and should be surfaced
  explicitly on the poster.

---

## 8. Results and Achievements

### Functional test outcomes (Table 4.8): twelve test cases, all passed

| ID | Capability |
|---|---|
| TC-01 | Single-node order submission |
| TC-02 | Multi-node order sequencing |
| TC-03 | Named-location resolution |
| TC-04 | Cancel order |
| TC-05 | Retry failed node |
| TC-06 | Skip node |
| TC-07 | Last-Will on bridge death |
| TC-08 | Named-location CRUD |
| TC-09 | Order history pagination |
| TC-10 | API key authentication |
| TC-11 | CORS preflight |
| TC-12 | Telemetry ingestion of state into PostgreSQL |

### Headline test numbers (poster stat callouts)
- **41** FastAPI pytest tests, all passing.
- **15** ROS Bridge `node:test` cases, all passing.
- **61** Newman API smoke requests, **66** assertions, **0** failures. This is
  direct evidence the API contract holds.
- **24** Playwright end-to-end tests, **24 / 24** passed.
- **5-job** GitHub Actions CI pipeline gating every merge.

### Key non-functional findings
1. **Decoupling verified in operation.** Lane-failure experiments confirmed that
   losing any one realtime data path degrades only the dependent features.
   Mosquitto is the single spine; the direct rosbridge lane keeps live map,
   camera, and teleop working even when backend services are down.
2. **Fleet extensibility verified.** Adding a second robot required only one
   database row insert (through the API) and a ROS Bridge restart. No application
   code was changed.
3. **Fault tolerance via Last-Will.** Abruptly terminating the ROS Bridge caused
   Mosquitto to emit CONNECTIONBROKEN on the retained connection topic at QoS 1,
   observed via `mosquitto_sub`.

### Objective achievement summary (Table 5.1)

| Objective | Achievement |
|---|---|
| O1 (Architecture) | Fully achieved. A decoupled architecture around the gateway contract was realised; VDA5050 is operative on the wire; the realtime lanes were verified through lane-failure experiments. |
| O2 (Data Model) | Fully achieved. A 15-table BCNF schema was implemented; VDA5050 arrays were normalised into child tables; the fleet definition was confirmed editable through the API without a service restart. |
| O3 (End-to-end Validation) | Achieved with one qualification. The full stack was validated in simulation; the OEE pipeline operates end-to-end, but no sustained session was captured for numeric reporting. |

### Engineering challenges resolved (Table 4.11)
1. **Per-robot Last-Will.** A single shared MQTT client could not carry per-robot
   liveness, because MQTT permits only one Last-Will per connection. Resolved by
   giving each Robot instance its own MQTT client.
2. **Fleet definition drift.** A JSON config file and a database seed drifted
   apart. Resolved by removing the JSON file and making the database
   authoritative; the ROS Bridge now fetches the fleet via `GET /fleet` at
   startup.
3. **Concentrated persistence.** All telemetry persistence was concentrated in
   the gateway, keeping the SQL logic in one testable location.

### Before and after (contribution framing)

| Capability | Previous single-robot interface | Current integration framework |
|---|---|---|
| Integration model | Direct browser-to-robot wiring | A reusable gateway contract any client can target |
| Standard | Bespoke ROS topics | VDA5050 open MQTT FMS-to-AGV standard |
| Persistence | None (session only) | PostgreSQL: state, orders, commands, OEE |
| Reference data | Hardcoded | Editable through the API (full CRUD) |
| Cancel, retry, skip | Browser-side only | VDA5050 instantActions over the API |
| Tests, CI, Docker | None | pytest, node, Newman, Playwright, GitHub Actions, docker compose |

---

## 9. Significance and Impact (poster talking points)

- **Reusable integration capability.** A single well-defined interface replaces
  point-to-point coupling, making every future integration cheaper.
- **API-first and open.** The contract is the product; the bundled console is a
  reference client. Clients can adopt the console wholesale or build their own
  consumer against documented REST and MQTT contracts. Nothing is locked away.
- **Standards alignment.** Adopting VDA5050 means the framework can interoperate
  with VDA5050-aware fleet management systems by design, not by future migration.
- **Database as single source of truth.** Adding a robot is a database edit made
  through the API; reference data is editable without redeploying services.
- **Foundation for the CPTF.** Provides UniKL MFI with a working integration
  layer onto which the Solo Labeller and future subsystems can be connected
  without revisiting the integration design.

---

## 10. Limitations (honest framing)

1. **Simulation-only validation.** Physical MoveRobotic AMR hardware was not yet
   installed during the project period. Functional correctness was established;
   operational realities such as Wi-Fi packet loss, motor latency, and AMCL drift
   were not characterised.
2. **VDA5050 subset.** Battery field omitted; retry and skip implemented as
   custom instantActions; visualisation and factsheet topics not implemented.
3. **Single-robot active deployment.** The architecture is fleet-capable and was
   structurally verified for multi-robot operation, but only one robot was
   exercised in steady-state validation.
4. **Anonymous MQTT broker.** Mosquitto runs without authentication or TLS.
   Acceptable for a closed LAN but requires hardening before wider deployment.
5. **OEE numeric validation outstanding.** The OEE pipeline works end-to-end, but
   no full session was captured for numeric reporting.
6. **ROS adapter coupled to MoveRobotic topic conventions.** A different
   ROS-based robot would need a new adapter variant, although the gateway,
   broker, console, and data layer remain robot-agnostic.
7. **Solo Labeller integration remained at the specification stage.** It is framed
   as the motivating first client rather than a co-equal integrated subsystem.

---

## 11. Conclusion (poster-ready compact form)

The project delivered a reusable, standards-aligned software integration
framework that exposes a MoveRobotic AMR through a VDA5050-compliant interface.
The framework's product is the gateway contract: a REST API and an MQTT / VDA5050
wire contract through which any API-capable client can command and monitor the
robot without bespoke wiring. It was realised as a set of decoupled backend
services backed by a 15-table normalised PostgreSQL schema, validated end-to-end
in Gazebo simulation, and shipped with a React reference console that proves the
contract is complete. All three formal objectives were met. The principal
boundary on the results is that validation was simulation-only; physical hardware
validation is the most important next step, followed by completion of the Solo
Labeller integration and multi-robot concurrent operation.

### One-sentence closing line
This work provides UniKL MFI's Cyber-Physical Teaching Factory with a working,
standards-aligned integration layer onto which future research, teaching, and
industrial subsystems can be connected without redesigning the integration each
time.

---

## 12. Future Work

- Physical hardware validation against the live MoveRobotic AMR once installed.
- MQTT security hardening (authentication and TLS on Mosquitto).
- Multi-robot concurrent operation experiments.
- Full VDA5050 v2.0.0 conformance for third-party FMS interoperability.
- Live OEE session capture and numeric analysis.
- Solo Labeller physical integration as the first real client of the framework.
- Container orchestration migration (for example Kubernetes) for production
  deployment.

---

## 13. Key References (top picks for the poster reference list)

The full reference list is in the report. The following are the most directly
relevant for an architecture and integration poster.

1. Azarian, M., Yu, H., Solvang, W., and Shu, B. (2020). An Introduction of the
   Role of Virtual Technologies and Digital Twin in Industry 4.0. *Lecture Notes
   in Electrical Engineering*, 634, 258 to 266.
2. Boccella, A. R., Centobelli, P., Cerchione, R., Murino, T., and Riedel, R.
   (2020). Evaluating Centralized and Heterarchical Control of Smart
   Manufacturing Systems in the Era of Industry 4.0. *Applied Sciences*, 10(3).
3. Buzhin, I. G., Derevyankin, A. Y., Antonova, V. M., Perevalov, A. P., and
   Mironov Yu, B. (2023). Comparative analysis of REST and gRPC used in the
   monitoring system of communication network virtualised infrastructure.
   *T-Comm Telecommunications and Transport*, 17(4), 50 to 55.
4. Gambo, M. L., Danasabe, A., Almadani, B., Aliyu, F., Aliyu, A., and Al-Nahari,
   E. (2025). A Systematic Literature Review of DDS Middleware in Robotic
   Systems. *Robotics*, 14(5).
5. Horak, T., Strelec, P., Kebisek, M., Tanuska, P., and Vaclavova, A. (2022).
   Data Integration from Heterogeneous Control Levels for the Purposes of
   Analysis within Industry 4.0 Concept. *Sensors*, 22(24).
6. INCOSE. (2023). *INCOSE Systems Engineering Handbook*. John Wiley and Sons.
7. Li, C., Mantravadi, S., Schou, C., Nielsen, H., Madsen, O., and Moller, C.
   (2021). An ISA-95 based Middle Data Layer for Data Standardization. In
   *Advances in Automotive Production Technology*, pp. 187 to 194. Springer.
8. Macenski, S., Foote, T., Gerkey, B., Lalancette, C., and Woodall, W. (2022).
   Robot Operating System 2: Design, architecture, and uses in the wild.
   *Science Robotics*, 7(66).
9. Salunke, S. V., and Ouda, A. (2024). A Performance Benchmark for the
   PostgreSQL and MySQL Databases. *Future Internet*, 16(10), 382.
10. Tapia, E., Sastoque-Pinilla, L., Lopez-Novoa, U., Bediaga, I., and Lopez de
    Lacalle, N. (2023). Assessing industrial communication protocols to bridge
    the gap between machine tools and software monitoring. *Sensors*, 23(12),
    5694.

---

## 14. Quick-grab facts (tight poster captions)

- An API-first integration framework. The product is the gateway contract, not
  the web console.
- Two public contracts: a REST API and an MQTT / VDA5050 wire contract. Plus a
  direct rosbridge lane for robot media.
- The FastAPI gateway is a protocol-neutral plug-in seam; the robot's onboard ROS
  software is never modified.
- The bundled React console is a reference client that proves the contract and
  ships turnkey. Build your own client, or use it as-is.
- VDA5050 2.0.0 subset over MQTT. Topic tree `amr/v2/moverobotic/{serial}/...`.
- 15-table BCNF schema. The database is the fleet's single source of truth, and
  the fleet is editable through the API.
- `state` publishes on change plus a 5 second heartbeat; `connection` is QoS 1,
  retained, with a CONNECTIONBROKEN Last-Will.
- Tests: 41 pytest, 15 node, 61 Newman (66 assertions, 0 failures), 24
  Playwright. A 5-job CI pipeline.
- Ports: Mosquitto TCP 1883 (services) and WebSocket 9001 (browser), FastAPI
  8000, console 5173.
- Validated in Gazebo simulation with the MoveRobotic AMR on ROS 1.

---

## 15. Poster Drafting Style Rules

- Use past tense for completed work; use present tense only for properties of the
  final system.
- No em dashes anywhere.
- Use a formal academic register; avoid informal language.
- Frame the contribution as an integration framework whose product is the API
  contract, with the React console as a bundled reference client, and the Solo
  Labeller as the motivating first client, never as a labeller-AMR pairing.
- Call the FastAPI gateway the plug-in seam when describing the architectural
  contribution.
- State that VDA5050 is genuinely spoken on the wire via an external adapter, and
  that the robot's onboard software is not modified.
- Surface the 15-table BCNF schema explicitly as a gradeable deliverable.
- Refer to every figure or table in the surrounding text using "Figure X shows"
  or "Table X shows" phrasing.

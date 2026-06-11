# Failure Matrix — What Breaks When a Service Goes Down

> A resilience map for the AMR Integration System. Simulates losing one (or more)
> of the six components and records the outcome on three axes:
> **drive** (robot accepts orders / navigates), **monitor** (operator sees live
> state), and **persist** (telemetry / history / OEE recorded).
>
> Source of truth for the topology is [architecture.md](architecture.md).
> This page is analysis, not a contract — verify against the code when it matters.

---

## TL;DR — do all services need to be up?

**No.** The system is decoupled through Mosquitto, and the browser has **three
independent realtime lanes** (REST, MQTT-over-WS, rosbridge) that bypass each
other. Losing a service knocks out only the features that ride on it.

Two useful "minimum viable" sets:

| Goal | Must be up | Can be down |
|---|---|---|
| **Drive the robot** (order → motion) | Mosquitto, ROS Bridge, FastAPI*, PostgreSQL*, robot rosbridge | Node-RED, Frontend |
| **Monitor live** (operator watches) | Frontend, Mosquitto, robot rosbridge, FastAPI* | Node-RED, PostgreSQL** |

\* needed **at startup** for the dependency chain (see [Startup order](#startup-dependency-chain)); a *running* system tolerates more than a *cold-starting* one.
\** live state/map/camera flow without Postgres; only cold-loads (fleet list, history) need it.

**Node-RED can be down with zero functional impact** — since 2026-06-09 it's a
passive viewer and FastAPI owns telemetry persistence, so nothing is lost when it's
off. The **Frontend** is similarly low-impact (visibility only). The one you can't
lose is **Mosquitto** — it's the spine.

---

## Single-service failure matrix

Legend: ✅ works · ⚠️ degraded · ❌ down

| Service down | Drive robot | Monitor live | Persist / history | What actually happens | Recovery |
|---|---|---|---|---|---|
| **Mosquitto** (broker) | ❌ | ⚠️ | ❌ | The spine is gone. FastAPI can't publish orders; ROS Bridge gets no orders and publishes no `state`/`connection`; Node-RED gets no telemetry. Browser MQTT-over-WS lane dies → **no live connection/state pills**. **But** the rosbridge lane (browser → robot directly) keeps **map, camera, teleop** alive, and REST cold-reads from Postgres still work. | Clients (paho / mqtt.js) auto-reconnect when broker returns. Retained `connection` messages re-deliver. **Single biggest point of failure.** |
| **PostgreSQL** | ⚠️ | ✅ | ❌ | FastAPI cold-reads fail (fleet, robots, orders, OEE, state history) and `/ingest/*` writes fail. **Live** telemetry over MQTT-over-WS and the rosbridge lane are untouched → robot still drives, live view still works. History / OEE / admin CRUD / dashboard cold-load break. | Restart Postgres; FastAPI reconnects. **Caution:** a ROS Bridge or FastAPI *restart* while Postgres is down will fail (fleet fetch). |
| **FastAPI** (FMS gateway) | ❌ (new orders) / ⚠️ (in-flight) | ⚠️ | ❌ | No REST → **no new orders/instant-actions**, no cold-reads. **FastAPI is now the telemetry ingester**, so while it's down **nothing is persisted** (its MQTT subscriber is gone) — Node-RED can't cover for it. An **in-flight** order keeps auto-advancing in the ROS Bridge. Live `state`/`connection` still reach the browser over MQTT-over-WS (FastAPI isn't in that path); rosbridge lane (map/camera/teleop) still works. | Restart FastAPI; the MQTT subscriber reconnects and persistence resumes. **A ROS Bridge restart while FastAPI is down will fail** — it fetches `GET /fleet` at boot. |
| **ROS Bridge Service** | ❌ | ⚠️ | ⚠️ | The VDA5050↔ROS translator is gone. Orders published to MQTT have **no consumer** → robot won't navigate. No `state` published; the per-robot Last-Will fires retained **`CONNECTIONBROKEN`** → frontend shows the robot offline. **But** the browser talks to the robot's rosbridge **directly**, so **live map, camera, and teleop still work** — you can manually drive even though autonomous orders can't be dispatched. REST history/OEE still readable from Postgres. | Restart the service (needs FastAPI up for the fleet fetch). `RosConnection` auto-reconnects to the robot every 3 s. |
| **Node-RED** (passive viewer) | ✅ | ✅ | ✅ | **No functional impact at all** (since 2026-06-09). Node-RED no longer persists anything — FastAPI ingests telemetry over MQTT. Commands flow, live `state`/`connection` reach the browser, robot drives, teleop works, **and all persistence (state/connection/command/OEE) continues** because it's FastAPI's job now. Losing Node-RED loses only the live debug *display* in its editor. | Restart Node-RED whenever; nothing was missed. Fully optional. |
| **React Frontend** | ✅ | ❌ | ✅ | Only the operator console is gone. The whole backend runs normally — an external caller can still `POST` orders to FastAPI, the robot drives, telemetry persists. **No human visibility**, that's all. | Reload the SPA; it cold-loads `GET /fleet` then rejoins the live lanes. Stateless. |
| **Robot rosbridge** (the robot itself) | ❌ | ⚠️ | ⚠️ | External to the stack but worth noting. ROS Bridge `RosConnection` retries every 3 s; no `state` updates → robot trends to offline. Browser map/camera/teleop dead (their source is the robot). Backend services stay healthy and idle. | Robot/rosbridge returns → 3 s auto-reconnect re-establishes everything. |

---

## Startup dependency chain

Several "restart while X is down" cases above come from this boot-time ordering —
a *running* system is more tolerant than a *cold-starting* one:

```
PostgreSQL  →  FastAPI (reads fleet from DB)  →  ROS Bridge (GET /fleet from FastAPI)
Mosquitto must be up before FastAPI / ROS Bridge / Node-RED can connect.
FastAPI's MQTT subscriber persists telemetry; Node-RED (a viewer) can start anytime.
Frontend can start anytime; it cold-loads from FastAPI then joins the live lanes.
```

So the safe boot order is: **Postgres → Mosquitto → FastAPI → ROS Bridge / Node-RED → Frontend.**
ROS Bridge `index.js` exits with a clear error if the `GET /fleet` fetch fails,
which is why it cannot start ahead of FastAPI (and transitively, Postgres).

---

## Notable multi-failure combinations

| Combined failure | Net outcome |
|---|---|
| **Mosquitto + ROS Bridge** | Total loss of the VDA5050 plane. Only the browser↔robot rosbridge lane survives → manual teleop + live map/camera only. No orders, no persistence, no live pills. |
| **PostgreSQL down (FastAPI up)** | Robot still drives and is monitorable live (MQTT-over-WS + rosbridge). **Zero persistence** and all history/OEE/cold-reads gone — a "live-only, amnesiac" mode. New manual orders still work (FastAPI publishes from its in-memory fleet); named-location orders need the DB and fail. (Node-RED's state is irrelevant here — it no longer persists.) |
| **FastAPI + Frontend** | No command entry point and no console. The ROS Bridge keeps auto-advancing any in-flight order and keeps publishing telemetry, but **nothing is persisted** — FastAPI was the ingester. The fleet runs "headless" to completion of whatever it was doing, then idles. |
| **Node-RED + Frontend** | Robot fully drivable by an external REST caller; live telemetry flows on MQTT **and is still persisted by FastAPI** — only the human view (console + Node-RED debug) is gone. |

---

## Single points of failure (ranked)

1. **Mosquitto** — every backend-to-backend path crosses it. Its only saving grace is that the browser's direct rosbridge lane survives. *No HA / clustering today.*
2. **FastAPI** — sole command ingress **and the sole telemetry ingester** (its MQTT subscriber persists everything); also the fleet-definition source for ROS Bridge startup. Single instance. Its persistence role grew when Node-RED was demoted to a viewer (2026-06-09).
3. **PostgreSQL** — single instance; kills persistence and all cold-reads, and blocks FastAPI/ROS Bridge cold starts.
4. **ROS Bridge** — single point for *autonomous* control, but teleop survives via the direct lane.

Node-RED and the Frontend are **not** single points of failure for live operation —
that decoupling is the headline resilience property of this design.

---

## Caveats / things to verify against code

- "In-flight order keeps advancing when FastAPI dies" assumes the `OrderStateMachine`
  holds the full node list locally (it does — orders are sent node-by-node from the
  bridge). Confirm in `ros-bridge-service/src/orderStateMachine.js`.
- Telemetry lost during a **FastAPI or Postgres** outage is **not** replayed — there's
  no store-and-forward buffer. (Node-RED outages no longer lose data — it's a viewer.)
  This is a known, accepted limitation.
- This matrix assumes a single robot for the "drive" column; with a fleet, a ROS
  Bridge process loss takes down **all** robots it hosts (one process, many `Robot`
  instances).

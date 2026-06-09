"""Shared telemetry persistence — the single place that turns a VDA5050
`state` / `connection` / `order` / `instantActions` message into database rows.

Two entry points call in here:
  * ``app/mqtt.py`` — FastAPI's own MQTT subscriber (the live path). This is what
    makes Node-RED **optional**: persistence is triggered by FastAPI consuming the
    telemetry topics directly, so Node-RED can run as a passive viewer or not at
    all and telemetry is still recorded.
  * ``app/routers/ingest.py`` — the HTTP ``/ingest/*`` routes, kept for manual
    injection, the Node-RED Test Harness, and the Newman smoke suite.

Persistence used to live in Node-RED (it POSTed each message to ``/ingest/*``).
Moving the *trigger* into FastAPI's MQTT client is the only structural change —
the SQL has always lived in ``app/db.py``. See docs/architecture.md.

Archived robots are refused (``ArchivedRobot`` → HTTP 410 at the router; silently
dropped on the MQTT path, matching the existing hard-cutoff semantics). OEE cycles
are derived from the ``state`` stream here, porting the former Node-RED
``deriveCycle`` function node.
"""
import threading

from . import db
from .robots import registry


class ArchivedRobot(RuntimeError):
    """Raised when a message targets an archived serial; persistence is refused."""


def _reject_if_archived(serial: str) -> None:
    if registry.is_archived(serial):
        raise ArchivedRobot(serial)


def persist_state(msg: dict) -> None:
    """Persist one VDA5050 `state` message, then derive any OEE cycle from it.

    Malformed messages (no serialNumber / timestamp) are dropped — mirrors the
    old Node-RED `validateState`. Raises ArchivedRobot / db.DatabaseUnavailable
    for the caller to map (HTTP) or swallow (MQTT)."""
    serial = msg.get("serialNumber")
    if not isinstance(serial, str) or not msg.get("timestamp"):
        return
    _reject_if_archived(serial)
    db.insert_state(msg)
    _derive_and_persist_oee(msg)


def persist_connection(msg: dict) -> None:
    """Persist one VDA5050 `connection` message."""
    serial = msg.get("serialNumber")
    if not isinstance(serial, str) or not msg.get("timestamp") or not msg.get("connectionState"):
        return
    _reject_if_archived(serial)
    db.insert_connection(msg)


def persist_command(kind: str, msg: dict) -> None:
    """Audit one `order` / `instantActions` message to its log tables."""
    serial = msg.get("serialNumber")
    if not isinstance(serial, str) or not msg.get("timestamp"):
        return
    _reject_if_archived(serial)
    db.insert_command(kind, msg)


def persist_oee_cycle(cycle: dict) -> None:
    """Persist a pre-derived OEE cycle (the /ingest/oee-cycle HTTP path)."""
    serial = cycle.get("serialNumber")
    if not isinstance(serial, str):
        return
    _reject_if_archived(serial)
    db.insert_oee_cycle(cycle)


# --- OEE derivation (ported from the Node-RED `deriveCycle` function node) ---
#
# A per-robot trip tracker. A cycle is emitted when an active order's nodeStates
# empties (SUCCEEDED) or its orderId clears mid-order (ABORTED). The context dict
# is touched from the MQTT callback thread and (rarely) an HTTP /ingest call, so a
# lock keeps the two safe. duration_s is computed by the DB (GENERATED column).

_oee_lock = threading.Lock()
_oee_ctx: dict[str, dict] = {}


def _derive_and_persist_oee(state: dict) -> None:
    serial = state["serialNumber"]
    cur = state.get("orderId") or ""
    remaining = len(state.get("nodeStates") or [])
    cycle = None
    with _oee_lock:
        ctx = _oee_ctx.get(serial) or {"orderId": "", "startTime": None, "active": False}
        if cur and cur != ctx["orderId"]:
            # a new order has started
            ctx = {"orderId": cur, "startTime": state.get("timestamp"), "active": True}
        elif cur and cur == ctx["orderId"] and ctx["active"] and remaining == 0:
            # the active order has finished all of its nodes
            cycle = {
                "serialNumber": serial, "orderId": cur,
                "startTime": ctx["startTime"], "endTime": state.get("timestamp"),
                "result": "SUCCEEDED",
            }
            ctx["active"] = False
        elif not cur and ctx["active"]:
            # the order was cleared (cancelled) while still active
            cycle = {
                "serialNumber": serial, "orderId": ctx["orderId"],
                "startTime": ctx["startTime"], "endTime": state.get("timestamp"),
                "result": "ABORTED",
            }
            ctx = {"orderId": "", "startTime": None, "active": False}
        _oee_ctx[serial] = ctx
    if cycle is not None:
        db.insert_oee_cycle(cycle)

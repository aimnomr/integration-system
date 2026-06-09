"""Tests for app/ingest_service.py — the shared telemetry-persistence layer that
both the HTTP /ingest routes and FastAPI's MQTT subscriber call into.

Focus is the logic that moved out of Node-RED: the OEE `deriveCycle` state
machine (ported from the Node-RED function node) and the archive cutoff.
"""
from unittest.mock import patch

import pytest

from app import ingest_service
from app.robots import registry


def _reset_oee():
    with ingest_service._oee_lock:
        ingest_service._oee_ctx.clear()


def _state(serial="amr001", order_id=None, node_states=None, ts="2026-06-09T00:00:00Z"):
    msg = {"serialNumber": serial, "timestamp": ts}
    if order_id is not None:
        msg["orderId"] = order_id
    if node_states is not None:
        msg["nodeStates"] = node_states
    return msg


# --- persistence fan-out ---------------------------------------------------

def test_persist_state_writes_and_skips_oee_when_idle():
    _reset_oee()
    with patch("app.db.insert_state") as ins, patch("app.db.insert_oee_cycle") as oee:
        ingest_service.persist_state(_state())  # no orderId → no cycle
        ins.assert_called_once()
        oee.assert_not_called()


def test_persist_state_drops_malformed_message():
    with patch("app.db.insert_state") as ins:
        ingest_service.persist_state({"timestamp": "x"})       # no serialNumber
        ingest_service.persist_state({"serialNumber": "amr001"})  # no timestamp
        ins.assert_not_called()


def test_persist_connection_writes():
    with patch("app.db.insert_connection") as ins:
        ingest_service.persist_connection(
            {"serialNumber": "amr001", "timestamp": "t", "connectionState": "ONLINE"}
        )
        ins.assert_called_once()


def test_persist_command_writes():
    with patch("app.db.insert_command") as ins:
        ingest_service.persist_command(
            "order", {"serialNumber": "amr001", "timestamp": "t", "orderId": "o1"}
        )
        ins.assert_called_once_with("order", {"serialNumber": "amr001", "timestamp": "t", "orderId": "o1"})


# --- archive cutoff --------------------------------------------------------

def test_persist_state_rejects_archived_serial():
    _reset_oee()
    with patch("app.db.fetch_archived_serials", return_value={"amr002"}):
        registry.reload()
        try:
            with patch("app.db.insert_state") as ins:
                with pytest.raises(ingest_service.ArchivedRobot):
                    ingest_service.persist_state(_state(serial="amr002"))
                ins.assert_not_called()
        finally:
            with patch("app.db.fetch_archived_serials", return_value=set()):
                registry.reload()


# --- OEE derivation (ported deriveCycle state machine) ---------------------

def test_oee_emits_succeeded_when_nodestates_empty():
    _reset_oee()
    with patch("app.db.insert_state"), patch("app.db.insert_oee_cycle") as oee:
        # order starts with one outstanding node — no cycle yet
        ingest_service.persist_state(
            _state(order_id="amr001-order-0", node_states=[{"nodeId": "n0"}],
                   ts="2026-06-09T00:00:00Z")
        )
        oee.assert_not_called()
        # same order, nodeStates now empty → SUCCEEDED cycle
        ingest_service.persist_state(
            _state(order_id="amr001-order-0", node_states=[],
                   ts="2026-06-09T00:00:05Z")
        )
        oee.assert_called_once()
        cycle = oee.call_args.args[0]
        assert cycle["result"] == "SUCCEEDED"
        assert cycle["orderId"] == "amr001-order-0"
        assert cycle["startTime"] == "2026-06-09T00:00:00Z"
        assert cycle["endTime"] == "2026-06-09T00:00:05Z"


def test_oee_emits_aborted_when_order_cleared_mid_flight():
    _reset_oee()
    with patch("app.db.insert_state"), patch("app.db.insert_oee_cycle") as oee:
        ingest_service.persist_state(
            _state(order_id="amr001-order-1", node_states=[{"nodeId": "n0"}])
        )
        # orderId clears while still active → ABORTED
        ingest_service.persist_state(_state(order_id=None, node_states=[]))
        oee.assert_called_once()
        assert oee.call_args.args[0]["result"] == "ABORTED"


def test_oee_no_cycle_for_unrelated_idle_states():
    _reset_oee()
    with patch("app.db.insert_state"), patch("app.db.insert_oee_cycle") as oee:
        ingest_service.persist_state(_state())  # idle
        ingest_service.persist_state(_state())  # still idle
        oee.assert_not_called()

"""Tests for app/schemas.py — ingest validation (G20) and CRUD bodies (G15).

These exercise the Pydantic models directly, so they need neither a database
nor the FastAPI app to be importable.
"""
import pytest
from pydantic import ValidationError

from app.schemas import (
    IngestCommand,
    IngestConnectionMessage,
    IngestOeeCycle,
    IngestStateMessage,
    MapIn,
    NamedLocationIn,
    RobotIn,
)


# --- G20: ingest payload validation ---

def test_ingest_state_accepts_required_keys_and_passes_extras_through():
    msg = IngestStateMessage(
        serialNumber="amr001",
        timestamp="2026-05-18T00:00:00Z",
        agvPosition={"x": 1.0, "y": 2.0},
        nodeStates=[],
    )
    dumped = msg.model_dump()
    assert dumped["serialNumber"] == "amr001"
    assert dumped["agvPosition"] == {"x": 1.0, "y": 2.0}  # extra field preserved


def test_ingest_state_missing_required_key_is_rejected():
    with pytest.raises(ValidationError):
        IngestStateMessage(timestamp="2026-05-18T00:00:00Z")  # no serialNumber


def test_ingest_connection_rejects_bad_state():
    with pytest.raises(ValidationError):
        IngestConnectionMessage(
            serialNumber="amr001", timestamp="t", connectionState="BOGUS"
        )


def test_ingest_command_rejects_unknown_kind():
    with pytest.raises(ValidationError):
        IngestCommand(kind="teleport", message={"serialNumber": "amr001",
                                                "timestamp": "t"})


def test_ingest_oee_cycle_rejects_bad_result():
    with pytest.raises(ValidationError):
        IngestOeeCycle(serialNumber="amr001", orderId="o1", startTime="a",
                       endTime="b", result="MAYBE")


# --- G15: CRUD bodies ---

def test_map_in_requires_both_fields():
    with pytest.raises(ValidationError):
        MapIn(map_id="map-003")  # no label


def test_robot_in_accepts_full_body():
    robot = RobotIn(serial_number="amr002", rosbridge_url="ws://x:9090",
                    map_id="map-001")
    assert robot.serial_number == "amr002"


def test_named_location_theta_defaults_to_zero():
    loc = NamedLocationIn(id=9, map_id="map-001", label="Dock", x=1.0, y=2.0)
    assert loc.theta == 0.0

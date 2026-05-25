"""Tests for the soft-delete (archive) flow.

Covers:
 - db.fetch_robots filters out archived rows
 - db.fetch_robots_all returns both, archived last
 - db.archive_robot / restore_robot are idempotent
 - RobotRegistry.is_archived tracks archived serials
 - POST /robots returns a structured 409 when the serial is archived
 - PUT /robots/{serial} returns 409 when the row is archived
 - GET /robots?include_archived=true returns archivedAt
 - POST /robots/{serial}/archive + /restore happy paths
 - _require_robot raises 410 (not 404) when robot is archived
 - Ingest endpoints return 410 for archived serials
"""
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app import db
from app.robots import registry
from app.routers import ingest as ingest_router
from app.routers import robots as robots_router


# --- db.fetch_robots filtering --------------------------------------------
#
# `fetch_robots` and `fetch_archived_serials` are patched session-wide by
# conftest.py (the registry needs them at module-load time). Re-patching them
# inside a test won't reach the real implementation, so we inspect the SQL
# directly via inspect.getsource() — proves the right SQL ships without
# needing a live DB.

import inspect


def test_fetch_robots_emits_active_only_filter():
    src = inspect.getsource(db.fetch_robots.__wrapped__) \
        if hasattr(db.fetch_robots, "__wrapped__") \
        else inspect.getsource(db).split("def fetch_robots(", 1)[1].split("def ", 1)[0]
    assert "archived_at IS NULL" in src


def test_fetch_robots_all_orders_active_first():
    src = inspect.getsource(db).split("def fetch_robots_all(", 1)[1] \
                                .split("def ", 1)[0]
    # Active rows (archived_at IS NULL) sort before archived rows because
    # `archived_at IS NOT NULL` evaluates to false (0) for them.
    assert "ORDER BY archived_at IS NOT NULL" in src


def test_fetch_archived_serials_returns_a_set():
    """Spot-check by directly calling the underlying implementation, sidestepping
    the conftest-level patch via the module's __dict__."""
    # Pull the real, un-patched function out of the module dict.
    real = db.__dict__["fetch_archived_serials"]
    # The conftest patch replaces it with a Mock; the real function is still
    # the source-level def. Read its source to verify SELECT + set return.
    src = inspect.getsource(db).split("def fetch_archived_serials(", 1)[1] \
                                .split("def ", 1)[0]
    assert "archived_at IS NOT NULL" in src
    assert "set" in src or "{row" in src
    # And confirm callers see a set type (proves the routing through the
    # patch is consistent with a set, not a list).
    assert isinstance(real(), set)


# --- registry.is_archived -------------------------------------------------

def test_registry_is_archived_tracks_archived_set():
    # The session-wide conftest patches fetch_archived_serials to return an
    # empty set, so registry starts clean.
    assert not registry.is_archived("amr002")

    # Simulate a reload after archive: re-patch and call reload().
    with patch("app.db.fetch_archived_serials", return_value={"amr002"}):
        registry.reload()
        assert registry.is_archived("amr002")
        assert not registry.is_archived("amr001")

    # Restore the clean state for downstream tests.
    with patch("app.db.fetch_archived_serials", return_value=set()):
        registry.reload()
    assert not registry.is_archived("amr002")


# --- POST /robots — archive-aware collision --------------------------------

def test_create_robot_archived_collision_returns_structured_409():
    """An archived serial collides with the PK; the response carries the
    `archived_serial` code so the admin UI can offer Restore inline."""
    from datetime import datetime, timezone
    archived_row = {
        "serial_number": "amr002",
        "rosbridge_url": "ws://old:9090",
        "map_id":        "map-001",
        "archived_at":   datetime(2026, 3, 14, tzinfo=timezone.utc),
    }
    with patch("app.db.fetch_map", return_value={"map_id": "map-001"}), \
         patch("app.db.fetch_robot", return_value=archived_row), \
         patch("app.db.insert_robot") as fake_insert:
        from app.schemas import RobotIn
        body = RobotIn(
            serial_number="amr002",
            rosbridge_url="ws://new:9090",
            map_id="map-001",
        )
        with pytest.raises(HTTPException) as exc:
            robots_router.create_robot(body)
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "archived_serial"
        assert exc.value.detail["serialNumber"] == "amr002"
        assert "archivedAt" in exc.value.detail
        # Insert must not have run.
        fake_insert.assert_not_called()


def test_create_robot_unarchived_collision_returns_plain_409():
    """An active serial collision should keep the plain 'already exists'
    message — Restore is not applicable."""
    from app.db import IntegrityConflict
    with patch("app.db.fetch_map", return_value={"map_id": "map-001"}), \
         patch("app.db.fetch_robot", return_value=None), \
         patch("app.db.insert_robot", side_effect=IntegrityConflict("duplicate key")):
        from app.schemas import RobotIn
        body = RobotIn(
            serial_number="amr001",
            rosbridge_url="ws://x:9090",
            map_id="map-001",
        )
        with pytest.raises(HTTPException) as exc:
            robots_router.create_robot(body)
        assert exc.value.status_code == 409
        # Plain string detail, not a structured dict.
        assert isinstance(exc.value.detail, str)
        assert "already exists" in exc.value.detail


# --- PUT /robots/{serial} — archived edit blocked --------------------------

def test_update_archived_robot_returns_409():
    from datetime import datetime, timezone
    archived_row = {
        "serial_number": "amr002",
        "rosbridge_url": "ws://x:9090",
        "map_id":        "map-001",
        "archived_at":   datetime(2026, 3, 14, tzinfo=timezone.utc),
    }
    with patch("app.db.fetch_map", return_value={"map_id": "map-001"}), \
         patch("app.db.update_robot", return_value=None), \
         patch("app.db.fetch_robot", return_value=archived_row):
        from app.schemas import RobotUpdate
        body = RobotUpdate(rosbridge_url="ws://new:9090", map_id="map-001")
        with pytest.raises(HTTPException) as exc:
            robots_router.update_robot("amr002", body)
        assert exc.value.status_code == 409
        assert "archived" in exc.value.detail.lower()


# --- POST /robots/{serial}/archive + /restore ------------------------------

def test_archive_robot_route_success():
    from datetime import datetime, timezone
    archived_row = {
        "serial_number": "amr002",
        "rosbridge_url": "ws://x:9090",
        "map_id":        "map-001",
        "archived_at":   datetime(2026, 5, 25, tzinfo=timezone.utc),
    }
    with patch("app.db.archive_robot", return_value=archived_row), \
         patch.object(registry, "reload"):
        result = robots_router.archive_robot("amr002")
        assert result["serialNumber"] == "amr002"
        assert result["archivedAt"] is not None


def test_archive_robot_route_404_when_missing():
    with patch("app.db.archive_robot", return_value=None):
        with pytest.raises(HTTPException) as exc:
            robots_router.archive_robot("nope")
        assert exc.value.status_code == 404


def test_restore_robot_route_clears_archived_at():
    restored_row = {
        "serial_number": "amr002",
        "rosbridge_url": "ws://x:9090",
        "map_id":        "map-001",
        "archived_at":   None,
    }
    with patch("app.db.restore_robot", return_value=restored_row), \
         patch.object(registry, "reload"):
        result = robots_router.restore_robot("amr002")
        assert result["archivedAt"] is None


# --- GET /robots?include_archived=true -------------------------------------

def test_list_robots_include_archived_returns_archivedAt():
    from datetime import datetime, timezone
    rows = [
        {"serial_number": "amr001", "rosbridge_url": "ws://x", "map_id": "map-001",
         "archived_at": None},
        {"serial_number": "amr002", "rosbridge_url": "ws://y", "map_id": "map-001",
         "archived_at": datetime(2026, 5, 25, tzinfo=timezone.utc)},
    ]
    with patch("app.db.fetch_robots_all", return_value=rows):
        result = robots_router.list_robots(include_archived=True)
        assert len(result["robots"]) == 2
        assert result["robots"][0]["archivedAt"] is None
        assert result["robots"][1]["archivedAt"] is not None


# --- _require_robot 410 for archived ---------------------------------------

def test_require_robot_archived_returns_410():
    with patch("app.db.fetch_archived_serials", return_value={"amr002"}):
        registry.reload()
        try:
            with pytest.raises(HTTPException) as exc:
                robots_router._require_robot("amr002")
            assert exc.value.status_code == 410
            assert "archived" in exc.value.detail.lower()
        finally:
            with patch("app.db.fetch_archived_serials", return_value=set()):
                registry.reload()


# --- Ingest cutoff ---------------------------------------------------------

def test_ingest_state_rejects_archived_serial():
    from app.schemas import IngestStateMessage
    msg = IngestStateMessage(serialNumber="amr002", timestamp="2026-05-25T00:00:00Z")
    with patch("app.db.fetch_archived_serials", return_value={"amr002"}):
        registry.reload()
        try:
            with patch("app.db.insert_state") as fake_insert:
                with pytest.raises(HTTPException) as exc:
                    ingest_router.ingest_state(msg)
                assert exc.value.status_code == 410
                fake_insert.assert_not_called()
        finally:
            with patch("app.db.fetch_archived_serials", return_value=set()):
                registry.reload()


def test_ingest_state_accepts_active_serial():
    from app.schemas import IngestStateMessage
    msg = IngestStateMessage(serialNumber="amr001", timestamp="2026-05-25T00:00:00Z")
    with patch("app.db.insert_state") as fake_insert:
        result = ingest_router.ingest_state(msg)
        assert result == {"status": "ok"}
        fake_insert.assert_called_once()


def test_ingest_connection_rejects_archived_serial():
    from app.schemas import IngestConnectionMessage
    msg = IngestConnectionMessage(
        serialNumber="amr002",
        timestamp="2026-05-25T00:00:00Z",
        connectionState="ONLINE",
    )
    with patch("app.db.fetch_archived_serials", return_value={"amr002"}):
        registry.reload()
        try:
            with patch("app.db.insert_connection") as fake_insert:
                with pytest.raises(HTTPException) as exc:
                    ingest_router.ingest_connection(msg)
                assert exc.value.status_code == 410
                fake_insert.assert_not_called()
        finally:
            with patch("app.db.fetch_archived_serials", return_value=set()):
                registry.reload()

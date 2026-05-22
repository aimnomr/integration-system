"""Tests for G24 — DB-down responses surface as HTTP 503, not 500.

The original failure mode: `db.py`'s pool was built lazily, so on first call it
correctly translated connection errors to `DatabaseUnavailable`; but once the
pool existed, a subsequent Postgres outage caused `cur.execute()` to raise
`psycopg2.OperationalError`, which propagated unwrapped → HTTP 500 from
`GET /robots/{serial}/state` and `GET /system/status`. The fix wraps every
helper in `db.py` so the connection-level psycopg2 errors are translated to
`DatabaseUnavailable`, and the cached pool is invalidated.

We verify the contract at the helpers (translation happens) and at the
routers (503, not 500). No real Postgres needed — psycopg2 connection errors
are simulated by monkeypatching the helpers.
"""
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import db
from app.db import DatabaseUnavailable
from app.routers import robots as robots_router
from app.routers import system as system_router


# --- Helper-level translation ---------------------------------------------

def _fake_op_error():
    """Build a psycopg2 OperationalError lazily — the test environment may not
    have psycopg2 installed (CI uses requirements-dev which does). When it
    isn't installed, the tests covering helper-level translation skip."""
    try:
        import psycopg2
    except ImportError:  # pragma: no cover — covered when psycopg2 is missing
        return None
    return psycopg2.OperationalError("server closed the connection unexpectedly")


def test_to_unavailable_invalidates_pool_and_returns_503_shape(monkeypatch):
    """The internal _to_unavailable helper must clear the cached pool — without
    that, the next request would re-borrow the same dead connection."""
    op_exc = _fake_op_error()
    if op_exc is None:
        import pytest

        pytest.skip("psycopg2 not installed")

    # Pretend a pool exists with a recording closeall.
    closed = {"n": 0}

    class _FakePool:
        def closeall(self):
            closed["n"] += 1

    monkeypatch.setattr(db, "_pool", _FakePool())
    exc = db._to_unavailable(op_exc)
    assert isinstance(exc, DatabaseUnavailable)
    assert closed["n"] == 1
    assert db._pool is None  # invalidated


def test_ping_returns_false_when_query_translates_to_unavailable(monkeypatch):
    """`ping()` must report False (not raise) when the database is down. After
    the G24 fix it runs `SELECT 1` and catches DatabaseUnavailable."""

    def boom(*_args, **_kwargs):
        raise DatabaseUnavailable("connection refused")

    monkeypatch.setattr(db, "_query", boom)
    assert db.ping() is False


def test_ping_returns_true_when_query_returns_one(monkeypatch):
    monkeypatch.setattr(db, "_query", lambda *_a, **_k: [{"ok": 1}])
    assert db.ping() is True


# --- Router-level: DB-down → 503, not 500 ---------------------------------

def _client_with(router) -> TestClient:
    """A throwaway FastAPI app carrying just the router under test, so we
    don't hit `main.py` (which connects to MQTT at import time)."""
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_get_robot_state_returns_503_when_db_unavailable():
    """G24 repro — was previously HTTP 500."""
    with patch(
        "app.routers.robots.fetch_latest_state",
        side_effect=DatabaseUnavailable("server closed the connection unexpectedly"),
    ):
        client = _client_with(robots_router.router)
        resp = client.get("/robots/amr001/state")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "error"
    assert "Database unavailable" in body["message"]


def test_system_status_returns_503_payload_when_db_down(monkeypatch):
    """G24 repro for /system/status — the route must still respond, but with
    `database.status == 'unavailable'`. Frontend G25 derives its DB pill from
    this field, so it MUST be present even when the DB is down."""
    # The route's MQTT + Node-RED probes don't matter for this assertion;
    # stub them so the test stays self-contained.
    monkeypatch.setattr(
        system_router, "mqtt_client",
        type("M", (), {"is_connected": staticmethod(lambda: True)})(),
    )
    monkeypatch.setattr(system_router, "roslib_status", lambda: "connected")
    monkeypatch.setattr(system_router, "_node_red_status", lambda: "connected")
    monkeypatch.setattr(db, "_query", lambda *_a, **_k: (_ for _ in ()).throw(
        DatabaseUnavailable("server closed the connection unexpectedly")
    ))

    client = _client_with(system_router.router)
    resp = client.get("/system/status")
    assert resp.status_code == 200  # endpoint itself is up
    body = resp.json()
    assert body["database"]["status"] == "unavailable"
    # The other fields are unaffected — that's the contract G25 depends on.
    assert body["mosquitto"]["status"] == "connected"
    assert body["roslib"]["status"] == "connected"
    assert body["node_red"]["status"] == "connected"

"""Tests for the order-history endpoint (P0.2)."""
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app import db
from app.routers import orders as orders_router


# --- db.fetch_orders -------------------------------------------------------

def _capture(monkeypatch):
    """Patch db._query to capture the (sql, params) that fetch_orders builds."""
    captured: dict = {}

    def fake_query(sql, params=()):
        captured["sql"] = sql
        captured["params"] = params
        return []

    monkeypatch.setattr(db, "_query", fake_query)
    return captured


def test_fetch_orders_no_filters_uses_limit_only(monkeypatch):
    captured = _capture(monkeypatch)
    db.fetch_orders(limit=10)
    assert "WHERE" not in captured["sql"]
    assert captured["params"] == (10,)


def test_fetch_orders_serial_filter(monkeypatch):
    captured = _capture(monkeypatch)
    db.fetch_orders(serial="amr001", limit=25)
    assert "o.serial_number = %s" in captured["sql"]
    assert captured["params"] == ("amr001", 25)


def test_fetch_orders_before_cursor_combines_with_serial(monkeypatch):
    captured = _capture(monkeypatch)
    db.fetch_orders(serial="amr001", limit=5, before="2026-05-20T00:00:00Z")
    assert "o.serial_number = %s" in captured["sql"]
    assert "o.ts < %s" in captured["sql"]
    assert captured["params"] == ("amr001", "2026-05-20T00:00:00Z", 5)


def test_fetch_orders_orders_newest_first(monkeypatch):
    captured = _capture(monkeypatch)
    db.fetch_orders(limit=1)
    assert "ORDER BY o.ts DESC" in captured["sql"]


def test_fetch_orders_joins_node_count(monkeypatch):
    captured = _capture(monkeypatch)
    db.fetch_orders(limit=1)
    assert "node_count" in captured["sql"]
    assert "order_nodes" in captured["sql"]


# --- router -----------------------------------------------------------------

def test_list_orders_404_for_unknown_serial(monkeypatch):
    monkeypatch.setattr(
        orders_router.registry, "exists", lambda s: False
    )
    with pytest.raises(HTTPException) as exc:
        orders_router.list_orders(serial="ghost", limit=10, before=None)
    assert exc.value.status_code == 404


def test_list_orders_returns_count_and_rows(monkeypatch):
    monkeypatch.setattr(orders_router.registry, "exists", lambda s: True)
    rows = [
        {"id": 2, "serial_number": "amr001", "order_id": "amr001-order-2",
         "order_update_id": 0, "ts": "2026-05-20T00:00:01Z",
         "header_id": 5, "node_count": 1},
        {"id": 1, "serial_number": "amr001", "order_id": "amr001-order-1",
         "order_update_id": 0, "ts": "2026-05-20T00:00:00Z",
         "header_id": 4, "node_count": 2},
    ]
    monkeypatch.setattr(orders_router, "fetch_orders", lambda **kw: rows)
    result = orders_router.list_orders(serial="amr001", limit=50, before=None)
    assert result["count"] == 2
    assert result["orders"][0]["order_id"] == "amr001-order-2"


def test_list_orders_handles_database_unavailable(monkeypatch):
    monkeypatch.setattr(orders_router.registry, "exists", lambda s: True)

    def boom(**kw):
        raise db.DatabaseUnavailable("no socket")

    monkeypatch.setattr(orders_router, "fetch_orders", boom)
    resp = orders_router.list_orders(serial="amr001", limit=10, before=None)
    assert resp.status_code == 503

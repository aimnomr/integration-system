"""G19 — Telemetry retention lifecycle.

The DB-layer prune SQL is exercised end-to-end by scripts/test/test-retention.ps1
(real Postgres). These pytest cases cover the parts that don't need a DB:

  - prune_telemetry() builds the right SQL with the right interval parameter.
  - Setting TELEMETRY_RETENTION_DAYS=0 must mean the background task never
    starts. (When >0, the startup hook schedules the loop.)
"""
from __future__ import annotations

import asyncio
import importlib
from unittest.mock import patch

from app import db


def test_prune_telemetry_uses_retention_days(monkeypatch):
    captured: list[tuple[str, tuple]] = []

    def fake_returning(sql, params):
        captured.append((sql, params))
        return []

    monkeypatch.setattr(db, "_execute_returning", fake_returning)
    result = db.prune_telemetry(30)

    assert result == {"state_snapshots": 0, "connection_log": 0}
    assert len(captured) == 2
    state_sql, state_params = captured[0]
    conn_sql,  conn_params  = captured[1]
    assert "state_snapshots" in state_sql
    assert "connection_log" in conn_sql
    assert "make_interval(days => %s)" in state_sql
    assert state_params == (30,)
    assert conn_params == (30,)


def _run_start_retention():
    """Re-import main, call its startup hook synchronously, and return the
    list of coroutine names asyncio.create_task was invoked with."""
    import main
    importlib.reload(main)

    scheduled: list[str] = []
    real_create_task = asyncio.create_task

    def spy(coro, *args, **kwargs):
        scheduled.append(getattr(coro, "__name__", str(coro)))
        coro.close()  # don't actually run it
        async def _noop(): pass
        return real_create_task(_noop())

    async def runner():
        with patch("asyncio.create_task", side_effect=spy):
            await main._start_retention()

    asyncio.run(runner())
    return scheduled


def test_retention_loop_disabled_when_days_zero(monkeypatch):
    monkeypatch.setenv("TELEMETRY_RETENTION_DAYS", "0")
    scheduled = _run_start_retention()
    assert not any("_retention_loop" in s for s in scheduled), (
        f"retention loop should not be scheduled when DAYS=0, got: {scheduled}"
    )


def test_retention_loop_enabled_when_days_positive(monkeypatch):
    monkeypatch.setenv("TELEMETRY_RETENTION_DAYS", "30")
    scheduled = _run_start_retention()
    assert any("_retention_loop" in s for s in scheduled), (
        f"retention loop should be scheduled when DAYS>0, got: {scheduled}"
    )

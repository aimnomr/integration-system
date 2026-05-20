"""Tests for app/ratelimit.py — per-client rate limiting (G11)."""
import asyncio

import pytest
from starlette.requests import Request
from starlette.responses import PlainTextResponse

from app import ratelimit
from app.ratelimit import rate_limit_middleware


def _request(path="/robots", client="1.2.3.4"):
    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": [],
        "client": (client, 1234),
        "scheme": "http",
        "server": ("test", 80),
        "query_string": b"",
    }
    return Request(scope)


async def _ok(_request):
    return PlainTextResponse("ok")


def _call(request):
    return asyncio.run(rate_limit_middleware(request, _ok))


@pytest.fixture(autouse=True)
def clear_hits():
    ratelimit._hits.clear()
    yield
    ratelimit._hits.clear()


def test_under_limit_passes(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "5")
    for _ in range(5):
        assert _call(_request()).status_code == 200


def test_over_limit_returns_429(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "3")
    for _ in range(3):
        _call(_request())
    resp = _call(_request())
    assert resp.status_code == 429
    assert "retry-after" in resp.headers


def test_disabled_when_zero(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "0")
    for _ in range(50):
        assert _call(_request()).status_code == 200


def test_ingest_path_is_exempt(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "1")
    for _ in range(10):
        assert _call(_request(path="/ingest/state")).status_code == 200


def test_clients_are_limited_independently(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "2")
    for _ in range(2):
        _call(_request(client="1.1.1.1"))
    # 1.1.1.1 is now at its limit; a different client is still unaffected.
    assert _call(_request(client="1.1.1.1")).status_code == 429
    assert _call(_request(client="2.2.2.2")).status_code == 200

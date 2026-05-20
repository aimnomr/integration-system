"""Tests for CORSMiddleware configuration (G18 / P0.1).

main.py is not imported here — it would try to connect to MQTT at import time.
Instead we build a minimal FastAPI app with the same middleware configuration
to verify the preflight + actual-response headers are emitted correctly.
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient


def _build_app(env: str | None) -> TestClient:
    origins = [
        o.strip()
        for o in (env or "http://localhost:5173").split(",")
        if o.strip()
    ]
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/ping")
    def ping():
        return {"ok": True}

    return TestClient(app)


def test_default_origin_is_vite_dev_server():
    client = _build_app(None)
    resp = client.get("/ping", headers={"Origin": "http://localhost:5173"})
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_other_origin_rejected_when_not_listed():
    client = _build_app("http://localhost:5173")
    resp = client.get("/ping", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in resp.headers


def test_preflight_returns_allow_headers():
    client = _build_app("http://localhost:5173")
    resp = client.options(
        "/ping",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-api-key",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "GET" in resp.headers.get("access-control-allow-methods", "")


def test_comma_separated_origins_are_split():
    env = "http://localhost:5173,http://localhost:4173"
    client = _build_app(env)
    for origin in ("http://localhost:5173", "http://localhost:4173"):
        resp = client.get("/ping", headers={"Origin": origin})
        assert resp.headers["access-control-allow-origin"] == origin

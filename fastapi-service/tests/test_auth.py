"""Tests for app/auth.py — API-key authentication (G10)."""
import pytest
from fastapi import HTTPException

from app.auth import require_api_key


def test_no_key_configured_is_noop(monkeypatch):
    """With API_KEY unset, auth is disabled — any header value passes."""
    monkeypatch.delenv("API_KEY", raising=False)
    assert require_api_key(None) is None
    assert require_api_key("anything") is None


def test_matching_key_passes(monkeypatch):
    monkeypatch.setenv("API_KEY", "secret")
    assert require_api_key("secret") is None


def test_wrong_key_rejected(monkeypatch):
    monkeypatch.setenv("API_KEY", "secret")
    with pytest.raises(HTTPException) as exc:
        require_api_key("wrong")
    assert exc.value.status_code == 401


def test_missing_header_rejected(monkeypatch):
    monkeypatch.setenv("API_KEY", "secret")
    with pytest.raises(HTTPException) as exc:
        require_api_key(None)
    assert exc.value.status_code == 401

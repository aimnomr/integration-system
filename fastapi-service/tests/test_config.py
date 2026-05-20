"""Tests for app/config.py — startup env-var validation (G9)."""
import pytest

from app.config import ConfigError, validate_env


def test_passes_with_all_required(monkeypatch):
    monkeypatch.setenv("MQTT_BROKER", "localhost")
    monkeypatch.setenv("MQTT_PORT", "1883")
    validate_env()  # no exception raised


def test_missing_broker_raises(monkeypatch):
    monkeypatch.delenv("MQTT_BROKER", raising=False)
    monkeypatch.setenv("MQTT_PORT", "1883")
    with pytest.raises(ConfigError):
        validate_env()


def test_missing_port_raises(monkeypatch):
    monkeypatch.setenv("MQTT_BROKER", "localhost")
    monkeypatch.delenv("MQTT_PORT", raising=False)
    with pytest.raises(ConfigError):
        validate_env()


def test_non_integer_port_raises(monkeypatch):
    monkeypatch.setenv("MQTT_BROKER", "localhost")
    monkeypatch.setenv("MQTT_PORT", "not-a-number")
    with pytest.raises(ConfigError):
        validate_env()

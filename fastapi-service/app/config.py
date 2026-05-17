"""Startup environment-variable validation.

Called once from main.py after load_dotenv(). Required vars with no safe default
are checked here so a misconfiguration fails fast with a clear message, instead of
an obscure error deep in module import (e.g. int(None) when MQTT_PORT is unset).

DB_* vars are intentionally not checked — db.py supplies safe defaults for them.
"""
import os

_REQUIRED = ("MQTT_BROKER", "MQTT_PORT")


class ConfigError(RuntimeError):
    """Raised at startup when a required environment variable is missing or invalid."""


def validate_env() -> None:
    missing = [name for name in _REQUIRED if not os.getenv(name)]
    if missing:
        raise ConfigError(
            f"Missing required environment variable(s): {', '.join(missing)}. "
            "Copy fastapi-service/.env.example to .env and fill them in."
        )
    port = os.getenv("MQTT_PORT")
    try:
        int(port)
    except ValueError:
        raise ConfigError(f"MQTT_PORT must be an integer, got {port!r}.") from None

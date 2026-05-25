"""Session-wide test setup.

Why this file exists
--------------------
`app/robots.py` constructs `registry = RobotRegistry()` at module load. The
constructor calls `db.fetch_fleet_config()` + `db.fetch_robots()` + the two
counter-seed reads, which need a live PostgreSQL — fine in production (DB is
authoritative; service is meant to fail-fast without it), but in CI there is
no PostgreSQL service, so any test file that imports a router transitively
triggers this and the test collection aborts with `DatabaseUnavailable`.

Same problem applies to `app/mqtt.py`, which calls `mqtt_client.connect()` at
module import. Without a running Mosquitto the import fails outright. We patch
`paho.mqtt.client.Client` to a MagicMock-returning stub before app modules are
imported, so module-level connect/loop_start are no-ops in tests.

`conftest.py` is loaded by pytest before any test file. We start the patches
here so the module-level `registry = RobotRegistry()` and the MQTT connect
both succeed against stubs — letting routers be imported and exercised without
real backing services.

The DB functions covered are exactly the ones `RobotRegistry.__init__`
touches; other DB calls in routers can still be patched per-test if needed.
"""
import os
from unittest.mock import MagicMock, patch

# MQTT env vars must be set before app.mqtt is imported (it reads them at
# module load via int(os.getenv("MQTT_PORT")) — None would raise TypeError).
os.environ.setdefault("MQTT_BROKER", "localhost")
os.environ.setdefault("MQTT_PORT", "1883")

# Stub paho.mqtt.client.Client so connect()/loop_start() at app.mqtt import
# time are no-ops. Started before any app.* import.
_mqtt_patch = patch("paho.mqtt.client.Client", return_value=MagicMock())
_mqtt_patch.start()

_FAKE_FLEET = {
    "interface_name": "amr",
    "major_version":  "v2",
    "version":        "2.0.0",
    "manufacturer":   "moverobotic",
}

_FAKE_ROBOTS = [
    {
        "serial_number": "amr001",
        "rosbridge_url": "ws://localhost:9090",
        "map_id":        "map-001",
    },
]

# Started immediately at module load — before any test file is collected, so
# the module-level RobotRegistry() inside app/robots.py sees the stubs.
_patches = [
    patch("app.db.fetch_fleet_config",       return_value=_FAKE_FLEET),
    patch("app.db.fetch_robots",             return_value=_FAKE_ROBOTS),
    patch("app.db.fetch_max_header_ids",     return_value={}),
    patch("app.db.fetch_max_order_suffixes", return_value={}),
    # Soft-delete: RobotRegistry._load() reads archived serials at startup.
    # Default to an empty set so the registry behaves as it did pre-archive
    # (no archived robots). Per-test overrides patch this with a real set.
    patch("app.db.fetch_archived_serials",   return_value=set()),
]
for _p in _patches:
    _p.start()

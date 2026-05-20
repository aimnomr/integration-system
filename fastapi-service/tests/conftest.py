"""Session-wide test setup.

Why this file exists
--------------------
`app/robots.py` constructs `registry = RobotRegistry()` at module load. The
constructor calls `db.fetch_fleet_config()` + `db.fetch_robots()` + the two
counter-seed reads, which need a live PostgreSQL — fine in production (DB is
authoritative; service is meant to fail-fast without it), but in CI there is
no PostgreSQL service, so any test file that imports a router transitively
triggers this and the test collection aborts with `DatabaseUnavailable`.

`conftest.py` is loaded by pytest before any test file. We start the patches
here so the module-level `registry = RobotRegistry()` succeeds against the
canned fleet — letting routers be imported and exercised without a real DB.

The four DB functions covered are exactly the ones `RobotRegistry.__init__`
touches; other DB calls in routers can still be patched per-test if needed.
"""
from unittest.mock import patch

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
]
for _p in _patches:
    _p.start()

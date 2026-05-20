"""Robot registry — loaded from the database (the single source of truth).

The fleet definition lives in the `fleet_config` and `robots` tables. This registry
loads them once at startup; if the database is unavailable the service cannot start
(by design — the DB is authoritative for the fleet). `reload()` re-reads it after a
reference-data CRUD write (G15) so the in-memory copy stays current.

The registry also holds the per-robot monotonic counters the FMS gateway needs:
VDA5050 headerId (per topic) and orderId. These are seeded from the database at
startup (G21) so a FastAPI restart resumes them rather than resetting to 0.
"""
from threading import Lock

from . import db


class RobotRegistry:
    def __init__(self) -> None:
        self._lock = Lock()
        self._header_counters: dict[tuple[str, str], int] = {}
        self._order_counters: dict[str, int] = {}
        self._load()
        self._seed_counters()

    def _load(self) -> None:
        """(Re)read the fleet definition from the database."""
        fleet = db.fetch_fleet_config()
        self.interface_name: str = fleet["interface_name"]
        self.major_version: str = fleet["major_version"]
        self.version: str = fleet["version"]
        self.manufacturer: str = fleet["manufacturer"]

        self._robots: dict[str, dict] = {
            row["serial_number"]: {
                "serialNumber": row["serial_number"],
                "rosbridgeUrl": row["rosbridge_url"],
                "mapId": row["map_id"],
            }
            for row in db.fetch_robots()
        }

    def _seed_counters(self) -> None:
        """Resume the headerId / orderId counters from persisted history (G21).
        next_header_id / next_order_id return the stored value then increment,
        so the resume point is the persisted maximum + 1."""
        try:
            for key, max_id in db.fetch_max_header_ids().items():
                self._header_counters[key] = max_id + 1
            for serial, max_n in db.fetch_max_order_suffixes().items():
                self._order_counters[serial] = max_n + 1
        except db.DatabaseUnavailable:
            pass  # no DB → start from 0 (unchanged pre-G21 behaviour)

    def reload(self) -> None:
        """Re-read the fleet definition after a robots / fleet_config CRUD write.
        The monotonic counters are deliberately left untouched."""
        with self._lock:
            self._load()

    def list(self) -> list[dict]:
        return [
            {
                "serialNumber": serial,
                "manufacturer": self.manufacturer,
                "mapId": robot["mapId"],
                "rosbridgeUrl": robot["rosbridgeUrl"],
            }
            for serial, robot in self._robots.items()
        ]

    def fleet(self) -> dict:
        """The full fleet definition, in the shape the ROS Bridge expects from
        GET /fleet."""
        return {
            "interfaceName": self.interface_name,
            "majorVersion": self.major_version,
            "version": self.version,
            "manufacturer": self.manufacturer,
            "robots": [
                {
                    "serialNumber": robot["serialNumber"],
                    "rosbridgeUrl": robot["rosbridgeUrl"],
                    "mapId": robot["mapId"],
                }
                for robot in self._robots.values()
            ],
        }

    def get(self, serial: str) -> dict | None:
        return self._robots.get(serial)

    def exists(self, serial: str) -> bool:
        return serial in self._robots

    def next_header_id(self, serial: str, topic: str) -> int:
        """Next headerId — increments per topic, per robot."""
        with self._lock:
            key = (serial, topic)
            value = self._header_counters.get(key, 0)
            self._header_counters[key] = value + 1
            return value

    def next_order_id(self, serial: str) -> str:
        with self._lock:
            value = self._order_counters.get(serial, 0)
            self._order_counters[serial] = value + 1
            return f"{serial}-order-{value}"


registry = RobotRegistry()

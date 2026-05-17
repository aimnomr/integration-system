"""Robot registry — loaded from the shared robots.config.json.

This is the same file the ROS Bridge Service uses. The path is configurable via the
ROBOTS_CONFIG env var; it defaults to ../ros-bridge-service/robots.config.json
relative to the project root.

The registry also holds the per-robot monotonic counters the FMS gateway needs:
VDA5050 headerId (per topic) and orderId.
"""
import json
import os
from pathlib import Path
from threading import Lock

_DEFAULT_CONFIG = (
    Path(__file__).resolve().parents[2] / "ros-bridge-service" / "robots.config.json"
)


class RobotRegistry:
    def __init__(self) -> None:
        config_path = Path(os.getenv("ROBOTS_CONFIG", _DEFAULT_CONFIG))
        raw = json.loads(config_path.read_text(encoding="utf-8"))

        self.interface_name: str = raw["interfaceName"]
        self.major_version: str = raw["majorVersion"]
        self.version: str = raw["version"]
        self.manufacturer: str = raw["manufacturer"]
        self._robots: dict[str, dict] = {r["serialNumber"]: r for r in raw["robots"]}

        self._lock = Lock()
        self._header_counters: dict[tuple[str, str], int] = {}
        self._order_counters: dict[str, int] = {}

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

"""Fleet definition route.

The ROS Bridge Service fetches GET /fleet at startup to learn the fleet roster
and the fleet-wide VDA5050 identity — the database is the single source of truth,
and this endpoint is its gateway for the ROS Bridge.
"""
from fastapi import APIRouter

from ..robots import registry

router = APIRouter()


@router.get("/fleet")
def get_fleet():
    """The fleet definition: interfaceName, majorVersion, version, manufacturer,
    and the robot roster (serialNumber, rosbridgeUrl, mapId)."""
    return registry.fleet()

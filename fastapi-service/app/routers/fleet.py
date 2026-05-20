"""Fleet definition routes.

The ROS Bridge Service fetches GET /fleet at startup to learn the fleet roster
and the fleet-wide VDA5050 identity — the database is the single source of truth,
and this endpoint is its gateway for the ROS Bridge. PUT /fleet edits the single
`fleet_config` row (G15).
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import db
from ..db import DatabaseUnavailable
from ..robots import registry
from ..schemas import FleetConfigIn

router = APIRouter()


@router.get("/fleet")
def get_fleet():
    """The fleet definition: interfaceName, majorVersion, version, manufacturer,
    and the robot roster (serialNumber, rosbridgeUrl, mapId)."""
    return registry.fleet()


@router.put("/fleet")
def update_fleet(body: FleetConfigIn):
    """Update the fleet-wide VDA5050 identity (the single fleet_config row)."""
    try:
        row = db.update_fleet_config(
            body.interface_name, body.major_version, body.version, body.manufacturer
        )
    except DatabaseUnavailable as exc:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "message": f"Database unavailable: {exc}"},
        )
    registry.reload()
    return row

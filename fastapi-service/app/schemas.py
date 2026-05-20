from typing import Literal

from pydantic import BaseModel, ConfigDict


class Node(BaseModel):
    """One position in an order. theta is the heading in radians, map frame."""
    x: float
    y: float
    theta: float = 0.0


class OrderRequest(BaseModel):
    """An order by explicit positions — one node is a single goal, N a sequence."""
    nodes: list[Node]


class NamedOrderRequest(BaseModel):
    """An order by named-location IDs (resolved against the named_locations table)."""
    location_ids: list[int]


class InstantActionRequest(BaseModel):
    action_type: Literal["cancelOrder", "retryNode", "skipNode"]


# --- Ingest payloads (G20) -------------------------------------------------
#
# The /ingest/* routes used a raw `dict`; a payload missing a required key
# raised KeyError deep in db.py — an opaque HTTP 500. These models pin the
# required top-level keys so FastAPI returns a 422 naming the offending field.
# `extra="allow"` lets the variable-length VDA5050 arrays (nodeStates, nodes,
# errors, …) pass straight through to the db helpers unchanged.

class IngestStateMessage(BaseModel):
    model_config = ConfigDict(extra="allow")
    serialNumber: str
    timestamp: str


class IngestConnectionMessage(BaseModel):
    model_config = ConfigDict(extra="allow")
    serialNumber: str
    timestamp: str
    connectionState: Literal["ONLINE", "OFFLINE", "CONNECTIONBROKEN"]


class IngestCommandMessage(BaseModel):
    model_config = ConfigDict(extra="allow")
    serialNumber: str
    timestamp: str


class IngestCommand(BaseModel):
    kind: Literal["order", "instantActions"]
    message: IngestCommandMessage


class IngestOeeCycle(BaseModel):
    model_config = ConfigDict(extra="allow")
    serialNumber: str
    orderId: str
    startTime: str
    endTime: str
    result: Literal["SUCCEEDED", "ABORTED"]


# --- Reference-data CRUD bodies (G15) --------------------------------------

class MapIn(BaseModel):
    """Create body for a map. map_id follows the map-NNN convention."""
    map_id: str
    label: str


class MapUpdate(BaseModel):
    label: str


class RobotIn(BaseModel):
    serial_number: str
    rosbridge_url: str
    map_id: str


class RobotUpdate(BaseModel):
    rosbridge_url: str
    map_id: str


class NamedLocationIn(BaseModel):
    """Create body for a named location. theta is radians, map frame."""
    id: int
    map_id: str
    label: str
    x: float
    y: float
    theta: float = 0.0


class NamedLocationUpdate(BaseModel):
    map_id: str
    label: str
    x: float
    y: float
    theta: float = 0.0


class FleetConfigIn(BaseModel):
    interface_name: str
    major_version: str
    version: str
    manufacturer: str

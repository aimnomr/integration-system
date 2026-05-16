from pydantic import BaseModel


class Angle(BaseModel):
    x: float
    y: float
    z: float


class GoalRequest(BaseModel):
    x: float
    y: float
    angle: Angle


class NamedGoalRequest(BaseModel):
    location_id: int


class Waypoint(BaseModel):
    id: int
    label: str
    x: float
    y: float
    angle: Angle


class WaypointsRequest(BaseModel):
    waypoints: list[Waypoint]


class ConnectRequest(BaseModel):
    url: str

from typing import Literal

from pydantic import BaseModel


class Node(BaseModel):
    """One position in an order. theta is the heading in radians, map frame."""
    x: float
    y: float
    theta: float = 0.0


class OrderRequest(BaseModel):
    """An order by explicit positions — one node is a single goal, N a sequence."""
    nodes: list[Node]


class NamedOrderRequest(BaseModel):
    """An order by named-location IDs (resolved against app/data.py)."""
    location_ids: list[int]


class InstantActionRequest(BaseModel):
    action_type: Literal["cancelOrder", "retryNode", "skipNode"]

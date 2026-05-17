"""VDA5050 message builders for the FMS gateway.

Assembles `order` and `instantActions` messages and the VDA5050 topic names.
See docs/schema/VDA5050_MESSAGES.md.
"""
from datetime import datetime, timezone

from .robots import registry


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def topic_for(serial: str, message: str) -> str:
    """Build {interfaceName}/{majorVersion}/{manufacturer}/{serial}/{message}."""
    return (
        f"{registry.interface_name}/{registry.major_version}"
        f"/{registry.manufacturer}/{serial}/{message}"
    )


def _header(serial: str, message: str) -> dict:
    return {
        "headerId": registry.next_header_id(serial, message),
        "timestamp": _now(),
        "version": registry.version,
        "manufacturer": registry.manufacturer,
        "serialNumber": serial,
    }


def build_order(serial: str, nodes: list[dict], map_id: str) -> dict:
    """Assemble a VDA5050 `order`.

    `nodes` is a list of {x, y, theta} dicts. A single goal is one node; a waypoint
    sequence is N nodes. Edges are auto-generated to connect consecutive nodes.
    sequenceId follows the VDA5050 convention: nodes even, edges odd.
    """
    order_id = registry.next_order_id(serial)

    vda_nodes = [
        {
            "nodeId": f"{order_id}-n{i}",
            "sequenceId": i * 2,
            "released": True,
            "nodePosition": {
                "x": node["x"],
                "y": node["y"],
                "theta": node.get("theta", 0.0),
                "mapId": map_id,
            },
            "actions": [],
        }
        for i, node in enumerate(nodes)
    ]

    vda_edges = [
        {
            "edgeId": f"{order_id}-e{i}",
            "sequenceId": i * 2 + 1,
            "released": True,
            "startNodeId": vda_nodes[i]["nodeId"],
            "endNodeId": vda_nodes[i + 1]["nodeId"],
            "actions": [],
        }
        for i in range(len(vda_nodes) - 1)
    ]

    return {
        **_header(serial, "order"),
        "orderId": order_id,
        "orderUpdateId": 0,
        "nodes": vda_nodes,
        "edges": vda_edges,
    }


def build_instant_actions(serial: str, actions: list[dict]) -> dict:
    """Assemble a VDA5050 `instantActions` message wrapping the given actions."""
    return {
        **_header(serial, "instantActions"),
        "actions": actions,
    }

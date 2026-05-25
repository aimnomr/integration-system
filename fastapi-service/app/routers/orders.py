"""Order history — paged list of past `order` messages received from FastAPI's
own publish path or seen on the audit tap. Read-only; writes happen via the
order-dispatch endpoints on `routers/robots.py` and the Node-RED audit tap via
`routers/ingest.py`.
"""
from fastapi import APIRouter, HTTPException, Path, Query
from fastapi.responses import JSONResponse

from ..db import DatabaseUnavailable, fetch_order, fetch_orders
from ..robots import registry

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("")
def list_orders(
    serial: str | None = Query(None, description="Filter by robot serial"),
    limit: int = Query(50, ge=1, le=500, description="Max rows to return"),
    before: str | None = Query(
        None,
        description="ISO-8601 timestamp cursor; return rows older than this",
    ),
):
    if serial and not registry.exists(serial):
        raise HTTPException(status_code=404, detail=f"Robot '{serial}' not registered")
    try:
        rows = fetch_orders(serial=serial, limit=limit, before=before)
    except DatabaseUnavailable as exc:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "message": f"Database unavailable: {exc}"},
        )
    return {"orders": rows, "count": len(rows)}


@router.get("/{order_id}")
def get_order(
    order_id: str = Path(..., description="VDA5050 orderId (e.g. amr001-order-7)"),
):
    """Detail view: header row plus joined `order_nodes` / `order_edges`.
    Drives the Order History row drill-down (G31)."""
    try:
        order = fetch_order(order_id)
    except DatabaseUnavailable as exc:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "message": f"Database unavailable: {exc}"},
        )
    if order is None:
        raise HTTPException(status_code=404, detail=f"Order '{order_id}' not found")
    return order

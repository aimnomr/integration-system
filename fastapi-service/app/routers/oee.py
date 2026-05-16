from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/oee")


def _db_unavailable() -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"status": "error", "message": "Database not yet integrated"}
    )


@router.get("/summary")
def get_oee_summary():
    return _db_unavailable()


@router.get("/cycles")
def get_oee_cycles():
    return _db_unavailable()


@router.get("/availability")
def get_oee_availability():
    return _db_unavailable()

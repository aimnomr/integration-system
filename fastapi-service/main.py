from dotenv import load_dotenv
load_dotenv()  # must run before app.mqtt is imported (reads env vars at module level)

from fastapi import FastAPI
from app.routers import amr, system, oee

app = FastAPI(title="AMR Integration API")

app.include_router(amr.router)
app.include_router(system.router)
app.include_router(oee.router)

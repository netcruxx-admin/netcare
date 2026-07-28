from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import SessionLocal
from .routers import (
    appointments,
    auth,
    departments,
    doctors,
    hospitals,
    medical_records,
    patients,
    payments,
    prescriptions,
    vitals,
)
from .seed import seed_database

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def run_migrations() -> None:
    """Bring the database schema up to head. Replaces Base.metadata.create_all
    so schema changes go through versioned Alembic migrations."""
    cfg = AlembicConfig(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Medicare Hospital Platform API",
    description="Multi-tenant backend for the Medicare hospital platform.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    # Allow any subdomain of localhost (e.g. http://sunrise.localhost:3000) so
    # per-tenant subdomains work in local dev.
    allow_origin_regex=r"^https?://([a-z0-9-]+\.)?localhost(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (
    auth,
    hospitals,
    patients,
    doctors,
    departments,
    appointments,
    medical_records,
    payments,
    prescriptions,
    vitals,
):
    app.include_router(module.router)


@app.get("/", tags=["health"])
def health():
    return {"status": "ok", "service": "Medicare Hospital Platform API"}

import re
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import storage
from .config import Settings, settings
from .database import SessionLocal
from .audit import AuditMiddleware
from .routers import (
    appointments,
    audit,
    auth,
    consents,
    babies,
    departments,
    doctors,
    hospitals,
    inventory,
    lab,
    lab_tests,
    maternity,
    medical_records,
    medication_orders,
    medicines,
    patients,
    payments,
    permissions,
    prescriptions,
    roles,
    schedule,
    superadmin,
    users,
    video_slots,
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


def check_production_config() -> None:
    """Refuse to start a production deploy that is still on demo defaults.

    Each of these is harmless locally and catastrophic on the internet, and each
    fails silently rather than loudly — a forgotten env var would otherwise ship
    a signing key and a platform-superadmin password that are both published in
    this repository. Crashing at boot is the point.
    """
    if not settings.is_production:
        return

    problems = []
    if settings.jwt_secret == Settings.model_fields["jwt_secret"].default:
        problems.append("JWT_SECRET is still the default — set a long random value.")
    if (
        settings.superadmin_password
        == Settings.model_fields["superadmin_password"].default
    ):
        problems.append("SUPERADMIN_PASSWORD is still the demo default.")
    if not settings.cors_origins_list:
        problems.append("CORS_ORIGINS is empty — set your real frontend origins.")

    if problems:
        raise RuntimeError(
            "Refusing to start with ENVIRONMENT=production:\n  - "
            + "\n  - ".join(problems)
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    check_production_config()
    run_migrations()
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="NetCare Hospital Platform API",
    description="Multi-tenant backend for the Medicare hospital platform.",
    version="2.0.0",
    lifespan=lifespan,
)

# Added before CORS so it ends up *inside* it: Starlette makes the last-added
# middleware outermost, and a preflight that CORS answers by itself is not an
# access to anything and should not land in the trail.
app.add_middleware(AuditMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    # Allow any subdomain of localhost (e.g. http://sunrise.localhost:3000) so
    # per-tenant subdomains work in local dev. Dropped in production, where it
    # would pair a wildcard origin with allow_credentials; real tenant origins
    # belong in CORS_ORIGINS.
    allow_origin_regex=(
        # In production, allow any subdomain of the root domain (tenant subdomains).
        # In dev, allow any subdomain of localhost (e.g. http://sunrise.localhost:3000).
        (
            rf"^https://[a-z0-9-]+\.{re.escape(settings.root_domain)}$"
            if settings.root_domain
            else None
        )
        if settings.is_production
        else r"^https?://([a-z0-9-]+\.)?localhost(:\d+)?$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Without this the browser hides X-Total-Count from JS, and a paginated
    # table has no way to know how many pages there are. X-Request-Id is exposed
    # for the same reason: it is the handle that ties a user's bug report to the
    # exact row in the audit trail.
    expose_headers=["X-Total-Count", "X-Request-Id"],
)

for module in (
    auth,
    audit,
    consents,
    hospitals,
    patients,
    doctors,
    departments,
    appointments,
    medical_records,
    payments,
    permissions,
    prescriptions,
    vitals,
    medicines,
    medication_orders,
    inventory,
    lab_tests,
    lab,
    schedule,
    roles,
    users,
    superadmin,
    video_slots,
    maternity,
    babies,
):
    app.include_router(module.router)


# Uploaded registration documents, served straight off disk in development.
#
# Unauthenticated by design *and* by limitation: StaticFiles has no hook for a
# permission check, and the URLs are unguessable (every stored name carries a
# random id). That is adequate for a laptop and is not access control — a
# production deployment serves these from object storage behind signed URLs,
# which is the other half of why app/storage.py exists as a seam.
app.mount(
    settings.files_url_prefix,
    StaticFiles(directory=str(storage.ensure_root())),
    name="files",
)


@app.get("/", tags=["health"])
def health():
    return {"status": "ok", "service": "NetCare Hospital Platform API"}

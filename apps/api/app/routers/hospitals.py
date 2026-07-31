from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..authz import require_permission
from ..database import get_db
from ..provisioning import provision_hospital
from ..tenancy import resolve_public_tenant

router = APIRouter(prefix="/hospitals", tags=["hospitals"])


@router.get("/current", response_model=schemas.HospitalOut)
def current_hospital(
    db: Session = Depends(get_db),
    tenant_id: str = Depends(resolve_public_tenant),
):
    """The active tenant's config — the FE fetches this at boot to replace the
    old hardcoded lib/hospitalConfig.ts. Public (no auth): branding/modules are
    needed to render the login page. Tenant resolves from subdomain."""
    hospital = db.get(models.Hospital, tenant_id)
    if hospital is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hospital not found")
    return hospital


# ----- Platform (superadmin) endpoints ---------------------------------------


@router.get("", response_model=list[schemas.HospitalOut])
def list_hospitals(
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    return db.query(models.Hospital).all()


@router.post("", response_model=schemas.HospitalOut, status_code=status.HTTP_201_CREATED)
def onboard_hospital(
    body: schemas.HospitalCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    if db.query(models.Hospital).filter(models.Hospital.subdomain == body.subdomain).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Subdomain already in use")

    hospital = provision_hospital(
        db,
        name=body.name,
        subdomain=body.subdomain,
        category=body.category,
        theme=body.theme,
        admin_email=body.admin_email,
        admin_password=body.admin_password or "password123",
        admin_name=body.admin_name,
    )
    db.commit()
    db.refresh(hospital)
    return hospital


@router.get("/{hospital_id}", response_model=schemas.HospitalOut)
def get_hospital(
    hospital_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    hospital = db.get(models.Hospital, hospital_id)
    if hospital is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hospital not found")
    return hospital


@router.patch("/{hospital_id}", response_model=schemas.HospitalOut)
def update_hospital(
    hospital_id: str,
    body: schemas.HospitalUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    hospital = db.get(models.Hospital, hospital_id)
    if hospital is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hospital not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(hospital, field, value)
    db.commit()
    db.refresh(hospital)
    return hospital

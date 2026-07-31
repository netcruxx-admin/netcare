"""Newborn records — babies, their growth measurements, and immunizations.
Tenant-scoped; growth/immunizations are nested under a baby."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import require_permission
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import new_id, now_iso

router = APIRouter(prefix="/babies", tags=["babies"])


def _get_baby(db: Session, baby_id: str, tenant_id: str) -> models.Baby:
    baby = (
        scoped(db, models.Baby, tenant_id).filter(models.Baby.id == baby_id).first()
    )
    if baby is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Baby not found")
    return baby


@router.get("", response_model=list[schemas.BabyOut])
def list_babies(
    mother_patient_id: Optional[str] = Query(default=None, alias="motherPatientId"),
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("babies.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Baby, tenant_id)
    if mother_patient_id:
        query = query.filter(models.Baby.mother_patient_id == mother_patient_id)
    return query.all()


@router.post("", response_model=schemas.BabyOut, status_code=status.HTTP_201_CREATED)
def create_baby(
    body: schemas.BabyCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("babies.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    baby = models.Baby(
        id=new_id("baby"),
        hospital_id=tenant_id,
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(baby)
    db.commit()
    db.refresh(baby)
    return baby


@router.get("/{baby_id}", response_model=schemas.BabyOut)
def get_baby(
    baby_id: str,
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("babies.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    return _get_baby(db, baby_id, tenant_id)


# ---------- Growth measurements ----------
@router.get("/{baby_id}/growth", response_model=list[schemas.GrowthMeasurementOut])
def list_growth(
    baby_id: str,
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("babies.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    _get_baby(db, baby_id, tenant_id)  # 404s if the baby isn't in this tenant
    return (
        scoped(db, models.GrowthMeasurement, tenant_id)
        .filter(models.GrowthMeasurement.baby_id == baby_id)
        .order_by(models.GrowthMeasurement.date)
        .all()
    )


@router.post(
    "/{baby_id}/growth",
    response_model=schemas.GrowthMeasurementOut,
    status_code=status.HTTP_201_CREATED,
)
def add_growth(
    baby_id: str,
    body: schemas.GrowthMeasurementCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("babies.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    _get_baby(db, baby_id, tenant_id)
    measurement = models.GrowthMeasurement(
        id=new_id("gm"),
        hospital_id=tenant_id,
        baby_id=baby_id,
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(measurement)
    db.commit()
    db.refresh(measurement)
    return measurement


# ---------- Immunizations ----------
@router.get("/{baby_id}/immunizations", response_model=list[schemas.ImmunizationOut])
def list_immunizations(
    baby_id: str,
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("babies.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    _get_baby(db, baby_id, tenant_id)
    return (
        scoped(db, models.Immunization, tenant_id)
        .filter(models.Immunization.baby_id == baby_id)
        .order_by(models.Immunization.due_date)
        .all()
    )


@router.post(
    "/{baby_id}/immunizations",
    response_model=schemas.ImmunizationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_immunization(
    baby_id: str,
    body: schemas.ImmunizationCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("babies.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    _get_baby(db, baby_id, tenant_id)
    imm = models.Immunization(
        id=new_id("imm"),
        hospital_id=tenant_id,
        baby_id=baby_id,
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(imm)
    db.commit()
    db.refresh(imm)
    return imm


@router.put(
    "/{baby_id}/immunizations/{immunization_id}/given",
    response_model=schemas.ImmunizationOut,
)
def mark_immunization_given(
    baby_id: str,
    immunization_id: str,
    body: schemas.ImmunizationMarkGiven,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("babies.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    imm = (
        scoped(db, models.Immunization, tenant_id)
        .filter(
            models.Immunization.id == immunization_id,
            models.Immunization.baby_id == baby_id,
        )
        .first()
    )
    if imm is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Immunization not found")
    imm.status = "given"
    imm.given_date = body.given_date
    db.commit()
    db.refresh(imm)
    return imm

"""Maternity signature tables — pregnancy records + antenatal (ANC) visits.
Tenant-scoped; only meaningful for hospitals with the `anc` module enabled."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import new_id, now_iso

router = APIRouter(tags=["maternity"])


# ---------- Pregnancies ----------
@router.get("/pregnancies", response_model=list[schemas.PregnancyOut])
def list_pregnancies(
    patient_id: Optional[str] = None,
    status_filter: Optional[schemas.PregnancyStatus] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.PregnancyRecord, tenant_id)
    if patient_id:
        query = query.filter(models.PregnancyRecord.patient_id == patient_id)
    if status_filter:
        query = query.filter(models.PregnancyRecord.status == status_filter)
    return query.all()


@router.post(
    "/pregnancies", response_model=schemas.PregnancyOut, status_code=status.HTTP_201_CREATED
)
def create_pregnancy(
    body: schemas.PregnancyCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
):
    record = models.PregnancyRecord(
        id=new_id("preg"),
        hospital_id=tenant_id,
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def _get_pregnancy(db: Session, pregnancy_id: str, tenant_id: str) -> models.PregnancyRecord:
    record = (
        scoped(db, models.PregnancyRecord, tenant_id)
        .filter(models.PregnancyRecord.id == pregnancy_id)
        .first()
    )
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pregnancy record not found")
    return record


@router.get("/pregnancies/{pregnancy_id}", response_model=schemas.PregnancyOut)
def get_pregnancy(
    pregnancy_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
):
    return _get_pregnancy(db, pregnancy_id, tenant_id)


@router.put("/pregnancies/{pregnancy_id}", response_model=schemas.PregnancyOut)
def update_pregnancy(
    pregnancy_id: str,
    body: schemas.PregnancyUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
):
    record = _get_pregnancy(db, pregnancy_id, tenant_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


# ---------- ANC visits ----------
@router.get("/anc-visits", response_model=list[schemas.ANCVisitOut])
def list_anc_visits(
    pregnancy_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.ANCVisit, tenant_id)
    if pregnancy_id:
        query = query.filter(models.ANCVisit.pregnancy_id == pregnancy_id)
    return query.order_by(models.ANCVisit.date).all()


@router.post(
    "/anc-visits", response_model=schemas.ANCVisitOut, status_code=status.HTTP_201_CREATED
)
def create_anc_visit(
    body: schemas.ANCVisitCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
):
    visit = models.ANCVisit(
        id=new_id("anc"),
        hospital_id=tenant_id,
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(visit)
    db.commit()
    db.refresh(visit)
    return visit

"""Maternity signature tables — pregnancy records + antenatal (ANC) visits.
Tenant-scoped; only meaningful for hospitals with the `anc` module enabled."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import require_permission
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import (
    ListQuery,
    attach_patient_names,
    list_params,
    new_id,
    now_iso,
    paginate,
    patient_name_search,
    text_search,
)

router = APIRouter(tags=["maternity"])


def attach_anc_summary(db: Session, items: list[schemas.PregnancyOut]) -> None:
    """Fill visit_count and latest_visit on a page of pregnancy records.

    One query over the ids on the page. The alternative — what the client used
    to do — is fetching every antenatal visit in the hospital to count them and
    read the newest one's readings.
    """
    ids = [item.id for item in items]
    if not ids:
        return
    rows = (
        db.query(models.ANCVisit)
        .filter(models.ANCVisit.pregnancy_id.in_(ids))
        .order_by(models.ANCVisit.date, models.ANCVisit.id)
        .all()
    )
    counts: dict[str, int] = {}
    latest: dict[str, models.ANCVisit] = {}
    for row in rows:
        counts[row.pregnancy_id] = counts.get(row.pregnancy_id, 0) + 1
        # Rows arrive oldest-first, so the last one seen is the newest.
        latest[row.pregnancy_id] = row
    for item in items:
        item.visit_count = counts.get(item.id, 0)
        newest = latest.get(item.id)
        item.latest_visit = (
            schemas.ANCVisitOut.model_validate(newest) if newest is not None else None
        )


# ---------- Pregnancies ----------
@router.get("/pregnancies", response_model=list[schemas.PregnancyOut])
def list_pregnancies(
    response: Response,
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    status_filter: Optional[schemas.PregnancyStatus] = Query(default=None, alias="status"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("pregnancies.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.PregnancyRecord, tenant_id)
    if patient_id:
        query = query.filter(models.PregnancyRecord.patient_id == patient_id)
    if status_filter:
        query = query.filter(models.PregnancyRecord.status == status_filter)
    # The card shows the mother's name, so that is what gets typed in.
    query = patient_name_search(
        query,
        models.PregnancyRecord,
        params.q,
        models.PregnancyRecord.notes,
        models.PregnancyRecord.blood_group,
    )
    query = query.order_by(models.PregnancyRecord.created_at.desc(), models.PregnancyRecord.id)
    rows = paginate(query, response, params.limit, params.offset).all()
    out = [schemas.PregnancyOut.model_validate(row) for row in rows]
    attach_patient_names(db, out)
    attach_anc_summary(db, out)
    return out


@router.post(
    "/pregnancies", response_model=schemas.PregnancyOut, status_code=status.HTTP_201_CREATED
)
def create_pregnancy(
    body: schemas.PregnancyCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("pregnancies.manage")),
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
    scope: str = Depends(require_permission("pregnancies.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    return _get_pregnancy(db, pregnancy_id, tenant_id)


@router.put("/pregnancies/{pregnancy_id}", response_model=schemas.PregnancyOut)
def update_pregnancy(
    pregnancy_id: str,
    body: schemas.PregnancyUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("pregnancies.manage")),
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
    response: Response,
    pregnancy_id: Optional[str] = Query(default=None, alias="pregnancyId"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("pregnancies.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.ANCVisit, tenant_id)
    if pregnancy_id:
        query = query.filter(models.ANCVisit.pregnancy_id == pregnancy_id)
    query = text_search(query, [models.ANCVisit.notes], params.q)
    query = query.order_by(models.ANCVisit.date)
    return paginate(query, response, params.limit, params.offset).all()


@router.post(
    "/anc-visits", response_model=schemas.ANCVisitOut, status_code=status.HTTP_201_CREATED
)
def create_anc_visit(
    body: schemas.ANCVisitCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("pregnancies.manage")),
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

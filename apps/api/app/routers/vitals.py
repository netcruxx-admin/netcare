from typing import Optional

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, own_record_filter, require_permission
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
)

router = APIRouter(prefix="/vitals", tags=["vitals"])


@router.get("", response_model=list[schemas.VitalsOut])
def list_vitals(
    response: Response,
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    appointment_id: Optional[str] = Query(default=None, alias="appointmentId"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("vitals.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Vitals, tenant_id)
    if patient_id:
        query = query.filter(models.Vitals.patient_id == patient_id)
    if appointment_id:
        query = query.filter(models.Vitals.appointment_id == appointment_id)
    # The filters above are caller-supplied conveniences, not access control:
    # with scope "own" the caller must be a party to the row, so passing someone
    # else's id narrows the result to nothing rather than exposing their records.
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.Vitals))
    query = patient_name_search(
        query, models.Vitals, params.q, models.Vitals.notes, models.Vitals.blood_pressure
    )
    query = query.order_by(models.Vitals.created_at.desc(), models.Vitals.id)
    rows = paginate(query, response, params.limit, params.offset).all()
    out = [schemas.VitalsOut.model_validate(row) for row in rows]
    attach_patient_names(db, out)
    return out


@router.post("", response_model=schemas.VitalsOut, status_code=status.HTTP_201_CREATED)
def create_vitals(
    body: schemas.VitalsCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("vitals.record")),
    tenant_id: str = Depends(get_tenant_id),
):
    vitals = models.Vitals(
        id=new_id("vit"),
        hospital_id=tenant_id,
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(vitals)
    db.commit()
    db.refresh(vitals)
    return vitals

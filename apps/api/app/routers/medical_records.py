from typing import Optional

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, own_record_filter, require_permission
from ..database import get_db
from ..tenancy import assert_in_tenant, get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, now_iso, paginate, text_search

router = APIRouter(prefix="/medical-records", tags=["medical-records"])


@router.get("", response_model=list[schemas.MedicalRecordOut])
def list_medical_records(
    response: Response,
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    appointment_id: Optional[str] = Query(default=None, alias="appointmentId"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("medical_records.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.MedicalRecord, tenant_id)
    if patient_id:
        query = query.filter(models.MedicalRecord.patient_id == patient_id)
    if appointment_id:
        query = query.filter(models.MedicalRecord.appointment_id == appointment_id)
    # The filters above are caller-supplied conveniences, not access control:
    # with scope "own" the caller must be a party to the row, so passing someone
    # else's id narrows the result to nothing rather than exposing their records.
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.MedicalRecord))
    query = text_search(query, [models.MedicalRecord.diagnosis, models.MedicalRecord.prescription], params.q)
    query = query.order_by(models.MedicalRecord.created_at.desc(), models.MedicalRecord.id)
    return paginate(query, response, params.limit, params.offset).all()


@router.post("", response_model=schemas.MedicalRecordOut, status_code=status.HTTP_201_CREATED)
def create_record(
    body: schemas.MedicalRecordCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("medical_records.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    # Foreign keys arrive in the body and are otherwise trusted, which would let
    # a row filed in this tenant point at another hospital's patient — an
    # integrity fault that becomes a disclosure the moment a display helper
    # resolves that id to a name. See tenancy.assert_in_tenant.
    assert_in_tenant(db, models.Patient, body.patient_id, tenant_id)
    assert_in_tenant(db, models.Doctor, body.doctor_id, tenant_id)
    assert_in_tenant(db, models.Appointment, body.appointment_id, tenant_id)

    record = models.MedicalRecord(
        id=new_id("med"),
        hospital_id=tenant_id,
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

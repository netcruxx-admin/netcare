from typing import Optional

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, own_record_filter, require_permission
from ..database import get_db
from ..tenancy import assert_in_tenant, get_tenant_id, scoped
from ..utils import (
    ListQuery,
    attach_patient_names,
    list_params,
    new_id,
    now_iso,
    paginate,
    patient_name_search,
)

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


@router.get("", response_model=list[schemas.PrescriptionOut])
def list_prescriptions(
    response: Response,
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    appointment_id: Optional[str] = Query(default=None, alias="appointmentId"),
    doctor_id: Optional[str] = Query(default=None, alias="doctorId"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("prescriptions.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Prescription, tenant_id)
    if patient_id:
        query = query.filter(models.Prescription.patient_id == patient_id)
    if appointment_id:
        query = query.filter(models.Prescription.appointment_id == appointment_id)
    if doctor_id:
        query = query.filter(models.Prescription.doctor_id == doctor_id)
    # The filters above are caller-supplied conveniences, not access control:
    # with scope "own" the caller must be a party to the row, so passing someone
    # else's id narrows the result to nothing rather than exposing their records.
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.Prescription))
    # The table shows the patient's name next to the medicine, so both have to
    # be searchable — the name reached through the patient join.
    query = patient_name_search(
        query,
        models.Prescription,
        params.q,
        models.Prescription.medicine_name,
        models.Prescription.dosage,
        models.Prescription.frequency,
        models.Prescription.instructions,
    )
    query = query.order_by(models.Prescription.created_at.desc(), models.Prescription.id)
    rows = paginate(query, response, params.limit, params.offset).all()
    out = [schemas.PrescriptionOut.model_validate(row) for row in rows]
    attach_patient_names(db, out, tenant_id=tenant_id)
    return out


@router.post("", response_model=schemas.PrescriptionOut, status_code=status.HTTP_201_CREATED)
def create_prescription(
    body: schemas.PrescriptionCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("prescriptions.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    # Foreign keys arrive in the body and are otherwise trusted, which would let
    # a row filed in this tenant point at another hospital's patient — an
    # integrity fault that becomes a disclosure the moment a display helper
    # resolves that id to a name. See tenancy.assert_in_tenant.
    assert_in_tenant(db, models.Patient, body.patient_id, tenant_id)
    assert_in_tenant(db, models.Doctor, body.doctor_id, tenant_id)
    assert_in_tenant(db, models.Appointment, body.appointment_id, tenant_id)

    prescription = models.Prescription(
        id=new_id("presc"),
        hospital_id=tenant_id,
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(prescription)
    db.commit()
    db.refresh(prescription)
    return prescription

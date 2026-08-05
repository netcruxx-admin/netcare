"""Patient records.

Every endpoint is guarded by a permission and narrowed by its granted scope.
Before this, any authenticated user of a hospital could list every patient and
read any patient's records by putting their id in the URL — tenant scoping alone
does not stop one patient reading another's chart.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import (
    SCOPE_OWN,
    caller_patient_id,
    effective_permissions,
    own_patients_filter,
    own_record_filter,
    require_any_permission,
    require_permission,
)
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import ListQuery, attach_users, attach_visit_stats, doctor_display, list_params, paginate

router = APIRouter(prefix="/patients", tags=["patients"])


def _with_user(db: Session, patient: models.Patient) -> schemas.PatientOut:
    out = schemas.PatientOut.model_validate(patient)
    user = db.get(models.User, patient.user_id)
    if user:
        out.user = schemas.UserOut.model_validate(user)
    return out


def _get_or_404(db: Session, patient_id: str, tenant_id: str) -> models.Patient:
    patient = (
        scoped(db, models.Patient, tenant_id)
        .filter(models.Patient.id == patient_id)
        .first()
    )
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    return patient


def _visible_patient_or_404(
    db: Session,
    user: models.User,
    patient_id: str,
    tenant_id: str,
    scope: str | None,
) -> models.Patient:
    """Fetch a patient the caller is allowed to see, else 404.

    404 rather than 403 on purpose: replying "forbidden" would confirm that a
    given patient id exists at this hospital.
    """
    query = scoped(db, models.Patient, tenant_id).filter(models.Patient.id == patient_id)
    if scope == SCOPE_OWN:
        query = query.filter(own_patients_filter(db, user))
    patient = query.first()
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    return patient


def _sub_resource(
    db: Session,
    user: models.User,
    model,
    patient_id: str,
    tenant_id: str,
    scope: str | None,
    response: Response | None = None,
    params: ListQuery | None = None,
):
    """Rows of `model` for one patient, narrowed to what the caller may see.

    With scope "own" the caller must be a party to the row — the patient it
    belongs to, or the doctor on it — so passing someone else's patient id in
    the URL returns nothing instead of their records.

    Paged like every other collection when the caller asks; one patient's own
    history is small, so the default stays "everything".
    """
    query = scoped(db, model, tenant_id).filter(model.patient_id == patient_id)
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, model))
    query = query.order_by(model.id)
    if response is not None and params is not None:
        return paginate(query, response, params.limit, params.offset).all()
    return query.all()


@router.get("", response_model=list[schemas.PatientOut])
def list_patients(
    response: Response,
    q: Optional[str] = Query(default=None),
    with_stats: bool = Query(default=False, alias="withStats"),
    limit: Optional[int] = Query(default=None, ge=1),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("patients.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Patient, tenant_id)
    # A user who can create patients (patients.manage) must be able to see the
    # patients they just registered, even if no appointment exists yet.
    # own_patients_filter only includes patients with existing appointments,
    # so we only apply it when the caller lacks patients.manage.
    can_manage = "patients.manage" in effective_permissions(db, user)
    if scope == SCOPE_OWN and not can_manage:
        query = query.filter(own_patients_filter(db, user))
    if q:
        # Search has to run here rather than in the client: once a page is only
        # 50 of 10,000 rows, filtering what already arrived would search one
        # page and call it the whole result.
        like = f"%{q.strip().lower()}%"
        query = query.outerjoin(
            models.User, models.User.id == models.Patient.user_id
        ).filter(
            or_(
                func.lower(models.User.name).like(like),
                func.lower(models.User.email).like(like),
                func.lower(models.User.phone).like(like),
                func.lower(models.Patient.phone).like(like),
                func.lower(models.Patient.gender).like(like),
                func.lower(models.Patient.blood_group).like(like),
            )
        )
    # Stable order, so page 2 cannot repeat or skip a row from page 1.
    query = query.order_by(models.Patient.id)
    query = paginate(query, response, limit, offset)
    rows = query.all()
    out = attach_users(db, rows, schemas.PatientOut, schemas.UserOut)

    if with_stats:
        # Visit counts and last/next visit dates, aggregated for this page only.
        attach_visit_stats(db, out)
    return out


@router.get("/by-user/{user_id}", response_model=schemas.PatientOut)
def get_patient_by_user(
    user_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("patients.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Patient, tenant_id).filter(
        models.Patient.user_id == user_id
    )
    if scope == SCOPE_OWN:
        query = query.filter(own_patients_filter(db, user))
    patient = query.first()
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    return _with_user(db, patient)


@router.get("/{patient_id}", response_model=schemas.PatientOut)
def get_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("patients.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    return _with_user(db, _visible_patient_or_404(db, user, patient_id, tenant_id, scope))


@router.put("/{patient_id}", response_model=schemas.PatientOut)
def update_patient(
    patient_id: str,
    body: schemas.PatientUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    held: dict = Depends(require_any_permission("patients.manage", "profile.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    patient = _get_or_404(db, patient_id, tenant_id)
    # Staff may edit anyone's record; everyone else only their own.
    if "patients.manage" not in held and patient.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient


@router.get("/{patient_id}/appointments", response_model=list[schemas.AppointmentOut])
def patient_appointments(
    patient_id: str,
    response: Response,
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("appointments.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    rows = _sub_resource(db, user, models.Appointment, patient_id, tenant_id, scope, response, params)
    doctors = doctor_display(db, (r.doctor_id for r in rows))
    out = []
    for row in rows:
        item = schemas.AppointmentOut.model_validate(row)
        item.doctor_name = doctors.get(row.doctor_id, "")
        out.append(item)
    return out


@router.get(
    "/{patient_id}/medical-records", response_model=list[schemas.MedicalRecordOut]
)
def patient_medical_records(
    patient_id: str,
    response: Response,
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("medical_records.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    return _sub_resource(db, user, models.MedicalRecord, patient_id, tenant_id, scope, response, params)


@router.get("/{patient_id}/payments", response_model=list[schemas.PaymentOut])
def patient_payments(
    patient_id: str,
    response: Response,
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("payments.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    # Payments carry no doctor_id, so "own" means the patient themselves.
    query = scoped(db, models.Payment, tenant_id).filter(
        models.Payment.patient_id == patient_id
    )
    if scope == SCOPE_OWN and caller_patient_id(db, user) != patient_id:
        return []
    query = query.order_by(models.Payment.created_at.desc(), models.Payment.id)
    return paginate(query, response, params.limit, params.offset).all()


@router.get(
    "/{patient_id}/prescriptions", response_model=list[schemas.PrescriptionOut]
)
def patient_prescriptions(
    patient_id: str,
    response: Response,
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("prescriptions.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    return _sub_resource(db, user, models.Prescription, patient_id, tenant_id, scope, response, params)


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _: dict = Depends(require_permission("patients.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    patient = _get_or_404(db, patient_id, tenant_id)
    linked_user = db.get(models.User, patient.user_id)
    db.delete(patient)
    if linked_user:
        db.delete(linked_user)
    db.commit()


@router.get("/{patient_id}/vitals", response_model=list[schemas.VitalsOut])
def patient_vitals(
    patient_id: str,
    response: Response,
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("vitals.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    return _sub_resource(db, user, models.Vitals, patient_id, tenant_id, scope, response, params)

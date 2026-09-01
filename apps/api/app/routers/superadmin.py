"""Superadmin-only endpoints — cross-tenant visibility across all hospitals."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..authz import require_permission
from ..database import get_db
from ..utils import (
    ListQuery,
    appointment_name_search,
    attach_users,
    attach_visit_stats,
    doctor_display,
    list_params,
    paginate,
    patient_display,
    text_search,
)

router = APIRouter(prefix="/superadmin", tags=["superadmin"])


@router.get("/overview")
def overview(
    hospital_id: Optional[str] = Query(default=None, alias="hospitalId"),
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("platform.read")),
):
    def count(model, extra_filter=None):
        q = db.query(model)
        if hospital_id:
            q = q.filter(model.hospital_id == hospital_id)
        if extra_filter is not None:
            q = q.filter(extra_filter)
        return q.count()

    hospitals_q = db.query(models.Hospital)
    if hospital_id:
        hospitals_q = hospitals_q.filter(models.Hospital.id == hospital_id)

    return {
        "hospitals": hospitals_q.count(),
        "users": count(models.User, models.User.hospital_id.isnot(None)),
        "patients": count(models.Patient),
        "doctors": count(models.Doctor),
        "appointments": count(models.Appointment),
        "departments": count(models.Department),
    }


@router.get("/patients")
def all_patients(
    response: Response,
    hospital_id: Optional[str] = Query(default=None, alias="hospitalId"),
    with_stats: bool = Query(default=False, alias="withStats"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("platform.read")),
):
    query = db.query(models.Patient)
    if hospital_id:
        query = query.filter(models.Patient.hospital_id == hospital_id)
    if params.q:
        query = query.outerjoin(models.User, models.User.id == models.Patient.user_id)
        query = text_search(
            query,
            [
                models.User.name,
                models.User.email,
                models.User.phone,
                models.Patient.phone,
                models.Patient.gender,
                models.Patient.blood_group,
            ],
            params.q,
        )
    query = query.order_by(models.Patient.id)
    query = paginate(query, response, params.limit, params.offset)
    out = attach_users(db, query.all(), schemas.PatientOut, schemas.UserOut)
    if with_stats:
        attach_visit_stats(db, out)
    return out


@router.get("/doctors")
def all_doctors(
    response: Response,
    hospital_id: Optional[str] = Query(default=None, alias="hospitalId"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("platform.read")),
):
    query = db.query(models.Doctor)
    if hospital_id:
        query = query.filter(models.Doctor.hospital_id == hospital_id)
    if params.q:
        query = query.outerjoin(models.User, models.User.id == models.Doctor.user_id)
        query = text_search(
            query,
            [models.User.name, models.User.email, models.Doctor.specialization],
            params.q,
        )
    query = query.order_by(models.Doctor.id)
    query = paginate(query, response, params.limit, params.offset)
    return attach_users(db, query.all(), schemas.DoctorOut, schemas.UserOut)


@router.get("/appointments")
def all_appointments(
    response: Response,
    hospital_id: Optional[str] = Query(default=None, alias="hospitalId"),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("platform.read")),
):
    query = db.query(models.Appointment)
    if hospital_id:
        query = query.filter(models.Appointment.hospital_id == hospital_id)
    if status_filter:
        query = query.filter(models.Appointment.status == status_filter)
    # Same search as the tenant list: patient name/phone or doctor name, which
    # is what the platform table shows and therefore what a superadmin types.
    query = appointment_name_search(query, params.q)
    query = query.order_by(models.Appointment.date.desc(), models.Appointment.id)
    rows = paginate(query, response, params.limit, params.offset).all()
    patients = patient_display(db, (r.patient_id for r in rows))
    doctors = doctor_display(db, (r.doctor_id for r in rows))
    out = []
    for row in rows:
        item = schemas.AppointmentOut.model_validate(row)
        item.patient_name, item.patient_phone = patients.get(row.patient_id, ("", ""))
        item.doctor_name = doctors.get(row.doctor_id, "")
        out.append(item)
    return out


@router.get("/departments", response_model=list[schemas.DepartmentOut])
def all_departments(
    response: Response,
    hospital_id: Optional[str] = Query(default=None, alias="hospitalId"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("platform.read")),
):
    query = db.query(models.Department)
    if hospital_id:
        query = query.filter(models.Department.hospital_id == hospital_id)
    query = text_search(
        query, [models.Department.name, models.Department.description], params.q
    )
    query = query.order_by(models.Department.name)
    return paginate(query, response, params.limit, params.offset).all()


@router.get("/users", response_model=list[schemas.UserOut])
def all_users(
    response: Response,
    hospital_id: Optional[str] = Query(default=None, alias="hospitalId"),
    role: Optional[str] = Query(default=None),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("platform.read")),
):
    # Platform superadmins have no hospital_id; this endpoint reports tenant
    # staff, so they are excluded rather than listed as hospital users.
    query = db.query(models.User).filter(models.User.hospital_id.isnot(None))
    if hospital_id:
        query = query.filter(models.User.hospital_id == hospital_id)
    if role:
        query = query.filter(models.User.role == role)
    query = text_search(
        query, [models.User.name, models.User.email, models.User.phone], params.q
    )
    query = query.order_by(models.User.name, models.User.id)
    return paginate(query, response, params.limit, params.offset).all()


@router.put("/patients/{patient_id}", response_model=schemas.PatientOut)
def update_patient(
    patient_id: str,
    body: schemas.PatientUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("patients.manage")),
):
    patient = db.get(models.Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    out = schemas.PatientOut.model_validate(patient)
    user = db.get(models.User, patient.user_id)
    if user:
        out.user = schemas.UserOut.model_validate(user)
    return out

"""Superadmin-only endpoints — cross-tenant visibility across all hospitals."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..authz import require_permission
from ..database import get_db

router = APIRouter(prefix="/superadmin", tags=["superadmin"])


@router.get("/overview")
def overview(
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("platform.read")),
):
    return {
        "hospitals": db.query(models.Hospital).count(),
        "users": db.query(models.User).filter(models.User.hospital_id.isnot(None)).count(),
        "patients": db.query(models.Patient).count(),
        "doctors": db.query(models.Doctor).count(),
        "appointments": db.query(models.Appointment).count(),
        "departments": db.query(models.Department).count(),
    }


@router.get("/patients")
def all_patients(
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("platform.read")),
):
    rows = db.query(models.Patient).all()
    result = []
    for row in rows:
        p = schemas.PatientOut.model_validate(row)
        user = db.get(models.User, row.user_id)
        if user:
            p.user = schemas.UserOut.model_validate(user)
        result.append(p)
    return result


@router.get("/doctors")
def all_doctors(
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("platform.read")),
):
    rows = db.query(models.Doctor).all()
    result = []
    for row in rows:
        d = schemas.DoctorOut.model_validate(row)
        user = db.get(models.User, row.user_id)
        if user:
            d.user = schemas.UserOut.model_validate(user)
        result.append(d)
    return result


@router.get("/appointments")
def all_appointments(
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("platform.read")),
):
    rows = db.query(models.Appointment).all()
    return [schemas.AppointmentOut.model_validate(r) for r in rows]


@router.get("/departments")
def all_departments(
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("platform.read")),
):
    rows = db.query(models.Department).all()
    return [schemas.DepartmentOut.model_validate(r) for r in rows]


@router.get("/users")
def all_users(
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("platform.read")),
):
    rows = db.query(models.User).filter(models.User.hospital_id.isnot(None)).all()
    return [schemas.UserOut.model_validate(r) for r in rows]

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, caller_doctor_id, own_record_filter, require_permission
from ..database import get_db
from ..specialties import SPECIALTY_TEMPLATES, EncounterDataError, get_template, validate_encounter
from ..tenancy import assert_in_tenant, get_tenant_id, scoped
from ..utils import ListQuery, doctor_display, list_params, new_id, now_iso, paginate, patient_display

router = APIRouter(prefix="/specialty-encounters", tags=["specialty-encounters"])


def _out(row: models.SpecialtyEncounter, patients: dict, doctors: dict) -> schemas.SpecialtyEncounterOut:
    item = schemas.SpecialtyEncounterOut.model_validate(row)
    item.patient_name = patients.get(row.patient_id, ("", ""))[0]
    item.doctor_name = doctors.get(row.doctor_id, "")
    return item


def _visible(db: Session, user: models.User):
    """What an "own" grant covers: the caller's own encounters (as author or as
    the patient), plus -- for a doctor -- every encounter of their department's
    specialty. A cardiologist reads the cardiology team's visits, not another
    department's. Editing stays with the author (see update_encounter)."""
    own = own_record_filter(db, user, models.SpecialtyEncounter)
    doctor_id = caller_doctor_id(db, user)
    if not doctor_id:
        return own
    specialty = (
        db.query(models.Department.specialty)
        .join(models.Doctor, models.Doctor.department_id == models.Department.id)
        .filter(models.Doctor.id == doctor_id)
        .scalar()
    )
    if not specialty:
        return own
    return or_(own, models.SpecialtyEncounter.specialty == specialty)


def _one(db: Session, record_id: str, tenant_id: str, user, scope: str) -> models.SpecialtyEncounter:
    """The encounter, or 404 -- missing, another tenant's and not-yours are the
    same answer, because a 403 would confirm the id exists."""
    query = scoped(db, models.SpecialtyEncounter, tenant_id).filter(models.SpecialtyEncounter.id == record_id)
    if scope == SCOPE_OWN:
        query = query.filter(_visible(db, user))
    row = query.first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Encounter not found")
    return row


def _validated(specialty: str, data: dict) -> tuple[dict, int]:
    template = get_template(specialty)
    if template is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown specialty: {specialty}")
    try:
        return validate_encounter(template, data), template["version"]
    except EncounterDataError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))


# Declared before "/{record_id}" so "templates" is not read as an id.
@router.get("/templates")
def list_templates(
    _scope: str = Depends(require_permission("specialty_encounters.read")),
    _tenant_id: str = Depends(get_tenant_id),
):
    """The catalog the form renders from -- one copy of the rule, like
    /hospitals/meta/onboarding, so the frontend never restates a field list."""
    return list(SPECIALTY_TEMPLATES.values())


@router.get("", response_model=list[schemas.SpecialtyEncounterOut])
def list_encounters(
    response: Response,
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    appointment_id: Optional[str] = Query(default=None, alias="appointmentId"),
    specialty: Optional[str] = None,
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("specialty_encounters.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.SpecialtyEncounter, tenant_id)
    if patient_id:
        query = query.filter(models.SpecialtyEncounter.patient_id == patient_id)
    if appointment_id:
        query = query.filter(models.SpecialtyEncounter.appointment_id == appointment_id)
    if specialty:
        query = query.filter(models.SpecialtyEncounter.specialty == specialty)
    if scope == SCOPE_OWN:
        query = query.filter(_visible(db, user))
    query = query.order_by(models.SpecialtyEncounter.created_at.desc())
    rows = paginate(query, response, params.limit, params.offset).all()
    patients = patient_display(db, (r.patient_id for r in rows), tenant_id)
    doctors = doctor_display(db, (r.doctor_id for r in rows), tenant_id)
    return [_out(r, patients, doctors) for r in rows]


@router.get("/{record_id}", response_model=schemas.SpecialtyEncounterOut)
def get_encounter(
    record_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("specialty_encounters.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    row = _one(db, record_id, tenant_id, user, scope)
    return _out(
        row,
        patient_display(db, [row.patient_id], tenant_id),
        doctor_display(db, [row.doctor_id], tenant_id),
    )


@router.post("", response_model=schemas.SpecialtyEncounterOut, status_code=status.HTTP_201_CREATED)
def create_encounter(
    body: schemas.SpecialtyEncounterCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _scope: str = Depends(require_permission("specialty_encounters.write")),
    tenant_id: str = Depends(get_tenant_id),
):
    # Who recorded a clinical encounter is a fact about what happened, never
    # something the client asserts.
    doctor_id = caller_doctor_id(db, user)
    if doctor_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only a doctor can record an encounter")

    assert_in_tenant(db, models.Appointment, body.appointment_id, tenant_id)
    appointment = (
        scoped(db, models.Appointment, tenant_id)
        .filter(models.Appointment.id == body.appointment_id)
        .first()
    )
    # A visit is recorded by the doctor it was booked with -- a colleague's
    # appointment is a 404, the same answer as one that does not exist.
    if appointment.doctor_id != doctor_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "appointment not found")

    # The department decides the specialty; the client does not get a say.
    specialty = (
        db.query(models.Department.specialty)
        .filter(models.Department.id == appointment.department_id, models.Department.hospital_id == tenant_id)
        .scalar()
        or ""
    )
    if not specialty:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This appointment's department has no specialty set. Ask the platform administrator to set one.",
        )
    if specialty not in SPECIALTY_TEMPLATES:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "There is no visit form for this department's specialty yet."
        )
    already = (
        scoped(db, models.SpecialtyEncounter, tenant_id)
        .filter(models.SpecialtyEncounter.appointment_id == appointment.id)
        .first()
    )
    if already is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This visit already has a specialty record. Edit it instead.")

    data, version = _validated(specialty, body.data)
    now = now_iso()
    row = models.SpecialtyEncounter(
        id=new_id("enc"),
        hospital_id=tenant_id,
        patient_id=appointment.patient_id,
        doctor_id=doctor_id,
        appointment_id=appointment.id,
        specialty=specialty,
        template_version=version,
        data=data,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(
        row,
        patient_display(db, [row.patient_id], tenant_id),
        doctor_display(db, [row.doctor_id], tenant_id),
    )


@router.put("/{record_id}", response_model=schemas.SpecialtyEncounterOut)
def update_encounter(
    record_id: str,
    body: schemas.SpecialtyEncounterUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("specialty_encounters.write")),
    tenant_id: str = Depends(get_tenant_id),
):
    row = _one(db, record_id, tenant_id, user, scope)
    # Readable by the department, editable by the author alone.
    if scope == SCOPE_OWN and row.doctor_id != caller_doctor_id(db, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Encounter not found")
    row.data, row.template_version = _validated(row.specialty, body.data)
    row.updated_at = now_iso()
    db.commit()
    db.refresh(row)
    return _out(
        row,
        patient_display(db, [row.patient_id], tenant_id),
        doctor_display(db, [row.doctor_id], tenant_id),
    )


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_encounter(
    record_id: str,
    db: Session = Depends(get_db),
    _scope: str = Depends(require_permission("specialty_encounters.delete")),
    tenant_id: str = Depends(get_tenant_id),
):
    row = (
        scoped(db, models.SpecialtyEncounter, tenant_id)
        .filter(models.SpecialtyEncounter.id == record_id)
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Encounter not found")
    db.delete(row)
    db.commit()

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import (
    SCOPE_OWN,
    caller_doctor_id,
    own_record_filter,
    require_permission,
)
from ..database import get_db
from ..ipd import TERMINAL_STATUSES
from ..tenancy import assert_body_in_tenant, assert_in_tenant, get_tenant_id, scoped
from ..utils import (
    ListQuery,
    doctor_display,
    list_params,
    new_id,
    now_iso,
    paginate,
    patient_display,
    patient_name_search,
)

router = APIRouter(prefix="/admissions", tags=["admissions"])


def _generate_admission_number(db: Session, tenant_id: str) -> str:
    """Sequential, human-facing stay number — ADM-000001, ADM-000002, ...

    Intentionally self-contained rather than reading hospital_profiles'
    mrn_prefix/mrn_format: those columns exist on the schema but nothing in
    this codebase currently generates a patient MRN from them either, so
    wiring IPD into that config would be inventing use of a pattern nothing
    else follows yet rather than reusing an established one. Revisit together
    if/when MRN generation is actually built.
    """
    count = scoped(db, models.Admission, tenant_id).count()
    return f"ADM-{count + 1:06d}"


def _resolve_display(db: Session, tenant_id: str, rows: list) -> tuple[dict, dict, dict, dict]:
    patients = patient_display(db, (r.patient_id for r in rows), tenant_id)
    doctors = doctor_display(db, (r.doctor_id for r in rows), tenant_id)
    ward_ids = {r.ward_id for r in rows if r.ward_id}
    bed_ids = {r.bed_id for r in rows if r.bed_id}
    wards = (
        {w.id: w.name for w in scoped(db, models.Ward, tenant_id).filter(models.Ward.id.in_(ward_ids))}
        if ward_ids else {}
    )
    beds = (
        {b.id: b.bed_number for b in scoped(db, models.Bed, tenant_id).filter(models.Bed.id.in_(bed_ids))}
        if bed_ids else {}
    )
    return patients, doctors, wards, beds


def _to_out(row: models.Admission, patients: dict, doctors: dict, wards: dict, beds: dict) -> schemas.AdmissionOut:
    item = schemas.AdmissionOut.model_validate(row)
    item.patient_name, item.patient_phone = patients.get(row.patient_id, ("", ""))
    item.doctor_name = doctors.get(row.doctor_id, "")
    item.ward_name = wards.get(row.ward_id, "")
    item.bed_number = beds.get(row.bed_id, "")
    return item


@router.get("", response_model=list[schemas.AdmissionOut])
def list_admissions(
    response: Response,
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    doctor_id: Optional[str] = Query(default=None, alias="doctorId"),
    ward_id: Optional[str] = Query(default=None, alias="wardId"),
    bed_id: Optional[str] = Query(default=None, alias="bedId"),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("admissions.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Admission, tenant_id)
    if patient_id:
        query = query.filter(models.Admission.patient_id == patient_id)
    if doctor_id:
        query = query.filter(models.Admission.doctor_id == doctor_id)
    if ward_id:
        query = query.filter(models.Admission.ward_id == ward_id)
    if bed_id:
        query = query.filter(models.Admission.bed_id == bed_id)
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.Admission))
    if status_filter:
        wanted = [s.strip() for s in status_filter.split(",") if s.strip()]
        query = query.filter(models.Admission.status.in_(wanted))
    query = patient_name_search(query, models.Admission, params.q)
    query = query.order_by(models.Admission.admitted_at.desc(), models.Admission.id.desc())
    rows = paginate(query, response, params.limit, params.offset).all()
    patients, doctors, wards, beds = _resolve_display(db, tenant_id, rows)
    return [_to_out(r, patients, doctors, wards, beds) for r in rows]


@router.get("/{admission_id}", response_model=schemas.AdmissionOut)
def get_admission(
    admission_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("admissions.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Admission, tenant_id).filter(models.Admission.id == admission_id)
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.Admission))
    admission = query.first()
    if admission is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admission not found")
    patients, doctors, wards, beds = _resolve_display(db, tenant_id, [admission])
    return _to_out(admission, patients, doctors, wards, beds)


@router.post("", response_model=schemas.AdmissionOut, status_code=status.HTTP_201_CREATED)
def create_admission(
    body: schemas.AdmissionCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("admissions.create")),
    tenant_id: str = Depends(get_tenant_id),
):
    # Scope "own": a doctor may only admit under their own name — the same
    # "own booking" rule create_appointment enforces for a doctor's follow-up.
    if scope == SCOPE_OWN:
        own_doctor = caller_doctor_id(db, user)
        if own_doctor is None or body.doctor_id != own_doctor:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "You can only admit a patient under your own name",
            )

    assert_body_in_tenant(db, body, tenant_id)

    bed = scoped(db, models.Bed, tenant_id).filter(models.Bed.id == body.bed_id).first()
    if bed is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bed not found")
    if bed.status != "vacant":
        raise HTTPException(status.HTTP_409_CONFLICT, "This bed is not available")

    fields = body.model_dump(exclude={"bed_id"})
    timestamp = now_iso()

    # A concurrent admission could race the same sequential number; retried a
    # handful of times against the uniqueness constraint rather than trusting
    # a single read-then-write to be safe under concurrency.
    admission: Optional[models.Admission] = None
    last_error: Optional[IntegrityError] = None
    for _attempt in range(5):
        admission = models.Admission(
            id=new_id("adm"),
            hospital_id=tenant_id,
            admission_number=_generate_admission_number(db, tenant_id),
            ward_id=bed.ward_id,
            bed_id=bed.id,
            status="admitted",
            admitted_by_user_id=user.id,
            admitted_by_role=user.role,
            admitted_at=timestamp,
            created_at=timestamp,
            **fields,
        )
        db.add(admission)
        try:
            db.flush()
            break
        except IntegrityError as exc:
            db.rollback()
            # Only the admission_number race is worth retrying — any other
            # integrity failure (a bad id that slipped past the checks above)
            # would just fail identically five times and hide the real cause.
            if "uq_admissions_tenant_number" not in str(getattr(exc, "orig", exc)):
                raise
            last_error = exc
            admission = None
    if admission is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Could not allocate an admission number, try again"
        ) from last_error

    db.add(models.BedAssignment(
        id=new_id("beda"),
        hospital_id=tenant_id,
        admission_id=admission.id,
        ward_id=bed.ward_id,
        bed_id=bed.id,
        assigned_at=timestamp,
        released_at=None,
    ))
    bed.status = "occupied"
    db.commit()
    db.refresh(admission)
    patients, doctors, wards, beds = _resolve_display(db, tenant_id, [admission])
    return _to_out(admission, patients, doctors, wards, beds)


@router.put("/{admission_id}", response_model=schemas.AdmissionOut)
def update_admission(
    admission_id: str,
    body: schemas.AdmissionUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("admissions.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    assert_body_in_tenant(db, body, tenant_id)
    query = scoped(db, models.Admission, tenant_id).filter(models.Admission.id == admission_id)
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.Admission))
    admission = query.first()
    if admission is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admission not found")
    if admission.status in TERMINAL_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "A closed admission cannot be edited")

    changes = body.model_dump(exclude_unset=True)

    # Reassigning the attending doctor hands that doctor the whole stay, the
    # same authority-widening move appointments.doctor_id blocks under "own".
    if "doctor_id" in changes and scope == SCOPE_OWN:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "You cannot reassign an admission to another doctor"
        )

    for field, value in changes.items():
        setattr(admission, field, value)
    db.commit()
    db.refresh(admission)
    patients, doctors, wards, beds = _resolve_display(db, tenant_id, [admission])
    return _to_out(admission, patients, doctors, wards, beds)


@router.post("/{admission_id}/transfer", response_model=schemas.AdmissionOut)
def transfer_admission(
    admission_id: str,
    body: schemas.AdmissionTransferBed,
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("admissions.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    # Moving a patient's bed/ward is hospital-wide authority, not something an
    # "own" grant covers — same reasoning as the doctor_id block above, applied
    # to location rather than the attending doctor.
    if scope == SCOPE_OWN:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "You cannot transfer this admission's bed"
        )
    admission = (
        scoped(db, models.Admission, tenant_id)
        .filter(models.Admission.id == admission_id)
        .first()
    )
    if admission is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admission not found")
    if admission.status in TERMINAL_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "A closed admission cannot be transferred")

    assert_in_tenant(db, models.Bed, body.bed_id, tenant_id)
    new_bed = scoped(db, models.Bed, tenant_id).filter(models.Bed.id == body.bed_id).first()
    if new_bed.id == admission.bed_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Already in this bed")
    if new_bed.status != "vacant":
        raise HTTPException(status.HTTP_409_CONFLICT, "This bed is not available")

    old_bed = scoped(db, models.Bed, tenant_id).filter(models.Bed.id == admission.bed_id).first()
    open_assignment = (
        scoped(db, models.BedAssignment, tenant_id)
        .filter(
            models.BedAssignment.admission_id == admission.id,
            models.BedAssignment.released_at.is_(None),
        )
        .first()
    )
    timestamp = now_iso()
    if open_assignment is not None:
        open_assignment.released_at = timestamp
    if old_bed is not None:
        old_bed.status = "vacant"

    db.add(models.BedAssignment(
        id=new_id("beda"),
        hospital_id=tenant_id,
        admission_id=admission.id,
        ward_id=new_bed.ward_id,
        bed_id=new_bed.id,
        assigned_at=timestamp,
        released_at=None,
    ))
    new_bed.status = "occupied"
    admission.ward_id = new_bed.ward_id
    admission.bed_id = new_bed.id
    db.commit()
    db.refresh(admission)
    patients, doctors, wards, beds = _resolve_display(db, tenant_id, [admission])
    return _to_out(admission, patients, doctors, wards, beds)


@router.delete("/{admission_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_admission(
    admission_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("admissions.delete")),
    tenant_id: str = Depends(get_tenant_id),
):
    admission = (
        scoped(db, models.Admission, tenant_id)
        .filter(models.Admission.id == admission_id)
        .first()
    )
    if admission is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admission not found")

    # Release whatever bed this admission is holding rather than leaving it
    # stuck "occupied" with nothing pointing at it.
    open_assignment = (
        scoped(db, models.BedAssignment, tenant_id)
        .filter(
            models.BedAssignment.admission_id == admission.id,
            models.BedAssignment.released_at.is_(None),
        )
        .first()
    )
    if open_assignment is not None:
        open_assignment.released_at = now_iso()
        bed = scoped(db, models.Bed, tenant_id).filter(models.Bed.id == open_assignment.bed_id).first()
        if bed is not None:
            bed.status = "vacant"

    db.delete(admission)
    db.commit()

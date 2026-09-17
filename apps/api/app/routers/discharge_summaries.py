from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, caller_doctor_id, require_permission
from ..database import get_db
from ..ipd import TERMINAL_STATUSES, own_discharge_summaries_filter
from ..tenancy import assert_in_tenant, get_tenant_id, scoped
from ..utils import ListQuery, doctor_display, list_params, new_id, now_iso, paginate

router = APIRouter(prefix="/discharge-summaries", tags=["discharge-summaries"])

# discharge_type -> the Admission.status it closes the stay into.
_STATUS_FOR_DISCHARGE_TYPE = {
    "routine": "discharged",
    "referred": "transferred_out",
    "dama": "dama",
    "deceased": "deceased",
}


def _to_out(row: models.DischargeSummary, doctors: dict) -> schemas.DischargeSummaryOut:
    item = schemas.DischargeSummaryOut.model_validate(row)
    item.doctor_name = doctors.get(row.doctor_id, "")
    return item


@router.get("", response_model=list[schemas.DischargeSummaryOut])
def list_discharge_summaries(
    response: Response,
    admission_id: Optional[str] = Query(default=None, alias="admissionId"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("discharge_summaries.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.DischargeSummary, tenant_id)
    if admission_id:
        query = query.filter(models.DischargeSummary.admission_id == admission_id)
    if scope == SCOPE_OWN:
        query = query.filter(own_discharge_summaries_filter(db, user))
    query = query.order_by(models.DischargeSummary.discharged_at.desc())
    rows = paginate(query, response, params.limit, params.offset).all()
    doctors = doctor_display(db, (r.doctor_id for r in rows), tenant_id)
    return [_to_out(r, doctors) for r in rows]


@router.get("/{summary_id}", response_model=schemas.DischargeSummaryOut)
def get_discharge_summary(
    summary_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("discharge_summaries.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.DischargeSummary, tenant_id).filter(
        models.DischargeSummary.id == summary_id
    )
    if scope == SCOPE_OWN:
        query = query.filter(own_discharge_summaries_filter(db, user))
    summary = query.first()
    if summary is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Discharge summary not found")
    doctors = doctor_display(db, [summary.doctor_id], tenant_id)
    return _to_out(summary, doctors)


@router.post("", response_model=schemas.DischargeSummaryOut, status_code=status.HTTP_201_CREATED)
def create_discharge_summary(
    body: schemas.DischargeSummaryCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("admissions.discharge")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Discharging a patient *is* creating this row: the DischargeSummary, the
    admission's closed status and discharged_at, and freeing its bed all land
    in one transaction, so a stay can never end up half-closed — still holding
    its bed with a summary on file, or marked discharged with no summary to
    show for it."""
    if body.discharge_type not in _STATUS_FOR_DISCHARGE_TYPE:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"discharge_type must be one of {sorted(_STATUS_FOR_DISCHARGE_TYPE)}",
        )

    assert_in_tenant(db, models.Admission, body.admission_id, tenant_id)
    admission = (
        scoped(db, models.Admission, tenant_id)
        .filter(models.Admission.id == body.admission_id)
        .first()
    )
    if admission.status in TERMINAL_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "This admission is already closed")
    if scope == SCOPE_OWN and admission.doctor_id != caller_doctor_id(db, user):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "You are not the attending doctor for this admission"
        )

    timestamp = now_iso()
    summary = models.DischargeSummary(
        id=new_id("dsum"),
        hospital_id=tenant_id,
        admission_id=admission.id,
        # Credited to the admission's attending physician of record, not
        # necessarily the user clicking the button — an admin finalizing
        # paperwork on the doctor's behalf does not become the author.
        doctor_id=admission.doctor_id,
        diagnosis_final=body.diagnosis_final,
        hospital_course=body.hospital_course,
        condition_at_discharge=body.condition_at_discharge,
        discharge_medications=body.discharge_medications,
        follow_up_advice=body.follow_up_advice,
        discharge_type=body.discharge_type,
        discharged_at=timestamp,
        created_at=timestamp,
    )
    db.add(summary)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "This admission already has a discharge summary")

    admission.status = _STATUS_FOR_DISCHARGE_TYPE[body.discharge_type]
    admission.discharged_at = timestamp

    open_assignment = (
        scoped(db, models.BedAssignment, tenant_id)
        .filter(
            models.BedAssignment.admission_id == admission.id,
            models.BedAssignment.released_at.is_(None),
        )
        .first()
    )
    if open_assignment is not None:
        open_assignment.released_at = timestamp
        bed = scoped(db, models.Bed, tenant_id).filter(models.Bed.id == open_assignment.bed_id).first()
        if bed is not None:
            bed.status = "vacant"

    db.commit()
    db.refresh(summary)
    doctors = doctor_display(db, [summary.doctor_id], tenant_id)
    return _to_out(summary, doctors)

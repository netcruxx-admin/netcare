from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, caller_doctor_id, own_record_filter, require_permission
from ..database import get_db
from ..ipd import TERMINAL_STATUSES
from ..tenancy import assert_in_tenant, get_tenant_id, scoped
from ..utils import ListQuery, doctor_display, list_params, new_id, now_iso, paginate

router = APIRouter(prefix="/progress-notes", tags=["progress-notes"])


@router.get("", response_model=list[schemas.ProgressNoteOut])
def list_progress_notes(
    response: Response,
    admission_id: Optional[str] = Query(default=None, alias="admissionId"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("progress_notes.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.ProgressNote, tenant_id)
    if admission_id:
        query = query.filter(models.ProgressNote.admission_id == admission_id)
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.ProgressNote))
    query = query.order_by(models.ProgressNote.created_at.desc())
    rows = paginate(query, response, params.limit, params.offset).all()
    doctors = doctor_display(db, (r.doctor_id for r in rows), tenant_id)
    out = []
    for row in rows:
        item = schemas.ProgressNoteOut.model_validate(row)
        item.doctor_name = doctors.get(row.doctor_id, "")
        out.append(item)
    return out


@router.post("", response_model=schemas.ProgressNoteOut, status_code=status.HTTP_201_CREATED)
def create_progress_note(
    body: schemas.ProgressNoteCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("progress_notes.write")),
    tenant_id: str = Depends(get_tenant_id),
):
    # The author is always the caller's own doctor record — who wrote a
    # clinical note is a fact about what happened, never something the client
    # asserts (the same rule that decides the prescriber on a medication order).
    doctor_id = caller_doctor_id(db, user)
    if doctor_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only a doctor can write a progress note")

    assert_in_tenant(db, models.Admission, body.admission_id, tenant_id)
    admission = (
        scoped(db, models.Admission, tenant_id)
        .filter(models.Admission.id == body.admission_id)
        .first()
    )
    if admission.status in TERMINAL_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "This admission is closed")
    if scope == SCOPE_OWN and admission.doctor_id != doctor_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "You are not the attending doctor for this admission"
        )

    note = models.ProgressNote(
        id=new_id("pnote"),
        hospital_id=tenant_id,
        admission_id=admission.id,
        doctor_id=doctor_id,
        note=body.note,
        created_at=now_iso(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    item = schemas.ProgressNoteOut.model_validate(note)
    item.doctor_name = doctor_display(db, [doctor_id], tenant_id).get(doctor_id, "")
    return item

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, require_permission
from ..database import get_db
from ..ipd import TERMINAL_STATUSES, own_nursing_notes_filter
from ..tenancy import assert_in_tenant, get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, now_iso, paginate

router = APIRouter(prefix="/nursing-notes", tags=["nursing-notes"])


@router.get("", response_model=list[schemas.NursingNoteOut])
def list_nursing_notes(
    response: Response,
    admission_id: Optional[str] = Query(default=None, alias="admissionId"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("nursing_notes.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.NursingNote, tenant_id)
    if admission_id:
        query = query.filter(models.NursingNote.admission_id == admission_id)
    if scope == SCOPE_OWN:
        query = query.filter(own_nursing_notes_filter(db, user))
    query = query.order_by(models.NursingNote.created_at.desc())
    rows = paginate(query, response, params.limit, params.offset).all()
    nurse_ids = {r.nurse_id for r in rows}
    names = {}
    if nurse_ids:
        for u in db.query(models.User).filter(models.User.id.in_(nurse_ids)).all():
            names[u.id] = u.name
    out = []
    for row in rows:
        item = schemas.NursingNoteOut.model_validate(row)
        item.nurse_name = names.get(row.nurse_id, "")
        out.append(item)
    return out


@router.post("", response_model=schemas.NursingNoteOut, status_code=status.HTTP_201_CREATED)
def create_nursing_note(
    body: schemas.NursingNoteCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _: str = Depends(require_permission("nursing_notes.write")),
    tenant_id: str = Depends(get_tenant_id),
):
    # The author is always the caller's own identity — who wrote a nursing
    # note is a fact about what happened, never something the client asserts
    # (same rule progress_notes.py and the medication-order prescriber follow).
    # There is no Nurse table the way there is a Doctor one, so this is simply
    # the caller's own user id.
    assert_in_tenant(db, models.Admission, body.admission_id, tenant_id)
    admission = (
        scoped(db, models.Admission, tenant_id)
        .filter(models.Admission.id == body.admission_id)
        .first()
    )
    if admission.status in TERMINAL_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "This admission is closed")

    note = models.NursingNote(
        id=new_id("nnote"),
        hospital_id=tenant_id,
        admission_id=admission.id,
        nurse_id=user.id,
        shift=body.shift,
        note=body.note,
        created_at=now_iso(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    item = schemas.NursingNoteOut.model_validate(note)
    item.nurse_name = user.name
    return item

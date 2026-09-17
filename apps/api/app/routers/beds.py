from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..authz import require_permission
from ..database import get_db
from ..tenancy import assert_in_tenant, get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, paginate, text_search

router = APIRouter(prefix="/beds", tags=["beds"])

# A bed's status only ever changes for one of two reasons: staff taking it out
# of (or back into) service, or an admission occupying/releasing it. This
# endpoint owns the first; routers/admissions.py owns the second — see the
# comment on BedUpdate.status in schemas.py.
_MANUAL_STATUSES = {"vacant", "maintenance"}


@router.get("", response_model=list[schemas.BedOut])
def list_beds(
    response: Response,
    ward_id: Optional[str] = Query(default=None, alias="wardId"),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("beds.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Bed, tenant_id)
    if ward_id:
        query = query.filter(models.Bed.ward_id == ward_id)
    if status_filter:
        wanted = [s.strip() for s in status_filter.split(",") if s.strip()]
        query = query.filter(models.Bed.status.in_(wanted))
    query = text_search(query, [models.Bed.bed_number], params.q)
    query = query.order_by(models.Bed.ward_id, models.Bed.bed_number)
    return paginate(query, response, params.limit, params.offset).all()


@router.post("", response_model=schemas.BedOut, status_code=status.HTTP_201_CREATED)
def create_bed(
    body: schemas.BedCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("beds.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    assert_in_tenant(db, models.Ward, body.ward_id, tenant_id)
    bed = models.Bed(id=new_id("bed"), hospital_id=tenant_id, **body.model_dump())
    db.add(bed)
    db.commit()
    db.refresh(bed)
    return bed


@router.put("/{bed_id}", response_model=schemas.BedOut)
def update_bed(
    bed_id: str,
    body: schemas.BedUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("beds.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    bed = scoped(db, models.Bed, tenant_id).filter(models.Bed.id == bed_id).first()
    if bed is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bed not found")
    changes = body.model_dump(exclude_unset=True)
    if "status" in changes:
        if changes["status"] not in _MANUAL_STATUSES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Bed status can only be set to vacant or maintenance here — "
                "occupied/reserved follow from an admission.",
            )
        if bed.status == "occupied":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This bed is occupied and cannot be edited until the stay ends",
            )
    for field, value in changes.items():
        setattr(bed, field, value)
    db.commit()
    db.refresh(bed)
    return bed


@router.delete("/{bed_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bed(
    bed_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("beds.delete")),
    tenant_id: str = Depends(get_tenant_id),
):
    bed = scoped(db, models.Bed, tenant_id).filter(models.Bed.id == bed_id).first()
    if bed is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bed not found")
    if bed.status == "occupied":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This bed is occupied and cannot be deleted",
        )
    db.delete(bed)
    db.commit()

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..authz import require_any_permission, require_permission
from ..database import get_db
from ..tenancy import assert_in_tenant, get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, paginate, text_search

router = APIRouter(prefix="/wards", tags=["wards"])


@router.get("", response_model=list[schemas.WardOut])
def list_wards(
    response: Response,
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    # Read on either grant: the ward-management screen holds wards.manage, a
    # bed picker (admit flow, bed board) holds only beds.read.
    _: dict = Depends(require_any_permission("wards.manage", "beds.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Ward, tenant_id)
    query = text_search(query, [models.Ward.name, models.Ward.description], params.q)
    query = query.order_by(models.Ward.name)
    return paginate(query, response, params.limit, params.offset).all()


@router.post("", response_model=schemas.WardOut, status_code=status.HTTP_201_CREATED)
def create_ward(
    body: schemas.WardCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("wards.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    assert_in_tenant(db, models.Department, body.department_id, tenant_id)
    ward = models.Ward(id=new_id("ward"), hospital_id=tenant_id, **body.model_dump())
    db.add(ward)
    db.commit()
    db.refresh(ward)
    return ward


@router.put("/{ward_id}", response_model=schemas.WardOut)
def update_ward(
    ward_id: str,
    body: schemas.WardUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("wards.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    changes = body.model_dump(exclude_unset=True)
    if "department_id" in changes:
        assert_in_tenant(db, models.Department, changes["department_id"], tenant_id)
    ward = (
        scoped(db, models.Ward, tenant_id).filter(models.Ward.id == ward_id).first()
    )
    if ward is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ward not found")
    for field, value in changes.items():
        setattr(ward, field, value)
    db.commit()
    db.refresh(ward)
    return ward


@router.delete("/{ward_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ward(
    ward_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("wards.delete")),
    tenant_id: str = Depends(get_tenant_id),
):
    ward = (
        scoped(db, models.Ward, tenant_id).filter(models.Ward.id == ward_id).first()
    )
    if ward is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ward not found")
    # A ward with any occupied bed cannot be deleted out from under an active
    # stay — the FK cascade on beds.ward_id would otherwise silently strand
    # admissions pointing at a bed that no longer exists.
    occupied = (
        scoped(db, models.Bed, tenant_id)
        .filter(models.Bed.ward_id == ward_id, models.Bed.status == "occupied")
        .first()
    )
    if occupied is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This ward has an occupied bed and cannot be deleted",
        )
    db.delete(ward)
    db.commit()

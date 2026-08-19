from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import require_permission
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, paginate, text_search

router = APIRouter(prefix="/medicines", tags=["medicines"])


@router.get("", response_model=list[schemas.MedicineOut])
def list_medicines(
    response: Response,
    category: Optional[str] = Query(default=None),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("medicines.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Medicine, tenant_id)
    if category:
        query = query.filter(models.Medicine.category == category)
    query = text_search(query, [models.Medicine.name, models.Medicine.category, models.Medicine.form, models.Medicine.strength], params.q)
    query = query.order_by(models.Medicine.name)
    return paginate(query, response, params.limit, params.offset).all()


@router.post("", response_model=schemas.MedicineOut, status_code=status.HTTP_201_CREATED)
def create_medicine(
    body: schemas.MedicineCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("medicines.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    medicine = models.Medicine(id=new_id("med"), hospital_id=tenant_id, **body.model_dump())
    db.add(medicine)
    db.commit()
    db.refresh(medicine)
    return medicine


@router.put("/{medicine_id}", response_model=schemas.MedicineOut)
def update_medicine(
    medicine_id: str,
    body: schemas.MedicineUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("medicines.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    medicine = (
        scoped(db, models.Medicine, tenant_id)
        .filter(models.Medicine.id == medicine_id)
        .first()
    )
    if medicine is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Medicine not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(medicine, field, value)
    db.commit()
    db.refresh(medicine)
    return medicine


@router.delete("/{medicine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_medicine(
    medicine_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("medicines.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    medicine = (
        scoped(db, models.Medicine, tenant_id)
        .filter(models.Medicine.id == medicine_id)
        .first()
    )
    if medicine is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Medicine not found")
    db.delete(medicine)
    db.commit()

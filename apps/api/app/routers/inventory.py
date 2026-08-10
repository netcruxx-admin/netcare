"""Inventory movements — restock, dispense, expire, adjust medicine stock."""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import require_permission
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, now_iso, paginate

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("/movements", response_model=list[schemas.InventoryMovementOut])
def list_movements(
    response: Response,
    medicine_id: Optional[str] = Query(default=None, alias="medicineId"),
    movement_type: Optional[str] = Query(default=None, alias="type"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("inventory.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.InventoryMovement, tenant_id)
    if medicine_id:
        query = query.filter(models.InventoryMovement.medicine_id == medicine_id)
    if movement_type:
        query = query.filter(models.InventoryMovement.movement_type == movement_type)
    query = query.order_by(models.InventoryMovement.created_at.desc())
    rows = paginate(query, response, params.limit, params.offset).all()
    return [_enrich(db, tenant_id, m) for m in rows]


@router.get("/low-stock", response_model=list[schemas.MedicineOut])
def list_low_stock(
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("inventory.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Medicines at or below their reorder level."""
    meds = (
        scoped(db, models.Medicine, tenant_id)
        .filter(models.Medicine.stock <= models.Medicine.reorder_level)
        .order_by(models.Medicine.stock.asc())
        .all()
    )
    return meds


@router.post("/restock", response_model=schemas.InventoryMovementOut, status_code=status.HTTP_201_CREATED)
def restock(
    body: schemas.RestockBody,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _: str = Depends(require_permission("inventory.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    med = scoped(db, models.Medicine, tenant_id).filter(models.Medicine.id == body.medicine_id).first()
    if med is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Medicine not found")
    med.stock += body.quantity
    movement = models.InventoryMovement(
        id=new_id("inv"),
        hospital_id=tenant_id,
        medicine_id=body.medicine_id,
        movement_type="restock",
        quantity=body.quantity,
        lot_number=body.lot_number,
        expiry_date=body.expiry_date,
        notes=body.notes,
        performed_by=user.id,
        created_at=now_iso(),
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return _enrich(db, tenant_id, movement)


@router.post("/adjust", response_model=schemas.InventoryMovementOut, status_code=status.HTTP_201_CREATED)
def adjust(
    body: schemas.InventoryAdjustBody,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _: str = Depends(require_permission("inventory.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    med = scoped(db, models.Medicine, tenant_id).filter(models.Medicine.id == body.medicine_id).first()
    if med is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Medicine not found")
    med.stock = max(0, med.stock + body.quantity)
    movement = models.InventoryMovement(
        id=new_id("inv"),
        hospital_id=tenant_id,
        medicine_id=body.medicine_id,
        movement_type=body.movement_type,
        quantity=body.quantity,
        notes=body.notes,
        performed_by=user.id,
        created_at=now_iso(),
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return _enrich(db, tenant_id, movement)


def _enrich(db: Session, tenant_id: str, m: models.InventoryMovement) -> schemas.InventoryMovementOut:
    result = schemas.InventoryMovementOut.model_validate(m)
    med = scoped(db, models.Medicine, tenant_id).filter(models.Medicine.id == m.medicine_id).first()
    if med:
        result.medicine_name = med.name
    u = db.query(models.User).filter(models.User.id == m.performed_by).first()
    if u:
        result.performed_by_name = u.name
    return result

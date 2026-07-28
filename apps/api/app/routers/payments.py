from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..utils import new_id, now_iso

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("", response_model=list[schemas.PaymentOut])
def list_payments(
    patient_id: Optional[str] = None,
    appointment_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    query = db.query(models.Payment)
    if patient_id:
        query = query.filter(models.Payment.patient_id == patient_id)
    if appointment_id:
        query = query.filter(models.Payment.appointment_id == appointment_id)
    return query.all()


@router.post("", response_model=schemas.PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    body: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    payment = models.Payment(id=new_id("pay"), created_at=now_iso(), **body.model_dump())
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment

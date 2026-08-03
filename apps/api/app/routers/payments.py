from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, own_record_filter, require_permission
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, now_iso, paginate, text_search

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("", response_model=list[schemas.PaymentOut])
def list_payments(
    response: Response,
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    appointment_id: Optional[str] = Query(default=None, alias="appointmentId"),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("payments.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Payment, tenant_id)
    if patient_id:
        query = query.filter(models.Payment.patient_id == patient_id)
    if appointment_id:
        query = query.filter(models.Payment.appointment_id == appointment_id)
    # The filters above are caller-supplied conveniences, not access control:
    # with scope "own" the caller must be a party to the row, so passing someone
    # else's id narrows the result to nothing rather than exposing their records.
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.Payment))
    if status_filter:
        query = query.filter(models.Payment.status == status_filter)
    query = text_search(query, [models.Payment.payment_method, models.Payment.id], params.q)
    query = query.order_by(models.Payment.created_at.desc(), models.Payment.id)
    return paginate(query, response, params.limit, params.offset).all()


@router.post("", response_model=schemas.PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    body: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("payments.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    payment = models.Payment(
        id=new_id("pay"),
        hospital_id=tenant_id,
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.put("/{payment_id}", response_model=schemas.PaymentOut)
def update_payment(
    payment_id: str,
    body: schemas.PaymentUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("payments.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    payment = (
        scoped(db, models.Payment, tenant_id)
        .filter(models.Payment.id == payment_id)
        .first()
    )
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(payment, field, value)
    db.commit()
    db.refresh(payment)
    return payment

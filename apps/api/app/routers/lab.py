"""Lab orders + results. A doctor raises a test order; lab staff advance its
status and enter results (one result per test, upserted); the order is finally
reviewed. All rows are tenant-scoped."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import require_permission
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import new_id, now_iso

router = APIRouter(tags=["lab"])


# ---------- Test orders ----------
@router.get("/test-orders", response_model=list[schemas.TestOrderOut])
def list_test_orders(
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    doctor_id: Optional[str] = Query(default=None, alias="doctorId"),
    appointment_id: Optional[str] = Query(default=None, alias="appointmentId"),
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("lab_orders.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.TestOrder, tenant_id)
    if patient_id:
        query = query.filter(models.TestOrder.patient_id == patient_id)
    if doctor_id:
        query = query.filter(models.TestOrder.doctor_id == doctor_id)
    if appointment_id:
        query = query.filter(models.TestOrder.appointment_id == appointment_id)
    return query.all()


@router.post(
    "/test-orders", response_model=schemas.TestOrderOut, status_code=status.HTTP_201_CREATED
)
def create_test_order(
    body: schemas.TestOrderCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("lab_orders.create")),
    tenant_id: str = Depends(get_tenant_id),
):
    now = now_iso()
    payload = body.model_dump()
    payload["items"] = [i for i in payload.get("items", [])]  # plain dicts for JSON
    order = models.TestOrder(
        id=new_id("ord"),
        hospital_id=tenant_id,
        status="ordered",
        ordered_at=now,
        updated_at=now,
        **payload,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def _get_order(db: Session, order_id: str, tenant_id: str) -> models.TestOrder:
    order = (
        scoped(db, models.TestOrder, tenant_id)
        .filter(models.TestOrder.id == order_id)
        .first()
    )
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Test order not found")
    return order


@router.get("/test-orders/{order_id}", response_model=schemas.TestOrderOut)
def get_test_order(
    order_id: str,
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("lab_orders.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    return _get_order(db, order_id, tenant_id)


@router.put("/test-orders/{order_id}", response_model=schemas.TestOrderOut)
def update_test_order(
    order_id: str,
    body: schemas.TestOrderUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("lab_orders.process")),
    tenant_id: str = Depends(get_tenant_id),
):
    order = _get_order(db, order_id, tenant_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(order, field, value)
    order.updated_at = now_iso()
    db.commit()
    db.refresh(order)
    return order


@router.delete("/test-orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test_order(
    order_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("lab_orders.process")),
    tenant_id: str = Depends(get_tenant_id),
):
    order = _get_order(db, order_id, tenant_id)
    # Cascade: drop this order's results too.
    for result in (
        scoped(db, models.TestResult, tenant_id)
        .filter(models.TestResult.order_id == order_id)
        .all()
    ):
        db.delete(result)
    db.delete(order)
    db.commit()


# ---------- Test results ----------
@router.get("/test-results", response_model=list[schemas.TestResultOut])
def list_test_results(
    order_id: Optional[str] = Query(default=None, alias="orderId"),
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("lab_reports.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.TestResult, tenant_id)
    if order_id:
        query = query.filter(models.TestResult.order_id == order_id)
    return query.all()


@router.post("/test-results", response_model=schemas.TestResultOut)
def upsert_test_result(
    body: schemas.TestResultUpsert,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("lab_orders.process")),
    tenant_id: str = Depends(get_tenant_id),
):
    # One result per (order, test): update in place if it already exists.
    existing = (
        scoped(db, models.TestResult, tenant_id)
        .filter(
            models.TestResult.order_id == body.order_id,
            models.TestResult.test_id == body.test_id,
        )
        .first()
    )
    payload = body.model_dump()
    if existing is not None:
        for field, value in payload.items():
            setattr(existing, field, value)
        existing.reported_at = now_iso()
        db.commit()
        db.refresh(existing)
        return existing

    result = models.TestResult(
        id=new_id("res"),
        hospital_id=tenant_id,
        reported_at=now_iso(),
        **payload,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result

"""Lab orders + results. A doctor raises a test order; lab staff advance its
status and enter results (one result per test, upserted); the order is finally
reviewed. All rows are tenant-scoped."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session, aliased

from .. import models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, caller_doctor_id, caller_patient_id, own_record_filter, require_permission
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import (
    ListQuery,
    list_params,
    new_id,
    now_iso,
    paginate,
    patient_display,
    result_summaries,
    text_search,
)

router = APIRouter(tags=["lab"])


# ---------- Test orders ----------
@router.get("/test-orders", response_model=list[schemas.TestOrderOut])
def list_test_orders(
    response: Response,
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    doctor_id: Optional[str] = Query(default=None, alias="doctorId"),
    appointment_id: Optional[str] = Query(default=None, alias="appointmentId"),
    q: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    limit: Optional[int] = Query(default=None, ge=1),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("lab_orders.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.TestOrder, tenant_id)
    # Narrow to the caller's own orders (patient sees theirs; doctor sees theirs).
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.TestOrder))
    if patient_id:
        query = query.filter(models.TestOrder.patient_id == patient_id)
    if doctor_id:
        query = query.filter(models.TestOrder.doctor_id == doctor_id)
    if appointment_id:
        query = query.filter(models.TestOrder.appointment_id == appointment_id)
    if status_filter:
        # Comma-separated, so the reports screen can ask for the one set it
        # means ("completed,reviewed") instead of fetching everything and
        # dropping the rest client-side.
        wanted = [s.strip() for s in status_filter.split(",") if s.strip()]
        query = query.filter(models.TestOrder.status.in_(wanted))
    if q:
        # Order id, the patient's name, or any test name on the order. `items`
        # is a JSON array of tests, so it is matched as text — crude, but it
        # keeps the client's "search by test name" behaviour working.
        like = f"%{q.strip().lower()}%"
        pat_user = aliased(models.User)
        query = (
            query.outerjoin(
                models.Patient, models.Patient.id == models.TestOrder.patient_id
            )
            .outerjoin(pat_user, pat_user.id == models.Patient.user_id)
            .filter(
                or_(
                    func.lower(models.TestOrder.id).like(like),
                    func.lower(pat_user.name).like(like),
                    func.lower(cast(models.TestOrder.items, String)).like(like),
                )
            )
        )
    query = query.order_by(models.TestOrder.ordered_at.desc(), models.TestOrder.id)
    rows = paginate(query, response, limit, offset).all()

    patients = patient_display(db, (r.patient_id for r in rows))
    # Whether an order has a report, and whether anything on it is flagged.
    # Both list screens show these as a badge; answering here is one query over
    # the page instead of the client downloading every result in the hospital.
    summaries = result_summaries(db, (r.id for r in rows))
    out = []
    for row in rows:
        item = schemas.TestOrderOut.model_validate(row)
        item.patient_name = patients.get(row.patient_id, ("", ""))[0]
        summary = summaries.get(row.id)
        if summary is not None:
            item.has_results = summary.has_results
            item.abnormal = summary.abnormal
            item.reported_at = summary.reported_at
            item.reported_by = summary.reported_by
        out.append(item)
    return out


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


@router.put("/test-orders/{order_id}/review", response_model=schemas.TestOrderOut)
def review_test_order(
    order_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("lab_orders.review")),
    tenant_id: str = Depends(get_tenant_id),
):
    """The ordering clinician signs off on a published result.

    Separate from the generic update because it is a different act from the
    lab's own work: processing a sample and reviewing the finding are held by
    different people, so they are different permissions.
    """
    order = _get_order(db, order_id, tenant_id)
    if scope == SCOPE_OWN and order.doctor_id != caller_doctor_id(db, user):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Test order not found"
        )
    if order.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a completed order can be reviewed",
        )
    order.status = "reviewed"
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
    response: Response,
    order_id: Optional[str] = Query(default=None, alias="orderId"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("lab_reports.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.TestResult, tenant_id)
    # TestResult has no patient_id, so "own" scope is enforced via the parent order.
    if scope == SCOPE_OWN:
        own_pid = caller_patient_id(db, user)
        if own_pid:
            query = query.join(
                models.TestOrder, models.TestOrder.id == models.TestResult.order_id
            ).filter(models.TestOrder.patient_id == own_pid)
        else:
            # Non-patient with own scope (e.g. doctor) — not a supported use case
            # for this endpoint yet; return nothing rather than everything.
            from sqlalchemy import false
            query = query.filter(false())
    if order_id:
        # Comma-separated, so a screen showing several orders can ask for their
        # results in one request instead of fetching every result in the
        # hospital and filtering client-side.
        wanted = [o.strip() for o in order_id.split(",") if o.strip()]
        query = query.filter(models.TestResult.order_id.in_(wanted))
    query = text_search(
        query,
        [models.TestResult.test_name, models.TestResult.remarks, models.TestResult.reported_by],
        params.q,
    )
    query = query.order_by(models.TestResult.reported_at.desc(), models.TestResult.id)
    return paginate(query, response, params.limit, params.offset).all()


@router.post("/test-results", response_model=schemas.TestResultOut)
def upsert_test_result(
    body: schemas.TestResultUpsert,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("lab_orders.process")),
    tenant_id: str = Depends(get_tenant_id),
):
    # A result is meaningless without the order it belongs to, and the order has
    # to be one of ours. Without this an unknown or foreign order id silently
    # produces an orphan report that no chart will ever show.
    order = (
        scoped(db, models.TestOrder, tenant_id)
        .filter(models.TestOrder.id == body.order_id)
        .first()
    )
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Test order not found"
        )
    # Items are stored as raw JSON, so the key is snake_case for rows written
    # through the API and camelCase for anything seeded from the frontend shape.
    ordered_tests = {
        item.get("test_id") or item.get("testId") for item in (order.items or [])
    }
    if body.test_id not in ordered_tests:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That test is not part of this order",
        )

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

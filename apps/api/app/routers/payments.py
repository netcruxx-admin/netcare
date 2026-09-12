import hashlib
import hmac
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import consent as consent_lib, models, pricing, printing, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, caller_patient_id, own_record_filter, require_permission
from ..config import settings
from ..database import get_db
from ..tenancy import assert_body_in_tenant, assert_in_tenant, get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, now_iso, paginate, text_search
from ..utils import assert_no_duplicate_department_booking, doctor_display, patient_display

router = APIRouter(prefix="/payments", tags=["payments"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_razorpay_keys(db: Session, tenant_id: str) -> tuple[str, str]:
    """Return (key_id, key_secret) for this tenant.

    Priority: hospital's own Razorpay keys (stored in HospitalProfile) →
    platform-level keys from environment. Raises 503 when neither is configured.
    """
    profile = (
        db.query(models.HospitalProfile)
        .filter(models.HospitalProfile.hospital_id == tenant_id)
        .first()
    )
    if profile and profile.razorpay_key_id and profile.razorpay_key_secret:
        return profile.razorpay_key_id, profile.razorpay_key_secret

    # Fall back to platform keys
    if settings.razorpay_key_id and settings.razorpay_key_secret:
        return settings.razorpay_key_id, settings.razorpay_key_secret

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Online payments are not configured for this hospital. Use cash payment instead.",
    )


def _billing_date_filter(query, date: Optional[str], date_from: Optional[str], date_to: Optional[str]):
    """Narrow a Payment query to a day (`date`) or a range (`date_from`/`date_to`).

    `created_at` is an ISO datetime string, so comparing its first 10 characters
    against plain YYYY-MM-DD bounds sorts correctly without needing to guess a
    time-of-day boundary. A range takes priority when both are given; with
    neither, the caller's own "defaults to today" behavior is unaffected.
    """
    if date_from or date_to:
        day = func.substr(models.Payment.created_at, 1, 10)
        if date_from:
            query = query.filter(day >= date_from)
        if date_to:
            query = query.filter(day <= date_to)
        return query
    import datetime as dt

    report_date = date or dt.date.today().isoformat()
    return query.filter(models.Payment.created_at.like(f"{report_date}%"))


def _razorpay_client(db: Session, tenant_id: str):
    """Return a Razorpay client using this hospital's keys (or the platform fallback).

    Imported lazily so the rest of the API starts cleanly in environments that
    do not have Razorpay keys set (test suite, cash-only hospitals, etc.).
    """
    key_id, key_secret = _resolve_razorpay_keys(db, tenant_id)
    import razorpay  # noqa: PLC0415 — intentional lazy import

    return razorpay.Client(auth=(key_id, key_secret))


def _verify_razorpay_signature(
    order_id: str, payment_id: str, signature: str, key_secret: str
) -> bool:
    """HMAC-SHA256 check per Razorpay docs.

    The signed message is <order_id>|<payment_id>; the key is the API secret.
    Returns True only when the digest matches exactly.
    """
    message = f"{order_id}|{payment_id}".encode()
    key = key_secret.encode()
    expected = hmac.new(key, message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


# ---------------------------------------------------------------------------
# Standard CRUD (unchanged)
# ---------------------------------------------------------------------------

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


@router.get("/consultation-billing", response_model=schemas.ConsultationBillingSummary)
def get_consultation_billing_summary(
    date: Optional[str] = Query(default=None, description="YYYY-MM-DD, defaults to today"),
    date_from: Optional[str] = Query(default=None, alias="dateFrom"),
    date_to: Optional[str] = Query(default=None, alias="dateTo"),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _scope: str = Depends(require_permission("payments.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Day- or range-level consultation billing for the front desk.

    The counterpart to the pharmacy report: every consultation payment for the
    day or range with the patient, the doctor, what kind of visit it was billed
    as, and the method breakdown. `pending_total` is billed-but-uncollected — the
    number the desk chases before close of day, and the reason status travels on
    each row rather than being filtered out.
    """
    import datetime as dt

    report_date = date or date_from or dt.date.today().isoformat()

    query = (
        scoped(db, models.Payment, tenant_id)
        .filter(models.Payment.payment_type == "consultation")
    )
    query = _billing_date_filter(query, date, date_from, date_to)
    payments = query.order_by(models.Payment.created_at.asc()).all()

    # Resolve display names in one query each, rather than per row.
    patient_map = patient_display(db, list({p.patient_id for p in payments}), tenant_id)

    appointment_ids = [p.appointment_id for p in payments if p.appointment_id]
    appointment_map: dict = {}
    if appointment_ids:
        appointments = (
            scoped(db, models.Appointment, tenant_id)
            .filter(models.Appointment.id.in_(appointment_ids))
            .all()
        )
        appointment_map = {a.id: a for a in appointments}

    doctor_map = doctor_display(
        db, list({a.doctor_id for a in appointment_map.values()}), tenant_id
    )
    department_map = {
        d.id: d.name for d in scoped(db, models.Department, tenant_id).all()
    }
    visit_labels = pricing.label_map(db, tenant_id)

    rows: list[schemas.ConsultationBillingRow] = []
    total = cash_total = upi_total = card_total = pending_total = 0.0

    for payment in payments:
        patient_name, patient_phone = patient_map.get(payment.patient_id, ("", ""))
        appointment = appointment_map.get(payment.appointment_id or "")
        visit_type = (appointment.visit_type if appointment else "") or ""

        rows.append(schemas.ConsultationBillingRow(
            payment_id=payment.id,
            invoice_number=payment.id.replace("pay-", "INV-").upper(),
            created_at=payment.created_at,
            patient_name=patient_name,
            patient_phone=patient_phone,
            doctor_name=doctor_map.get(appointment.doctor_id, "") if appointment else "",
            department_name=department_map.get(appointment.department_id, "") if appointment else "",
            visit_type=visit_type,
            visit_type_label=visit_labels.get(visit_type, visit_type),
            appointment_date=(appointment.date if appointment else "") or "",
            appointment_time=(appointment.time if appointment else "") or "",
            amount=payment.amount,
            status=payment.status or "",
            payment_method=payment.payment_method or "",
        ))

        # Only money actually collected counts toward the day's takings; the
        # rest is what the desk still has to collect.
        if (payment.status or "") != "completed":
            pending_total += payment.amount
            continue

        total += payment.amount
        method = (payment.payment_method or "").lower()
        if method == "cash":
            cash_total += payment.amount
        elif method in ("upi", "qr"):
            upi_total += payment.amount
        elif method == "card":
            card_total += payment.amount

    return schemas.ConsultationBillingSummary(
        date=report_date,
        rows=rows,
        total=round(total, 2),
        cash_total=round(cash_total, 2),
        upi_total=round(upi_total, 2),
        card_total=round(card_total, 2),
        pending_total=round(pending_total, 2),
        bill_count=len(rows),
    )


@router.get("/pharmacy-billing", response_model=schemas.PharmacyBillingSummary)
def get_pharmacy_billing_summary(
    date: Optional[str] = Query(default=None, description="YYYY-MM-DD, defaults to today"),
    date_from: Optional[str] = Query(default=None, alias="dateFrom"),
    date_to: Optional[str] = Query(default=None, alias="dateTo"),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _scope: str = Depends(require_permission("payments.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Day- or range-level billing summary for the pharmacy counter.

    Returns every pharmacy payment for the given day or range together with the
    patient name, medicine details and method breakdown — everything the
    pharmacist needs for end-of-shift reconciliation. Defaults to today when
    nothing is supplied.
    """
    import datetime as dt

    report_date = date or date_from or dt.date.today().isoformat()

    query = (
        scoped(db, models.Payment, tenant_id)
        .filter(models.Payment.payment_type == "pharmacy")
    )
    query = _billing_date_filter(query, date, date_from, date_to)
    payments = query.order_by(models.Payment.created_at.asc()).all()

    # Resolve patient names in one query.
    patient_ids = list({p.patient_id for p in payments})
    patient_map = patient_display(db, patient_ids, tenant_id)

    # Resolve medication orders in one query.
    order_ids = [p.medication_order_id for p in payments if p.medication_order_id]
    order_map: dict = {}
    if order_ids:
        orders = (
            scoped(db, models.MedicationOrder, tenant_id)
            .filter(models.MedicationOrder.id.in_(order_ids))
            .all()
        )
        order_map = {o.id: o for o in orders}

    rows: list[schemas.PharmacyBillingRow] = []
    total = cash_total = upi_total = card_total = 0.0

    for payment in payments:
        patient_name, patient_phone = patient_map.get(payment.patient_id, ("", ""))
        order = order_map.get(payment.medication_order_id or "")
        medicine_name = (order.medicine_name if order else "") or ""
        dosage = (order.dosage if order else "") or ""
        quantity = (order.quantity if order else 1) or 1
        unit_price = round(payment.amount / quantity, 2) if quantity else payment.amount

        rows.append(schemas.PharmacyBillingRow(
            payment_id=payment.id,
            invoice_number=payment.id.replace("pay-", "INV-").upper(),
            created_at=payment.created_at,
            patient_name=patient_name,
            patient_phone=patient_phone,
            medicine_name=medicine_name,
            dosage=dosage,
            quantity=quantity,
            unit_price=unit_price,
            amount=payment.amount,
            payment_method=payment.payment_method or "",
        ))

        total += payment.amount
        method = (payment.payment_method or "").lower()
        if method == "cash":
            cash_total += payment.amount
        elif method in ("upi", "qr"):
            upi_total += payment.amount
        elif method == "card":
            card_total += payment.amount

    return schemas.PharmacyBillingSummary(
        date=report_date,
        rows=rows,
        total=round(total, 2),
        cash_total=round(cash_total, 2),
        upi_total=round(upi_total, 2),
        card_total=round(card_total, 2),
        bill_count=len(rows),
    )


@router.get("/injectable-lab-billing", response_model=schemas.InjectableLabBillingSummary)
def get_injectable_lab_billing_summary(
    date: Optional[str] = Query(default=None, description="YYYY-MM-DD, defaults to today"),
    date_from: Optional[str] = Query(default=None, alias="dateFrom"),
    date_to: Optional[str] = Query(default=None, alias="dateTo"),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _scope: str = Depends(require_permission("payments.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Day- or range-level billing summary combining injectables and lab tests.

    Both bill automatically, the way a consultation does: administering a shot
    or completing a test order raises a `pending` Payment with no method yet,
    and the front desk collects and records it from here — nurses and lab
    staff never handle money. `pending_total` is what the desk still has to
    chase before close of day, the same number the consultation report keeps.
    """
    import datetime as dt

    report_date = date or date_from or dt.date.today().isoformat()

    query = (
        scoped(db, models.Payment, tenant_id)
        .filter(models.Payment.payment_type.in_(("injectable", "lab")))
    )
    query = _billing_date_filter(query, date, date_from, date_to)
    payments = query.order_by(models.Payment.created_at.asc()).all()

    patient_ids = list({p.patient_id for p in payments})
    patient_map = patient_display(db, patient_ids, tenant_id)

    injection_ids = [p.injection_order_id for p in payments if p.injection_order_id]
    injection_map: dict = {}
    if injection_ids:
        injection_orders = (
            scoped(db, models.InjectionOrder, tenant_id)
            .filter(models.InjectionOrder.id.in_(injection_ids))
            .all()
        )
        injection_map = {o.id: o for o in injection_orders}

    test_ids = [p.test_order_id for p in payments if p.test_order_id]
    test_map: dict = {}
    if test_ids:
        test_orders = (
            scoped(db, models.TestOrder, tenant_id)
            .filter(models.TestOrder.id.in_(test_ids))
            .all()
        )
        test_map = {o.id: o for o in test_orders}

    rows: list[schemas.InjectableLabBillingRow] = []
    total = cash_total = upi_total = card_total = pending_total = 0.0

    for payment in payments:
        patient_name, patient_phone = patient_map.get(payment.patient_id, ("", ""))

        if payment.payment_type == "injectable":
            order = injection_map.get(payment.injection_order_id or "")
            description = (order.injectable_name if order else "") or "Injectable"
            if order and order.dose:
                description = f"{description} ({order.dose})"
            quantity = (order.quantity if order else 1) or 1
        else:
            order = test_map.get(payment.test_order_id or "")
            items = (order.items if order else []) or []
            description = ", ".join(i.get("name", "") for i in items) or "Lab tests"
            quantity = len(items) or 1

        rows.append(schemas.InjectableLabBillingRow(
            payment_id=payment.id,
            invoice_number=payment.id.replace("pay-", "INV-").upper(),
            created_at=payment.created_at,
            patient_name=patient_name,
            patient_phone=patient_phone,
            category=payment.payment_type,
            description=description,
            quantity=quantity,
            amount=payment.amount,
            status=payment.status or "",
            payment_method=payment.payment_method or "",
        ))

        # Only money actually collected counts toward the day's takings; the
        # rest is what the desk still has to collect.
        if (payment.status or "") != "completed":
            pending_total += payment.amount
            continue

        total += payment.amount
        method = (payment.payment_method or "").lower()
        if method == "cash":
            cash_total += payment.amount
        elif method in ("upi", "qr"):
            upi_total += payment.amount
        elif method == "card":
            card_total += payment.amount

    return schemas.InjectableLabBillingSummary(
        date=report_date,
        rows=rows,
        total=round(total, 2),
        cash_total=round(cash_total, 2),
        upi_total=round(upi_total, 2),
        card_total=round(card_total, 2),
        pending_total=round(pending_total, 2),
        bill_count=len(rows),
    )


@router.get("/{payment_id}/invoice", response_model=schemas.InvoiceOut)
def get_invoice(
    payment_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("payments.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    """One bill, assembled server-side.

    The seller block is the reason this endpoint exists. A bill carries the
    hospital's legal name and GSTIN, and those are exactly what
    `GET /hospitals/current` stopped serving when it was narrowed — that
    endpoint is unauthenticated. The patient reading their own bill *is*
    signed in, so the answer belongs here rather than in a public response
    everyone can read.

    Scope `own` restricts a patient to their own bills, the same filter the
    list endpoint uses; a bill that is not yours is 404, not 403.
    """
    query = scoped(db, models.Payment, tenant_id).filter(models.Payment.id == payment_id)
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.Payment))
    payment = query.first()
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    hospital = db.get(models.Hospital, tenant_id)
    # The seller block — legal name, GSTIN, letterhead, logo — is the same
    # hospital identity that goes on top of a lab report or a prescription, so
    # it is composed in one place. `InvoiceSeller` ignores the `signature_url`
    # key the helper also returns; the GSTIN it keeps.
    seller = schemas.InvoiceSeller(**printing.build_print_header(db, tenant_id))

    # Both helpers take an iterable and answer with a dict — one query, and the
    # tenant is passed so a foreign id can never be resolved to a real name.
    patient_name, patient_phone = patient_display(
        db, [payment.patient_id], tenant_id
    ).get(payment.patient_id, ("", ""))

    # One line per bill today: a consultation, or one dispensed medicine. The
    # shape is a list because a pharmacy bill covering several medicines is the
    # obvious next step, and a caller that already handles a list will not need
    # changing for it.
    lines: list[schemas.InvoiceLine] = []
    if payment.payment_type == "pharmacy" and payment.medication_order_id:
        order = (
            scoped(db, models.MedicationOrder, tenant_id)
            .filter(models.MedicationOrder.id == payment.medication_order_id)
            .first()
        )
        quantity = (order.quantity or 1) if order else 1
        description = (order.medicine_name if order else "") or "Medicines"
        if order and order.dosage:
            description = f"{description} ({order.dosage})"
        lines.append(schemas.InvoiceLine(
            description=description,
            quantity=quantity,
            unit_price=round(payment.amount / quantity, 2) if quantity else payment.amount,
            amount=payment.amount,
        ))
    elif payment.payment_type == "injectable" and payment.injection_order_id:
        order = (
            scoped(db, models.InjectionOrder, tenant_id)
            .filter(models.InjectionOrder.id == payment.injection_order_id)
            .first()
        )
        quantity = (order.quantity or 1) if order else 1
        description = (order.injectable_name if order else "") or "Injectable"
        if order and order.dose:
            description = f"{description} ({order.dose})"
        lines.append(schemas.InvoiceLine(
            description=description,
            quantity=quantity,
            unit_price=round(payment.amount / quantity, 2) if quantity else payment.amount,
            amount=payment.amount,
        ))
    elif payment.payment_type == "lab" and payment.test_order_id:
        order = (
            scoped(db, models.TestOrder, tenant_id)
            .filter(models.TestOrder.id == payment.test_order_id)
            .first()
        )
        items = (order.items if order else []) or []
        # One line per test, using each item's own price as captured on the
        # order — the multi-line case the shape above was always meant for.
        for item in items:
            price = float(item.get("price") or 0)
            lines.append(schemas.InvoiceLine(
                description=item.get("name", "") or "Lab test",
                quantity=1,
                unit_price=price,
                amount=price,
            ))
        if not lines:
            lines.append(schemas.InvoiceLine(
                description="Lab tests", quantity=1,
                unit_price=payment.amount, amount=payment.amount,
            ))
    else:
        description = "Consultation"
        if payment.appointment_id:
            appointment = (
                scoped(db, models.Appointment, tenant_id)
                .filter(models.Appointment.id == payment.appointment_id)
                .first()
            )
            if appointment is not None:
                # doctor_display maps id -> name; patient_display maps
                # id -> (name, phone). Different shapes, same one-query idea.
                doctor_name = doctor_display(
                    db, [appointment.doctor_id], tenant_id
                ).get(appointment.doctor_id, "")
                if doctor_name:
                    description = f"Consultation — Dr. {doctor_name}"
        lines.append(schemas.InvoiceLine(
            description=description, quantity=1,
            unit_price=payment.amount, amount=payment.amount,
        ))

    return schemas.InvoiceOut(
        payment_id=payment.id,
        # Derived from the id rather than a counter: a real invoice series has
        # to be gapless and sequential per financial year, which is a schema
        # change and a policy decision, not a format string.
        number=payment.id.replace("pay-", "INV-").upper(),
        issued_at=payment.created_at,
        payment_type=payment.payment_type or "consultation",
        payment_method=payment.payment_method or "",
        status=payment.status,
        currency=(hospital.currency or "INR") if hospital else "INR",
        seller=seller,
        patient_name=patient_name,
        patient_phone=patient_phone,
        lines=lines,
        total=payment.amount,
    )


@router.post("", response_model=schemas.PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    body: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    # Raising a bill, not altering one: the front desk records what a patient
    # owes when it books them, without also being able to edit or void a bill.
    _: str = Depends(require_permission("payments.create")),
    tenant_id: str = Depends(get_tenant_id),
):
    # Every foreign key on the body, checked against the caller's tenant.
    # Without this a row filed here can point at another hospital's records,
    # and the display helpers then resolve that id to a real name.
    assert_body_in_tenant(db, body, tenant_id)
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


# ---------------------------------------------------------------------------
# Online payment flow: initiate → Razorpay checkout (client) → verify
# ---------------------------------------------------------------------------

@router.post(
    "/initiate",
    response_model=schemas.PaymentInitiateOut,
    status_code=status.HTTP_200_OK,
    summary="Create a Razorpay order before the checkout dialog opens",
)
def initiate_payment(
    body: schemas.PaymentInitiateBody,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("appointments.create")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Step 1 of the online booking flow.

    Creates a Razorpay order server-side so the amount is set by us, not the
    browser. Returns the order_id and the key_id the frontend needs to open
    the Razorpay checkout.

    The appointment is NOT created here. It is created atomically with the
    payment record in /payments/verify, only after the gateway signature is
    confirmed. This prevents ghost bookings from abandoned checkouts.
    """
    # A patient booking for themselves, or staff booking for a patient.
    if scope == SCOPE_OWN:
        own_patient = caller_patient_id(db, user)
        if own_patient is None or body.patient_id != own_patient:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only initiate payment for your own appointment",
            )

    # Tenant-scope all three ids so a cross-tenant booking cannot be attempted.
    assert_in_tenant(db, models.Patient, body.patient_id, tenant_id)
    assert_in_tenant(db, models.Doctor, body.doctor_id, tenant_id)
    assert_in_tenant(db, models.Department, body.department_id, tenant_id)

    # Checked here, before any money moves, rather than only in /verify: a
    # patient charged for a booking that then gets refused would be the worst
    # of the outcomes this rule could cause. See /verify for why it is not
    # re-enforced as a hard refusal there.
    assert_no_duplicate_department_booking(
        db, tenant_id, body.patient_id, body.department_id, body.date
    )

    # The fee comes from the hospital's price list, not the client — naming a
    # visit type cannot forge a cheaper amount, and pricing.fee_for refuses an
    # unpriced or retired one rather than booking at zero.
    fee_inr = pricing.fee_for(db, tenant_id, body.visit_type)

    amount_paise = int(fee_inr * 100)  # Razorpay expects paise (1 INR = 100 paise)

    key_id, _secret = _resolve_razorpay_keys(db, tenant_id)
    rzp = _razorpay_client(db, tenant_id)
    order = rzp.order.create(
        {
            "amount": amount_paise,
            "currency": "INR",
            # receipt is a free-text reference that appears in the Razorpay
            # dashboard. Using the patient id keeps it traceable without
            # putting PHI in the receipt field.
            "receipt": f"pat-{body.patient_id[:8]}",
            "payment_capture": 1,  # auto-capture on payment success
        }
    )

    return schemas.PaymentInitiateOut(
        order_id=order["id"],
        amount=fee_inr,
        amount_paise=amount_paise,
        currency="INR",
        key_id=key_id,
    )


@router.post(
    "/verify",
    response_model=schemas.PaymentVerifyOut,
    status_code=status.HTTP_201_CREATED,
    summary="Verify Razorpay signature and create appointment + payment atomically",
)
def verify_payment(
    body: schemas.PaymentVerifyBody,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("appointments.create")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Step 2 of the online booking flow (called from the Razorpay handler callback).

    Verifies the HMAC-SHA256 signature Razorpay sends with every successful
    payment. A forged signature is rejected with 400. A *replayed* one is not
    rejected — it is answered with the appointment that payment already bought,
    because the gateway retries and users double-click. Either way it can never
    buy a second booking.

    On success, creates the appointment and payment record in a single
    transaction. If either insert fails the whole thing rolls back — no
    orphaned appointments without a payment or vice versa.
    """
    # Same scope guard as initiate.
    if scope == SCOPE_OWN:
        own_patient = caller_patient_id(db, user)
        if own_patient is None or body.patient_id != own_patient:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only verify payment for your own appointment",
            )

    # Resolve keys early — needed for signature verification.
    _key_id, key_secret = _resolve_razorpay_keys(db, tenant_id)

    # Cryptographic verification — must happen before any DB write.
    if not _verify_razorpay_signature(
        body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, key_secret
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment signature verification failed. Do not retry — contact support.",
        )

    # Already recorded? Then this is a repeat of a payment we have seen, and
    # the answer is the booking it already bought.
    #
    # A Razorpay signature is a deterministic HMAC, so it never stops being
    # valid — without this, re-POSTing one successful checkout response minted
    # a fresh appointment every time. Returning the original rather than
    # refusing is deliberate: the gateway's callback can fire twice on a flaky
    # connection and a double-click must not cost the patient a second booking,
    # nor see them told their completed payment failed.
    existing = (
        scoped(db, models.Payment, tenant_id)
        .filter(models.Payment.gateway_payment_id == body.razorpay_payment_id)
        .first()
    )
    if existing is not None:
        prior = (
            scoped(db, models.Appointment, tenant_id)
            .filter(models.Appointment.id == existing.appointment_id)
            .first()
        )
        if prior is not None:
            return schemas.PaymentVerifyOut(
                appointment=schemas.AppointmentOut.model_validate(prior),
                payment=schemas.PaymentOut.model_validate(existing),
            )
        # A payment whose appointment has since been deleted. Re-creating one
        # from a replayed callback would resurrect a cancelled booking, so say
        # so rather than quietly booking again.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This payment has already been used and its appointment no longer exists.",
        )

    # Tenant-scope all three ids (same as create_appointment).
    assert_in_tenant(db, models.Patient, body.patient_id, tenant_id)
    assert_in_tenant(db, models.Doctor, body.doctor_id, tenant_id)
    assert_in_tenant(db, models.Department, body.department_id, tenant_id)

    # Deliberately not re-checked here: /initiate already refused a duplicate
    # booking before any money moved. A second booking racing in between
    # (two tabs, both past /initiate) is rare enough that refusing here — after
    # Razorpay has captured the payment — would trade it for the strictly worse
    # outcome the pricing comment below describes: charged with no appointment.

    # Re-price from the schedule so the amount stored in the payment row is
    # always ours, never a number the client sent.
    #
    # This one does NOT refuse an unpriced visit type, unlike /initiate. By the
    # time this runs Razorpay has taken the patient's money, so raising here
    # would leave them charged with no appointment — the worst of the outcomes
    # available. /initiate already refused an unpriced booking, so reaching this
    # line unpriced means the schedule changed mid-checkout; the booking stands
    # and the amount lands on the day-report for the desk to reconcile.
    priced = pricing.find_fee(db, tenant_id, body.visit_type)
    fee_inr = float(priced.amount or 0) if priced else 0.0

    # --- Create appointment ---
    appointment = models.Appointment(
        id=new_id("apt"),
        hospital_id=tenant_id,
        created_at=now_iso(),
        patient_id=body.patient_id,
        doctor_id=body.doctor_id,
        department_id=body.department_id,
        date=body.date,
        time=body.time,
        reason=body.reason,
        notes=body.notes,
        mode=body.mode,
        # Record what this visit was priced as, so the day-report and any later
        # question about the amount can be answered from the appointment itself.
        visit_type=body.visit_type,
        follow_up_of=body.follow_up_of,
    )
    db.add(appointment)
    db.flush()  # get appointment.id before inserting the payment

    # Telemedicine consent — same rule as create_appointment: a patient-
    # initiated video booking carries implied consent under the Guidelines.
    if appointment.mode == "video":
        own_patient = caller_patient_id(db, user)
        if own_patient is not None and appointment.patient_id == own_patient:
            purpose = db.get(models.ConsentPurpose, "telemedicine")
            if purpose is not None:
                consent_lib.record(
                    db,
                    tenant_id=tenant_id,
                    subject_user_id=user.id,
                    purpose=purpose,
                    method=consent_lib.METHOD_IMPLIED_PATIENT_INITIATED,
                    recorded_by_user_id=user.id,
                    appointment_id=appointment.id,
                )

    # --- Create payment record ---
    payment = models.Payment(
        id=new_id("pay"),
        hospital_id=tenant_id,
        appointment_id=appointment.id,
        patient_id=body.patient_id,
        amount=fee_inr,
        status="completed",
        payment_method="razorpay",
        gateway_order_id=body.razorpay_order_id,
        gateway_payment_id=body.razorpay_payment_id,
        created_at=now_iso(),
    )
    db.add(payment)

    db.commit()
    db.refresh(appointment)
    db.refresh(payment)

    return schemas.PaymentVerifyOut(
        appointment=schemas.AppointmentOut.model_validate(appointment),
        payment=schemas.PaymentOut.model_validate(payment),
    )

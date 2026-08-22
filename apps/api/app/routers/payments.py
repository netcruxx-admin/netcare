import hashlib
import hmac
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import consent as consent_lib, models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, caller_patient_id, own_record_filter, require_permission
from ..config import settings
from ..database import get_db
from ..tenancy import assert_body_in_tenant, assert_in_tenant, get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, now_iso, paginate, text_search

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


@router.post("", response_model=schemas.PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    body: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("payments.manage")),
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

    # The fee comes from the doctor record, not the client — the client cannot
    # forge a lower amount by altering the request body.
    doctor = scoped(db, models.Doctor, tenant_id).filter(
        models.Doctor.id == body.doctor_id
    ).first()
    if doctor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor not found")

    fee_inr = doctor.consultation_fee or 0.0
    if fee_inr <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This doctor has no consultation fee set. Please contact the hospital.",
        )

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
    payment. A forged or replayed signature is rejected with 400.

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

    # Tenant-scope all three ids (same as create_appointment).
    assert_in_tenant(db, models.Patient, body.patient_id, tenant_id)
    assert_in_tenant(db, models.Doctor, body.doctor_id, tenant_id)
    assert_in_tenant(db, models.Department, body.department_id, tenant_id)

    # Re-fetch the fee from the doctor record so the amount stored in the
    # payment row is always ours, never a number the client sent.
    doctor = scoped(db, models.Doctor, tenant_id).filter(
        models.Doctor.id == body.doctor_id
    ).first()
    if doctor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor not found")

    fee_inr = doctor.consultation_fee or 0.0

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

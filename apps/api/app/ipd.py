"""Shared IPD domain rules — used by routers/wards.py, beds.py, admissions.py,
progress_notes.py, discharge_summaries.py and ipd_billing.py.

Kept as its own module, the way pricing.py and consent.py already are, so a
rule used by more than one IPD router has exactly one copy rather than one
per file that could quietly drift apart.
"""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import models
from .tenancy import scoped

# Once an admission leaves "admitted" it is closed. Every closed status is a
# discharge-shaped event (routine, DAMA, referred, deceased) and is written
# only by POST /discharge-summaries, which creates the DischargeSummary and
# this transition together — never a bare status edit on the admission.
TERMINAL_STATUSES = {"discharged", "dama", "deceased", "transferred_out"}


def own_discharge_summaries_filter(db: Session, user: models.User):
    """A filter over DischargeSummary rows the caller may see under an "own"
    grant: the attending doctor's own, or a patient's own stay's.

    DischargeSummary carries doctor_id but not patient_id (a patient's stay is
    reached through admission_id, not a direct column), so
    authz.own_record_filter's generic hasattr(model, "patient_id") check would
    silently return "match nothing" for a patient's own grant — the same gap
    own_patients_filter exists to fix for Patient itself. Kept here rather than
    in authz.py because it is IPD-specific, not a generic pattern.
    """
    from sqlalchemy import false, or_, select

    from .authz import caller_doctor_id, caller_patient_id

    conditions = []
    doctor_id = caller_doctor_id(db, user)
    if doctor_id:
        conditions.append(models.DischargeSummary.doctor_id == doctor_id)
    patient_id = caller_patient_id(db, user)
    if patient_id:
        own_admissions = select(models.Admission.id).where(models.Admission.patient_id == patient_id)
        conditions.append(models.DischargeSummary.admission_id.in_(own_admissions))
    if not conditions:
        return false()
    return or_(*conditions)


def own_nursing_notes_filter(db: Session, user: models.User):
    """A filter over NursingNote rows a doctor may see under an "own" grant:
    notes on admissions where they are the attending doctor.

    NursingNote carries nurse_id, not doctor_id, so authz.own_record_filter's
    generic hasattr(model, "doctor_id") check would silently match nothing —
    the same class of gap own_discharge_summaries_filter exists to fix, here
    reached through admission_id instead of a direct patient_id column.
    """
    from sqlalchemy import false, select

    from .authz import caller_doctor_id

    doctor_id = caller_doctor_id(db, user)
    if not doctor_id:
        return false()
    own_admissions = select(models.Admission.id).where(models.Admission.doctor_id == doctor_id)
    return models.NursingNote.admission_id.in_(own_admissions)


def caller_may_view_admission(db: Session, user: models.User, admission: models.Admission) -> bool:
    """Whether the caller is a party to this admission — its attending doctor,
    or the patient it belongs to. Used by ipd_billing's per-admission bill
    endpoint, which has no list-filter to hang an "own" scope off; there is
    just the one admission named in the URL to check against."""
    from .authz import caller_doctor_id, caller_patient_id

    doctor_id = caller_doctor_id(db, user)
    if doctor_id and admission.doctor_id == doctor_id:
        return True
    patient_id = caller_patient_id(db, user)
    if patient_id and admission.patient_id == patient_id:
        return True
    return False


def _nights_between(start_iso: str, end_iso: str) -> int:
    """Whole nights between two ISO timestamps, minimum 1 — a same-day
    admission and discharge is still billed for one night, the way a hotel
    folio would, rather than zero."""
    start = datetime.fromisoformat(start_iso)
    end = datetime.fromisoformat(end_iso)
    nights = (end.date() - start.date()).days
    return max(nights, 1)


_PAYMENT_TYPE_LABELS = {
    "pharmacy": "Pharmacy",
    "injectable": "Injection",
    "lab": "Lab",
    "ipd_payment": "Payment received",
    "consultation": "Consultation",
}


def compute_bill(db: Session, tenant_id: str, admission: models.Admission) -> dict:
    """A stay's running bill: room-night total + itemized charges + every
    payment raised against this admission_id.

    Room charge is nights-stayed x the bed's *current* daily_rate, computed
    here rather than stored on the admission — the night count is always
    re-derivable from the admission's own dates, so storing it would only risk
    disagreeing with them later. This deliberately uses today's rate, not a
    frozen one: unlike Payment.bill_breakdown (which snapshots a lab/injectable
    bill at the moment it was charged so a reprint matches what was actually
    charged), an *open* stay's running total is meant to reflect the current
    rate card, not the rate on day one.

    Every admission-linked *service* Payment (pharmacy/injectable/lab —
    anything but `ipd_payment`) is folded into `grand_total` regardless of
    status: a charge raised during the stay is money owed the moment it's
    ordered, not only once collected. Before this fold-in, a completed one
    counted toward `paid_total` but never toward `grand_total`, understating
    the bill and producing a wrong (too-low, sometimes negative) balance.

    `ipd_payment` rows (POST .../payments — a deposit/interim/settlement
    reception collected directly) are different in kind: they are money
    *received*, not a new charge, so they count only toward `paid_total`.
    Folding them into `grand_total` too would make recording a payment net to
    zero effect on `balance_due` — it would both add and settle the same
    amount in the same call, defeating the endpoint's purpose.
    """
    end = admission.discharged_at or datetime.now(timezone.utc).isoformat()
    nights = _nights_between(admission.admitted_at, end)
    bed = scoped(db, models.Bed, tenant_id).filter(models.Bed.id == admission.bed_id).first()
    rate = bed.daily_rate if bed else 0
    room_total = nights * rate

    items = (
        scoped(db, models.AdmissionChargeItem, tenant_id)
        .filter(models.AdmissionChargeItem.admission_id == admission.id)
        .order_by(models.AdmissionChargeItem.charged_at)
        .all()
    )
    items_total = sum(item.amount * item.quantity for item in items)

    payments = (
        scoped(db, models.Payment, tenant_id)
        .filter(models.Payment.admission_id == admission.id)
        .order_by(models.Payment.created_at)
        .all()
    )
    charge_payments_total = sum(p.amount for p in payments if p.payment_type != "ipd_payment")
    paid_total = sum(p.amount for p in payments if p.status == "completed")

    lines = [
        {
            "source": "charge_item",
            "id": item.id,
            "label": item.description or item.charge_type.replace("_", " ").title(),
            "amount": item.amount,
            "quantity": item.quantity,
            "paid": False,
            "at": item.charged_at,
        }
        for item in items
    ] + [
        {
            "source": "payment",
            "id": p.id,
            "label": _PAYMENT_TYPE_LABELS.get(p.payment_type, p.payment_type),
            "amount": p.amount,
            "quantity": 1,
            "paid": p.status == "completed",
            "at": p.created_at,
        }
        for p in payments
    ]

    grand_total = room_total + items_total + charge_payments_total
    return {
        "admission_id": admission.id,
        "room_nights": nights,
        "room_rate": rate,
        "room_total": room_total,
        "items": items,
        "items_total": items_total,
        "lines": lines,
        "paid_total": paid_total,
        "grand_total": grand_total,
        "balance_due": grand_total - paid_total,
    }

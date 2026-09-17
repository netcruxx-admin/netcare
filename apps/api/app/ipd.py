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


def compute_bill(db: Session, tenant_id: str, admission: models.Admission) -> dict:
    """A stay's running bill: room-night total + itemized charges + payments.

    Room charge is nights-stayed x the bed's *current* daily_rate, computed
    here rather than stored on the admission — the night count is always
    re-derivable from the admission's own dates, so storing it would only risk
    disagreeing with them later. This deliberately uses today's rate, not a
    frozen one: unlike Payment.bill_breakdown (which snapshots a lab/injectable
    bill at the moment it was charged so a reprint matches what was actually
    charged), an *open* stay's running total is meant to reflect the current
    rate card, not the rate on day one.
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

    paid_total = sum(
        payment.amount
        for payment in scoped(db, models.Payment, tenant_id).filter(
            models.Payment.admission_id == admission.id,
            models.Payment.status == "completed",
        )
    )

    grand_total = room_total + items_total
    return {
        "admission_id": admission.id,
        "room_nights": nights,
        "room_rate": rate,
        "room_total": room_total,
        "items": items,
        "items_total": items_total,
        "paid_total": paid_total,
        "grand_total": grand_total,
        "balance_due": grand_total - paid_total,
    }

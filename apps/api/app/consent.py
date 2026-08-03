"""Consent — asking before processing, and being able to prove you asked.

What forces this file:

  * **DPDP Act 2023** requires notice before collection, and consent that is
    free, specific, informed, unconditional and given by clear affirmative
    action. It must be *itemised* — one tick cannot cover treatment and
    marketing — and withdrawal must be as easy as granting was. A Data Fiduciary
    must be able to produce the consent on demand, which means storing the
    notice version, not just a boolean.
  * **DPDP s.9** requires verifiable consent from a parent or lawful guardian
    for anyone under 18. In a hospital that is not an edge case: the newborn and
    paediatric records this product is built around are all s.9 data.
  * **Telemedicine Practice Guidelines 2020** require consent for each
    teleconsultation, and say explicitly that a consultation the *patient*
    initiated carries implied consent while one the practitioner initiated needs
    an explicit one. Both are recorded, distinguished by `method`.
  * **IT/SPDI Rules 2011**, still in force, want the same thing in writing for
    health data specifically.

The shape this takes in code:

  `ConsentPurpose` is a code-owned catalog arriving by migration, the same
  pattern as `Permission` — a hospital cannot invent a purpose, because a
  purpose only means something if some code actually processes data for it.
  `Consent` is one subject's answer, stamped with the notice version they saw.

  Nothing here decides *who may read* a record; that is authz.py. Consent and
  permission are different questions and stay separate: a doctor holding
  `patients.read` still may not use a patient's contact details for a marketing
  campaign the patient refused. Consent gates *purposes*, permission gates
  *people*.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from . import models

# Purposes whose consent is asked per event rather than once per person.
CADENCE_PER_EVENT = "per_event"
CADENCE_PER_PERSON = "per_person"

METHOD_EXPLICIT = "explicit"
METHOD_IMPLIED_PATIENT_INITIATED = "implied_patient_initiated"

# DPDP s.9. The threshold is the subject's age on the day consent is given.
AGE_OF_MAJORITY = 18


def available_purposes(
    db: Session, hospital: Optional[models.Hospital]
) -> list[models.ConsentPurpose]:
    """The purposes a given hospital may ask about, in display order.

    Masked by the tenant's enabled modules for the same reason permissions are:
    a hospital that never runs a video consultation must not present a
    telemedicine consent, because a notice describing processing that will not
    happen is a misleading notice rather than a thorough one.
    """
    modules = (hospital.modules or {}) if hospital else {}
    rows = (
        db.query(models.ConsentPurpose)
        .order_by(models.ConsentPurpose.sort_order, models.ConsentPurpose.code)
        .all()
    )
    return [p for p in rows if not p.module or modules.get(p.module, False)]


def required_purpose_codes(
    db: Session, hospital: Optional[models.Hospital]
) -> set[str]:
    """Purposes that must be agreed before an account can exist at all.

    Kept deliberately small. Every code in here is one a person cannot say no to
    while still receiving care, so adding to it narrows their real choice —
    which is exactly the bundling DPDP's "unconditional" wording prohibits.
    """
    return {
        p.code
        for p in available_purposes(db, hospital)
        if p.required and p.cadence == CADENCE_PER_PERSON
    }


def _age_on(date_of_birth: str, on: Optional[date] = None) -> Optional[int]:
    """Age in whole years, or None if the date of birth is absent or unparseable.

    None means "unknown", and callers treat unknown as adult rather than as
    minor: refusing to register everyone whose date of birth is blank would
    break the front desk, and the guardian requirement is re-checked wherever a
    date of birth is actually known.
    """
    if not date_of_birth:
        return None
    try:
        born = date.fromisoformat(date_of_birth[:10])
    except ValueError:
        return None
    today = on or datetime.now(timezone.utc).date()
    return (
        today.year
        - born.year
        - ((today.month, today.day) < (born.month, born.day))
    )


def is_minor(db: Session, subject_user_id: str) -> bool:
    """Whether the subject is under 18, read from their patient record."""
    patient = (
        db.query(models.Patient)
        .filter(models.Patient.user_id == subject_user_id)
        .first()
    )
    if patient is None:
        return False
    age = _age_on(patient.date_of_birth or "")
    return age is not None and age < AGE_OF_MAJORITY


def active_consents(
    db: Session, subject_user_id: str, tenant_id: str
) -> dict[str, models.Consent]:
    """purpose_code -> the live consent, for standing (per-person) purposes.

    "Live" means granted and not withdrawn. A later grant supersedes an earlier
    one for the same purpose, so the newest row wins — that is how re-consenting
    to an updated notice works without deleting the history of the old one.
    """
    rows = (
        db.query(models.Consent)
        .filter(
            models.Consent.hospital_id == tenant_id,
            models.Consent.subject_user_id == subject_user_id,
            models.Consent.withdrawn_at.is_(None),
            models.Consent.appointment_id.is_(None),
        )
        .order_by(models.Consent.granted_at)
        .all()
    )
    return {row.purpose_code: row for row in rows}


def has_consent(
    db: Session, subject_user_id: str, tenant_id: str, purpose_code: str
) -> bool:
    """Whether this person currently allows this purpose."""
    return purpose_code in active_consents(db, subject_user_id, tenant_id)


def stale_purpose_codes(
    db: Session, subject_user_id: str, tenant_id: str
) -> set[str]:
    """Purposes consented to under a notice that has since been reworded.

    Not treated as withdrawn — silently revoking consent because a typo was
    fixed would stop care. Surfaced instead, so the UI can re-ask. Deciding
    which version bumps are material enough to re-ask about is a judgement for
    whoever writes the notice; this reports the difference either way.
    """
    live = active_consents(db, subject_user_id, tenant_id)
    if not live:
        return set()
    current = {
        p.code: p.version
        for p in db.query(models.ConsentPurpose)
        .filter(models.ConsentPurpose.code.in_(live.keys()))
        .all()
    }
    return {code for code, row in live.items() if current.get(code, row.version) > row.version}


def require_consent(
    db: Session, subject_user_id: str, tenant_id: str, purpose_code: str
) -> None:
    """Refuse the operation unless the subject allows this purpose.

    A 403 rather than a 404: unlike a record the caller may not see, the absence
    of consent is not something to hide — it is the actionable answer, and the
    client's next move is to go and ask for it.
    """
    if not has_consent(db, subject_user_id, tenant_id, purpose_code):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"The patient has not consented to this ({purpose_code}).",
        )


def record(
    db: Session,
    *,
    tenant_id: str,
    subject_user_id: str,
    purpose: models.ConsentPurpose,
    method: str = METHOD_EXPLICIT,
    recorded_by_user_id: Optional[str] = None,
    guardian_user_id: Optional[str] = None,
    guardian_name: str = "",
    guardian_relationship: str = "",
    appointment_id: Optional[str] = None,
    ip: str = "",
    user_agent: str = "",
) -> models.Consent:
    """Write one consent, stamped with the notice version in force right now.

    The version is read from the purpose at this moment rather than taken from
    the request: a client that could name the version it agreed to could claim
    agreement to text it was never shown.

    Does not commit — the caller owns the transaction, so a consent recorded
    alongside a registration lands atomically with it. A consent that survived a
    failed registration would be a record of permission for data that does not
    exist.
    """
    from .utils import new_id, now_iso

    if not (guardian_user_id or guardian_name) and is_minor(db, subject_user_id):
        # DPDP s.9. Refusing here rather than recording an invalid consent: a
        # row that looks like consent but is not one is worse than no row,
        # because it stops anyone noticing that consent is missing.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This patient is under 18. Consent must be given by a parent or "
                "lawful guardian, who must be identified on the record."
            ),
        )

    consent = models.Consent(
        id=new_id("cns"),
        hospital_id=tenant_id,
        subject_user_id=subject_user_id,
        purpose_code=purpose.code,
        version=purpose.version,
        method=method,
        recorded_by_user_id=recorded_by_user_id,
        guardian_user_id=guardian_user_id,
        guardian_name=guardian_name,
        guardian_relationship=guardian_relationship,
        appointment_id=appointment_id,
        ip=ip,
        user_agent=user_agent,
        granted_at=now_iso(),
    )
    db.add(consent)
    return consent


def withdraw(
    db: Session, *, tenant_id: str, subject_user_id: str, purpose_code: str
) -> int:
    """Withdraw every live consent for one purpose. Returns how many were closed.

    Withdrawal is a write, never a delete: the fact that permission existed and
    was later revoked is what justifies the processing that already happened.

    Required purposes are refused here rather than in the router, so no caller
    can route around it. Withdrawing consent to be treated is a request to close
    the account, not an API call — and quietly allowing it would leave a patient
    with live appointments and no lawful basis behind them.
    """
    from .utils import now_iso

    purpose = db.get(models.ConsentPurpose, purpose_code)
    if purpose is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown consent purpose"
        )
    if purpose.required:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This consent is required to provide care and cannot be withdrawn "
                "on its own. Ask the hospital to close the account instead."
            ),
        )
    return (
        db.query(models.Consent)
        .filter(
            models.Consent.hospital_id == tenant_id,
            models.Consent.subject_user_id == subject_user_id,
            models.Consent.purpose_code == purpose_code,
            models.Consent.withdrawn_at.is_(None),
        )
        .update({models.Consent.withdrawn_at: now_iso()}, synchronize_session=False)
    )


def assert_required_given(
    db: Session,
    hospital: Optional[models.Hospital],
    submitted_codes: Iterable[str],
) -> list[models.ConsentPurpose]:
    """Check a sign-up's consent selections and return the purposes to record.

    Two failures are distinguished because they mean different things: a missing
    *required* purpose is a client that skipped the notice, while an unknown
    code is a client working from a stale catalog. Both are 400s, but an
    operator reading the log needs to tell them apart.
    """
    submitted = set(submitted_codes)
    offered = {p.code: p for p in available_purposes(db, hospital)}

    unknown = submitted - offered.keys()
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown consent purpose(s): {', '.join(sorted(unknown))}",
        )

    missing = required_purpose_codes(db, hospital) - submitted
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Cannot create an account without agreeing to: "
                + ", ".join(sorted(missing))
            ),
        )

    # Per-event purposes are not settled at sign-up; they are asked when the
    # event happens, so a client ticking one here is ignored rather than
    # recorded as a standing permission it never was.
    return [
        offered[code]
        for code in sorted(submitted)
        if offered[code].cadence == CADENCE_PER_PERSON
    ]

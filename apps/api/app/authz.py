"""Permission resolution and enforcement.

Authorization asks "does this user hold this permission?", never "is this user an
admin?". Roles exist only as bundles a superadmin edits at runtime, so no role
code appears in this module or in any router that uses it.

Two things combine to produce what a user may actually do:

  * the grants their role holds (role_permissions) — the superadmin's decision
  * the modules their hospital has switched on — the tenant's plan

A permission tied to a module the hospital doesn't have is dropped, so a role
granting `lab_orders.process` gives nothing at a hospital without the lab module.
That intersection happens here, once, server-side: the frontend is told the
result rather than recomputing it, so the UI and the API cannot disagree.

Tenant isolation is a separate concern and is NOT handled here — see tenancy.py.
Holding `patients.read` with scope "all" means all patients *of your hospital*;
scoped() still applies to every query.
"""

from typing import Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from . import models
from .auth import get_current_user
from .database import get_db

# Scope values. "own" narrows a query to the caller's own records, "all" spans
# the whole tenant. None means the permission has no breadth dimension.
SCOPE_OWN = "own"
SCOPE_ALL = "all"


def effective_permissions(
    db: Session, user: models.User
) -> dict[str, Optional[str]]:
    """Permission code -> granted scope, for this user at their hospital."""
    grants = (
        db.query(models.RolePermission, models.Permission)
        .join(models.Permission, models.Permission.code == models.RolePermission.permission_code)
        .filter(models.RolePermission.role_code == user.role)
        .all()
    )

    # A platform user belongs to no hospital, so no module mask applies.
    modules: dict = {}
    if user.hospital_id:
        hospital = db.get(models.Hospital, user.hospital_id)
        modules = (hospital.modules or {}) if hospital else {}

    resolved: dict[str, Optional[str]] = {}
    for grant, permission in grants:
        if permission.module and not modules.get(permission.module, False):
            continue  # the hospital hasn't bought this feature
        resolved[permission.code] = grant.scope
    return resolved


def caller_patient_id(db: Session, user: models.User) -> Optional[str]:
    """The patient record this user *is*, if any."""
    patient = (
        db.query(models.Patient).filter(models.Patient.user_id == user.id).first()
    )
    return patient.id if patient else None


def caller_doctor_id(db: Session, user: models.User) -> Optional[str]:
    """The doctor record this user *is*, if any."""
    doctor = db.query(models.Doctor).filter(models.Doctor.user_id == user.id).first()
    return doctor.id if doctor else None


def own_patients_filter(db: Session, user: models.User):
    """A filter over Patient rows the caller may see under an "own" grant.

    Patient is the one clinical table with no doctor_id, so ownership can't be
    read off the row like it can everywhere else. "Own" therefore means:

      * the patient record the caller *is* (a patient viewing themselves), or
      * patients the caller treats — anyone they have an appointment with.

    Without the second arm a doctor holding `patients.read: own` would see an
    empty patient list, which is what happens if you reuse own_record_filter here.
    """
    from sqlalchemy import false, or_, select

    conditions = []
    patient_id = caller_patient_id(db, user)
    if patient_id:
        conditions.append(models.Patient.id == patient_id)

    doctor_id = caller_doctor_id(db, user)
    if doctor_id:
        treated = select(models.Appointment.patient_id).where(
            models.Appointment.doctor_id == doctor_id
        )
        conditions.append(models.Patient.id.in_(treated))

    if not conditions:
        return false()
    return or_(*conditions)


def own_record_filter(db: Session, user: models.User, model):
    """A filter restricting `model` to rows belonging to the caller.

    Used when a permission was granted with scope "own". Clinical rows carry
    both patient_id and doctor_id, so either link counts as ownership: a patient
    sees their own prescriptions, the prescribing doctor sees the same row.

    Returns a false condition when the caller is neither a patient nor a doctor,
    so an "own" grant can never silently widen to everything.
    """
    from sqlalchemy import false, or_

    conditions = []
    patient_id = caller_patient_id(db, user)
    if patient_id and hasattr(model, "patient_id"):
        conditions.append(model.patient_id == patient_id)
    doctor_id = caller_doctor_id(db, user)
    if doctor_id and hasattr(model, "doctor_id"):
        conditions.append(model.doctor_id == doctor_id)

    if not conditions:
        return false()
    return or_(*conditions)


def require_any_permission(*codes: str):
    """Guard for endpoints reachable by more than one capability.

    Editing a patient record, for instance, is legitimate both for staff holding
    `patients.manage` and for the patient themselves via `profile.manage`. The
    handler receives the subset the caller actually holds and enforces ownership
    where only the narrower one matched, so the *reason* they are allowed stays
    visible in the handler rather than being flattened away here.
    """

    def dependency(
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> dict[str, Optional[str]]:
        permissions = effective_permissions(db, user)
        held = {code: permissions[code] for code in codes if code in permissions}
        if not held:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to do this",
            )
        return held

    return dependency


def require_permission(code: str):
    """Dependency guarding an endpoint on a single permission.

    Returns the granted scope, so a handler can narrow its query without ever
    inspecting the caller's role:

        scope = Depends(require_permission("patients.read"))
        if scope == SCOPE_OWN: ...
    """

    def dependency(
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> Optional[str]:
        permissions = effective_permissions(db, user)
        if code not in permissions:
            # Deliberately identical whether the permission was never granted or
            # was stripped by the module mask — callers learn nothing about the
            # tenant's plan from a 403.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to do this",
            )
        return permissions[code]

    return dependency

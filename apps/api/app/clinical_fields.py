"""Which vitals and clinical-note fields a department records.

The vitals and medical-record tables keep one column per field, so this module
decides *which columns a visit in a department uses*, not what is stored. A
cardiology visit has no menstrual history and no LMP; an obstetrics visit has
both.

Two layers, so a hospital needs no configuration to get sensible forms:

  1. a default set per specialty (`default_vitals` / `default_notes`), and
  2. an optional per-department override (`departments.vitals_override` /
     `notes_override`), set by a superadmin on the department. NULL means
     "use the specialty's default".

A department with no specialty set gets every field -- exactly what every
department had before this existed -- so nothing disappears from a hospital
until someone says what the department is.

Keys are the snake_case column names, so the same key is the model attribute,
the API field (camelCased on the wire) and the checkbox in the department form.
"""

from typing import Iterable, Optional

# (key, label, group)
VITAL_FIELDS: list[tuple[str, str, str]] = [
    ("blood_pressure", "BP", "core"),
    ("heart_rate", "Pulse", "core"),
    ("temperature", "Temperature", "core"),
    ("weight", "Weight", "core"),
    ("height", "Height", "core"),
    ("bmi", "BMI", "core"),
    ("spo2", "SpO₂", "cardiorespiratory"),
    ("respiratory_rate", "Respiratory rate", "cardiorespiratory"),
    ("pregnancy_status", "Pregnancy status", "pregnancy"),
    ("lmp", "LMP", "pregnancy"),
    ("edd", "EDD", "pregnancy"),
    ("pog", "POG", "pregnancy"),
]

NOTE_FIELDS: list[tuple[str, str, str]] = [
    ("chief_complaint", "Chief complaint", "history"),
    ("medical_history", "Medical history", "history"),
    ("surgical_history", "Surgical history", "history"),
    ("family_history", "Family history", "history"),
    ("menstrual_history", "Menstrual history", "obstetric"),
    ("marital_status", "Marital status", "obstetric"),
    ("obstetric_history", "Obstetric history", "obstetric"),
    ("pog_by_scan", "POG by scan/USG", "obstetric"),
    ("per_abdomen", "P/A (per abdomen)", "gyn_exam"),
    ("per_speculum", "P/S (per speculum)", "gyn_exam"),
    ("per_vaginum", "P/V (per vaginum)", "gyn_exam"),
    ("diagnosis", "Diagnosis", "assessment"),
    ("treatment_advice", "Treatment advice", "assessment"),
    ("follow_up_advice", "Follow-up advice", "assessment"),
]

VITAL_KEYS = [k for k, _, _ in VITAL_FIELDS]
NOTE_KEYS = [k for k, _, _ in NOTE_FIELDS]

# A visit is never without an assessment, whatever a department ticks.
ALWAYS_NOTES = ["diagnosis", "treatment_advice", "follow_up_advice"]


def _group(fields: list[tuple[str, str, str]], *groups: str) -> list[str]:
    return [k for k, _, g in fields if g in groups]


_OBSTETRIC = {"obstetrics-gynecology"}
_CARDIORESPIRATORY = {"cardiology", "pulmonology", "emergency"}


def default_vitals(specialty: str) -> list[str]:
    if not specialty:
        return list(VITAL_KEYS)
    groups = ["core"]
    if specialty in _CARDIORESPIRATORY:
        groups.append("cardiorespiratory")
    if specialty in _OBSTETRIC:
        groups.append("pregnancy")
    return _group(VITAL_FIELDS, *groups)


def default_notes(specialty: str) -> list[str]:
    if not specialty:
        return list(NOTE_KEYS)
    groups = ["history", "assessment"]
    if specialty in _OBSTETRIC:
        groups += ["obstetric", "gyn_exam"]
    return _group(NOTE_FIELDS, *groups)


def effective_vitals(specialty: str, override: Optional[list[str]]) -> list[str]:
    keys = default_vitals(specialty) if override is None else override
    return [k for k in VITAL_KEYS if k in keys]  # catalog order


def effective_notes(specialty: str, override: Optional[list[str]]) -> list[str]:
    keys = default_notes(specialty) if override is None else list(override) + ALWAYS_NOTES
    return [k for k in NOTE_KEYS if k in keys]


def unknown_keys(keys: Iterable[str], catalog: list[str]) -> list[str]:
    return [k for k in keys if k not in catalog]


# --- Enforcement -------------------------------------------------------------
# A form that hides a field is a courtesy; the API is what keeps the data
# honest. These refuse a request that fills in a field the visit's department
# does not record, so a menstrual history cannot land on a cardiology visit by
# calling the endpoint directly.

from fastapi import HTTPException, status  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from . import models  # noqa: E402


def _department_for_appointment(db: Session, tenant_id: str, appointment_id: Optional[str]):
    if not appointment_id:
        return None
    return (
        db.query(models.Department)
        .join(models.Appointment, models.Appointment.department_id == models.Department.id)
        .filter(models.Appointment.id == appointment_id, models.Appointment.hospital_id == tenant_id)
        .first()
    )


def _is_given(value) -> bool:
    # The column defaults ("" and 0) are "not recorded"; a real 0 is not a vital.
    return value not in (None, "", 0, 0.0, [])


def refuse_unrecorded_fields(
    db: Session,
    tenant_id: str,
    appointment_id: Optional[str],
    values: dict,
    *,
    kind: str,
) -> None:
    """422 when `values` fills in a field the appointment's department does not
    record. `kind` is "vitals" or "notes". A visit with no appointment (an IPD
    chart) or no department is unrestricted."""
    department = _department_for_appointment(db, tenant_id, appointment_id)
    if department is None:
        return
    if kind == "vitals":
        allowed = effective_vitals(department.specialty or "", department.vitals_override)
        labels = {k: label for k, label, _ in VITAL_FIELDS}
    else:
        allowed = effective_notes(department.specialty or "", department.notes_override)
        labels = {k: label for k, label, _ in NOTE_FIELDS}
    for key, value in values.items():
        if key in labels and key not in allowed and _is_given(value):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"{labels[key]} is not recorded for {department.name} visits",
            )

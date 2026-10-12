"""Specialty encounter templates — what a visit records, per specialty.

A template is the shape of one clinical encounter: sections of typed fields.
`specialty_encounters.data` holds the answers; this module is the only place
that knows what a valid answer looks like, so adding a specialty is a data
change here and never a table, a router or a permission.

Like `categories.py` this is a static catalog, not a table: templates change
with code and are reviewed with code. Bump a template's `version` whenever a
field is removed or its meaning changes; every encounter stores the version it
was written against, so old rows stay interpretable.

`keywords` mirror the `specialties` match in the frontend's route table
(lib/roles.ts): a doctor is offered a template when one of them appears in
their specialization or their department name.
"""

import re
from datetime import date
from typing import Any, Optional, TypedDict

FIELD_TYPES = ("text", "textarea", "number", "select", "multiselect", "boolean", "date")


class Field(TypedDict, total=False):
    key: str
    label: str
    type: str
    required: bool
    options: list[str]  # select / multiselect
    unit: str  # number
    min: float  # number
    max: float  # number


class Section(TypedDict):
    key: str
    label: str
    fields: list[Field]


class SpecialtyTemplate(TypedDict):
    id: str
    label: str
    version: int
    keywords: list[str]
    sections: list[Section]


def _f(key: str, label: str, type: str = "text", **extra) -> Field:
    return {"key": key, "label": label, "type": type, **extra}  # type: ignore[return-value]


_SIDE = ["Left", "Right", "Both"]

SPECIALTY_TEMPLATES: dict[str, SpecialtyTemplate] = {
    "cardiology": {
        "id": "cardiology",
        "label": "Cardiology",
        "version": 1,
        "keywords": ["cardio", "heart"],
        "sections": [
            {
                "key": "presentation",
                "label": "Presentation",
                "fields": [
                    _f("chief_complaint", "Chief complaint", "textarea", required=True),
                    _f(
                        "symptoms",
                        "Symptoms",
                        "multiselect",
                        options=["Chest pain", "Breathlessness", "Palpitations", "Syncope", "Edema", "Fatigue"],
                    ),
                    _f("nyha_class", "NYHA class", "select", options=["I", "II", "III", "IV"]),
                    _f(
                        "risk_factors",
                        "Risk factors",
                        "multiselect",
                        options=["Hypertension", "Diabetes", "Smoking", "Dyslipidemia", "Family history", "Obesity"],
                    ),
                ],
            },
            {
                "key": "examination",
                "label": "Examination",
                "fields": [
                    _f("heart_rate", "Heart rate", "number", unit="bpm", min=20, max=300),
                    _f("systolic", "Systolic BP", "number", unit="mmHg", min=40, max=300),
                    _f("diastolic", "Diastolic BP", "number", unit="mmHg", min=20, max=200),
                    _f("spo2", "SpO2", "number", unit="%", min=0, max=100),
                    _f("heart_sounds", "Heart sounds", "text"),
                    _f("murmur", "Murmur", "text"),
                ],
            },
            {
                "key": "investigations",
                "label": "Investigations",
                "fields": [
                    _f(
                        "ecg_rhythm",
                        "ECG rhythm",
                        "select",
                        options=["Normal sinus", "Atrial fibrillation", "Flutter", "Bradycardia", "Tachycardia", "Other"],
                    ),
                    _f("ecg_findings", "ECG findings", "textarea"),
                    _f("ejection_fraction", "Ejection fraction (echo)", "number", unit="%", min=0, max=100),
                    _f("echo_findings", "Echo findings", "textarea"),
                    _f("troponin", "Troponin", "text"),
                ],
            },
            {
                "key": "assessment",
                "label": "Assessment & plan",
                "fields": [
                    _f("diagnosis", "Diagnosis", "text", required=True),
                    _f("plan", "Plan", "textarea"),
                    _f("follow_up_date", "Follow-up date", "date"),
                ],
            },
        ],
    },
    "orthopedics": {
        "id": "orthopedics",
        "label": "Orthopedics",
        "version": 1,
        "keywords": ["ortho", "bone", "joint", "musculo"],
        "sections": [
            {
                "key": "presentation",
                "label": "Presentation",
                "fields": [
                    _f("chief_complaint", "Chief complaint", "textarea", required=True),
                    _f("affected_site", "Affected site", "text", required=True),
                    _f("side", "Side", "select", options=_SIDE),
                    _f(
                        "mechanism",
                        "Mechanism",
                        "select",
                        options=["Fall", "Road accident", "Sports", "Degenerative", "Overuse", "Other"],
                    ),
                    _f("onset_date", "Onset date", "date"),
                    _f("pain_score", "Pain score", "number", unit="/10", min=0, max=10),
                ],
            },
            {
                "key": "examination",
                "label": "Examination",
                "fields": [
                    _f("range_of_motion", "Range of motion", "textarea"),
                    _f("muscle_power", "Muscle power", "select", options=["0", "1", "2", "3", "4", "5"]),
                    _f("swelling", "Swelling", "boolean"),
                    _f("deformity", "Deformity", "boolean"),
                    _f("neurovascular_status", "Neurovascular status", "text"),
                ],
            },
            {
                "key": "imaging",
                "label": "Imaging",
                "fields": [
                    _f(
                        "imaging_done",
                        "Imaging done",
                        "multiselect",
                        options=["X-ray", "MRI", "CT", "Ultrasound", "DEXA"],
                    ),
                    _f("imaging_findings", "Imaging findings", "textarea"),
                    _f(
                        "fracture_type",
                        "Fracture type",
                        "select",
                        options=["None", "Closed", "Open", "Stress", "Pathological"],
                    ),
                ],
            },
            {
                "key": "assessment",
                "label": "Assessment & plan",
                "fields": [
                    _f("diagnosis", "Diagnosis", "text", required=True),
                    _f(
                        "management",
                        "Management",
                        "select",
                        options=["Conservative", "Cast / splint", "Surgical", "Physiotherapy", "Injection"],
                    ),
                    _f("plan", "Plan", "textarea"),
                    _f("follow_up_date", "Follow-up date", "date"),
                ],
            },
        ],
    },
    "dermatology": {
        "id": "dermatology",
        "label": "Dermatology",
        "version": 1,
        "keywords": ["dermat", "skin"],
        "sections": [
            {
                "key": "presentation",
                "label": "Presentation",
                "fields": [
                    _f("chief_complaint", "Chief complaint", "textarea", required=True),
                    _f("duration", "Duration", "text"),
                    _f("itching", "Itching", "select", options=["None", "Mild", "Moderate", "Severe"]),
                    _f("previous_treatment", "Previous treatment", "textarea"),
                    _f("allergies", "Known allergies", "text"),
                ],
            },
            {
                "key": "lesion",
                "label": "Lesion",
                "fields": [
                    _f("site", "Site", "text", required=True),
                    _f("distribution", "Distribution", "select", options=["Localized", "Generalized", "Symmetrical", "Dermatomal"]),
                    _f(
                        "morphology",
                        "Morphology",
                        "multiselect",
                        options=["Macule", "Papule", "Plaque", "Vesicle", "Pustule", "Nodule", "Scale", "Ulcer"],
                    ),
                    _f("colour", "Colour", "text"),
                    _f("size_cm", "Size", "number", unit="cm", min=0, max=200),
                ],
            },
            {
                "key": "investigations",
                "label": "Investigations",
                "fields": [
                    _f("dermoscopy", "Dermoscopy findings", "textarea"),
                    _f("biopsy_done", "Biopsy done", "boolean"),
                    _f("patch_test", "Patch test", "text"),
                ],
            },
            {
                "key": "assessment",
                "label": "Assessment & plan",
                "fields": [
                    _f("diagnosis", "Diagnosis", "text", required=True),
                    _f("plan", "Plan", "textarea"),
                    _f("follow_up_date", "Follow-up date", "date"),
                ],
            },
        ],
    },
}

SPECIALTY_IDS = list(SPECIALTY_TEMPLATES.keys())


# Every specialty a department can be filed under. Wider than the templates
# above on purpose: a department is "Pediatrics" whether or not we have written
# a structured visit form for it yet. `id` is what departments.specialty stores;
# `label` is what the dropdown shows. Appending is free; renaming an id is a
# data migration.
SPECIALTY_CATALOG: list[dict] = [
    {"id": "general-medicine", "label": "General Medicine"},
    {"id": "cardiology", "label": "Cardiology"},
    {"id": "orthopedics", "label": "Orthopedics"},
    {"id": "dermatology", "label": "Dermatology"},
    {"id": "pediatrics", "label": "Pediatrics"},
    {"id": "neonatology", "label": "Neonatology"},
    {"id": "obstetrics-gynecology", "label": "Obstetrics & Gynecology"},
    {"id": "ent", "label": "ENT"},
    {"id": "ophthalmology", "label": "Ophthalmology"},
    {"id": "dentistry", "label": "Dentistry"},
    {"id": "neurology", "label": "Neurology"},
    {"id": "nephrology", "label": "Nephrology"},
    {"id": "urology", "label": "Urology"},
    {"id": "oncology", "label": "Oncology"},
    {"id": "psychiatry", "label": "Psychiatry"},
    {"id": "pulmonology", "label": "Pulmonology"},
    {"id": "gastroenterology", "label": "Gastroenterology"},
    {"id": "endocrinology", "label": "Endocrinology"},
    {"id": "general-surgery", "label": "General Surgery"},
    {"id": "emergency", "label": "Emergency"},
    {"id": "radiology", "label": "Radiology"},
    {"id": "pathology", "label": "Pathology"},
]

SPECIALTY_CATALOG_IDS = {s["id"] for s in SPECIALTY_CATALOG}

# Department-name fragments -> specialty. Used only to *suggest* a specialty
# for a department that was named before the dropdown existed (the backfill) or
# that came from a category template; a person can always override it. Order
# matters: dental terms come first because "orthodontics" contains "ortho".
_NAME_HINTS: list[tuple[tuple[str, ...], str]] = [
    (("dental", "dentist", "orthodont", "endodont", "periodont", "oral surgery"), "dentistry"),
    (("cardio", "heart"), "cardiology"),
    (("orthop", "musculo"), "orthopedics"),
    (("dermat", "skin"), "dermatology"),
    (("neonat", "nicu"), "neonatology"),
    (("pediatric", "paediatric", "child"), "pediatrics"),
    (("obstetric", "gynec", "gynaec", "maternal", "labor &", "labor and", "labour"), "obstetrics-gynecology"),
    (("ophthalm", "optom", "retina", "cornea", "glaucoma", "eye"), "ophthalmology"),
    (("neuro",), "neurology"),
    (("nephro", "renal", "dialysis"), "nephrology"),
    (("urolog",), "urology"),
    (("oncolog", "cancer"), "oncology"),
    (("psychiat", "mental"), "psychiatry"),
    (("pulmon", "respirat", "chest"), "pulmonology"),
    (("gastro",), "gastroenterology"),
    (("endocrin", "diabet"), "endocrinology"),
    (("surgery", "surgical"), "general-surgery"),
    (("emergency", "casualty"), "emergency"),
    (("radiolog", "imaging"), "radiology"),
    (("patholog",), "pathology"),
    (("general medicine", "internal medicine", "general physician"), "general-medicine"),
]


def infer_specialty(department_name: str) -> str:
    """A best-guess specialty id for a department name, or "" when none fits."""
    name = (department_name or "").lower()
    if re.search(r"\bent\b", name) or "otolaryng" in name:
        return "ent"
    for fragments, specialty in _NAME_HINTS:
        if any(f in name for f in fragments):
            return specialty
    return ""


def get_template(specialty: str) -> Optional[SpecialtyTemplate]:
    return SPECIALTY_TEMPLATES.get(specialty)


class EncounterDataError(ValueError):
    """The answers do not fit the template. The message names the field."""


def _clean(value: Any, field: Field) -> Any:
    """Coerce one answer to its field's type, or raise. Blank means 'not given'
    and is returned as None for the caller to drop."""
    label = field["label"]
    kind = field["type"]
    if value is None or value == "" or value == []:
        return None

    if kind in ("text", "textarea"):
        if not isinstance(value, str):
            raise EncounterDataError(f"{label} must be text")
        return value.strip() or None

    if kind == "number":
        # bool is an int subclass; True is not a heart rate.
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise EncounterDataError(f"{label} must be a number")
        if "min" in field and value < field["min"]:
            raise EncounterDataError(f"{label} must be at least {field['min']}")
        if "max" in field and value > field["max"]:
            raise EncounterDataError(f"{label} must be at most {field['max']}")
        return value

    if kind == "boolean":
        if not isinstance(value, bool):
            raise EncounterDataError(f"{label} must be true or false")
        return value

    if kind == "date":
        try:
            if not isinstance(value, str):
                raise ValueError
            date.fromisoformat(value)
        except ValueError:
            raise EncounterDataError(f"{label} must be a date (YYYY-MM-DD)")
        return value

    if kind == "select":
        if value not in field.get("options", []):
            raise EncounterDataError(f"{label} must be one of: {', '.join(field.get('options', []))}")
        return value

    if kind == "multiselect":
        options = field.get("options", [])
        if not isinstance(value, list) or any(v not in options for v in value):
            raise EncounterDataError(f"{label} must be a list drawn from: {', '.join(options)}")
        return list(dict.fromkeys(value))

    raise EncounterDataError(f"{label} has an unknown field type")  # pragma: no cover


def validate_encounter(template: SpecialtyTemplate, data: dict) -> dict:
    """The cleaned answers for `template`, as `{section: {field: value}}`.

    Strict on purpose: an unknown section or field is refused rather than
    stored, so a typo (or a client built against a newer template) fails
    loudly instead of writing clinical data nothing will ever display.
    """
    if not isinstance(data, dict):
        raise EncounterDataError("data must be an object")

    sections = {s["key"]: s for s in template["sections"]}
    unknown = set(data) - set(sections)
    if unknown:
        raise EncounterDataError(f"Unknown section: {sorted(unknown)[0]}")

    cleaned: dict[str, dict] = {}
    for key, section in sections.items():
        answers = data.get(key) or {}
        if not isinstance(answers, dict):
            raise EncounterDataError(f"{section['label']} must be an object")
        fields = {f["key"]: f for f in section["fields"]}
        unknown = set(answers) - set(fields)
        if unknown:
            raise EncounterDataError(f"Unknown field in {section['label']}: {sorted(unknown)[0]}")

        out: dict[str, Any] = {}
        for fkey, field in fields.items():
            value = _clean(answers.get(fkey), field)
            if value is None:
                if field.get("required"):
                    raise EncounterDataError(f"{field['label']} is required")
                continue
            out[fkey] = value
        if out:
            cleaned[key] = out
    return cleaned

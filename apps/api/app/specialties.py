"""Specialty encounter templates — what a visit records, per specialty.

A template is the shape of one clinical encounter: sections of typed fields.
`specialty_encounters.data` holds the answers; this module is the only place
that knows what a valid answer looks like, so adding a specialty is a data
change here and never a table, a router or a permission.

A visit already has the general notes -- chief complaint, diagnosis, treatment and
follow-up advice -- so a template never repeats them: it holds only what is
particular to the specialty. Nothing in a template is required, which is why a
record with no answers at all is refused (see `validate_encounter`).

Like `categories.py` this is a static catalog, not a table: templates change
with code and are reviewed with code. Bump a template's `version` whenever a
field is removed or its meaning changes; every encounter stores the version it
was written against, so old rows stay interpretable.

Which template a visit gets is decided by its department's specialty id, not
by matching words, so templates carry no keywords.
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
    sections: list[Section]


def _f(key: str, label: str, type: str = "text", **extra) -> Field:
    return {"key": key, "label": label, "type": type, **extra}  # type: ignore[return-value]


_SIDE = ["Left", "Right", "Both"]

SPECIALTY_TEMPLATES: dict[str, SpecialtyTemplate] = {
    "cardiology": {
        "id": "cardiology",
        "label": "Cardiology",
        "version": 1,
        "sections": [
            {
                "key": "presentation",
                "label": "Presentation",
                "fields": [
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
        ],
    },
    "orthopedics": {
        "id": "orthopedics",
        "label": "Orthopedics",
        "version": 1,
        "sections": [
            {
                "key": "presentation",
                "label": "Presentation",
                "fields": [
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
        ],
    },
    "dermatology": {
        "id": "dermatology",
        "label": "Dermatology",
        "version": 1,
        "sections": [
            {
                "key": "presentation",
                "label": "Presentation",
                "fields": [
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
        ],
    },
    "general-medicine": {
        "id": "general-medicine",
        "label": "General Medicine",
        "version": 1,
        "sections": [
            {
                "key": "presentation",
                "label": "Presentation",
                "fields": [
                    _f("duration", "Duration", "text"),
                    _f(
                        "symptoms",
                        "Symptoms",
                        "multiselect",
                        options=[
                            "Fever", "Cough", "Breathlessness", "Chest pain", "Abdominal pain", "Headache",
                            "Vomiting", "Diarrhoea", "Fatigue", "Weight loss",
                        ],
                    ),
                ],
            },
            {
                "key": "examination",
                "label": "Examination",
                "fields": [
                    _f("general_condition", "General condition", "select", options=["Good", "Fair", "Poor"]),
                    _f("pallor", "Pallor", "boolean"),
                    _f("icterus", "Icterus", "boolean"),
                    _f("edema", "Edema", "boolean"),
                    _f("lymphadenopathy", "Lymphadenopathy", "boolean"),
                    _f("systemic_findings", "Systemic findings", "textarea"),
                ],
            },
            {
                "key": "investigations",
                "label": "Investigations",
                "fields": [
                    _f("investigations_advised", "Advised", "textarea"),
                    _f("results", "Results", "textarea"),
                ],
            },
        ],
    },
    "pediatrics": {
        "id": "pediatrics",
        "label": "Pediatrics",
        "version": 1,
        "sections": [
            {
                "key": "presentation",
                "label": "Presentation",
                "fields": [
                    _f("duration", "Duration", "text"),
                    _f(
                        "feeding",
                        "Feeding",
                        "select",
                        options=["Breast", "Formula", "Mixed", "Complementary foods", "Family diet"],
                    ),
                    _f("immunization_status", "Immunization", "select", options=["Up to date", "Delayed", "Not started"]),
                ],
            },
            {
                "key": "growth",
                "label": "Growth & development",
                "fields": [
                    _f("growth_status", "Growth", "select", options=["Normal", "Underweight", "Stunted", "Overweight"]),
                    _f("milestones", "Developmental milestones", "textarea"),
                    _f("developmental_concern", "Developmental concern raised", "boolean"),
                ],
            },
            {
                "key": "examination",
                "label": "Examination",
                "fields": [
                    _f(
                        "hydration",
                        "Hydration",
                        "select",
                        options=["Well hydrated", "Mild dehydration", "Moderate dehydration", "Severe dehydration"],
                    ),
                    _f("general_exam", "General examination", "textarea"),
                    _f("systemic_findings", "Systemic findings", "textarea"),
                ],
            },
        ],
    },
    "ent": {
        "id": "ent",
        "label": "ENT",
        "version": 1,
        "sections": [
            {
                "key": "presentation",
                "label": "Presentation",
                "fields": [
                    _f(
                        "symptoms",
                        "Symptoms",
                        "multiselect",
                        options=[
                            "Ear pain", "Hearing loss", "Ear discharge", "Tinnitus", "Vertigo", "Nasal block",
                            "Sore throat", "Hoarseness", "Epistaxis",
                        ],
                    ),
                    _f("duration", "Duration", "text"),
                    _f("side", "Side", "select", options=_SIDE),
                ],
            },
            {
                "key": "examination",
                "label": "Examination",
                "fields": [
                    _f("ear_findings", "Ear", "textarea"),
                    _f("nose_findings", "Nose", "textarea"),
                    _f("throat_findings", "Throat & neck", "textarea"),
                    _f("tuning_fork", "Tuning fork tests", "text"),
                ],
            },
            {
                "key": "investigations",
                "label": "Investigations",
                "fields": [
                    _f("audiometry", "Audiometry", "textarea"),
                    _f("endoscopy", "Endoscopy", "textarea"),
                ],
            },
        ],
    },
    "ophthalmology": {
        "id": "ophthalmology",
        "label": "Ophthalmology",
        "version": 1,
        "sections": [
            {
                "key": "presentation",
                "label": "Presentation",
                "fields": [
                    _f(
                        "symptoms",
                        "Symptoms",
                        "multiselect",
                        options=[
                            "Blurred vision", "Eye pain", "Redness", "Watering", "Floaters", "Flashes",
                            "Photophobia", "Discharge",
                        ],
                    ),
                    _f("side", "Side", "select", options=_SIDE),
                    _f("duration", "Duration", "text"),
                ],
            },
            {
                "key": "vision",
                "label": "Vision & pressure",
                "fields": [
                    _f("visual_acuity_right", "Visual acuity, right", "text"),
                    _f("visual_acuity_left", "Visual acuity, left", "text"),
                    _f("iop_right", "IOP, right", "number", unit="mmHg", min=0, max=80),
                    _f("iop_left", "IOP, left", "number", unit="mmHg", min=0, max=80),
                    _f("refraction", "Refraction", "textarea"),
                ],
            },
            {
                "key": "examination",
                "label": "Examination",
                "fields": [
                    _f("anterior_segment", "Anterior segment", "textarea"),
                    _f("fundus", "Fundus", "textarea"),
                ],
            },
        ],
    },
    "dentistry": {
        "id": "dentistry",
        "label": "Dentistry",
        "version": 1,
        "sections": [
            {
                "key": "presentation",
                "label": "Presentation",
                "fields": [
                    _f("tooth_site", "Tooth / site", "text"),
                    _f("pain_severity", "Pain", "number", unit="/10", min=0, max=10),
                ],
            },
            {
                "key": "examination",
                "label": "Examination",
                "fields": [
                    _f("oral_hygiene", "Oral hygiene", "select", options=["Good", "Fair", "Poor"]),
                    _f("caries", "Caries", "boolean"),
                    _f("gingivitis", "Gingivitis", "boolean"),
                    _f("mobility", "Tooth mobility", "boolean"),
                    _f("findings", "Findings", "textarea"),
                ],
            },
            {
                "key": "procedure",
                "label": "Procedure",
                "fields": [
                    _f("procedure_done", "Procedure done", "text"),
                    _f("anaesthesia", "Anaesthesia", "select", options=["None", "Topical", "Local"]),
                    _f("materials", "Materials used", "text"),
                ],
            },
        ],
    },
    "neurology": {
        "id": "neurology",
        "label": "Neurology",
        "version": 1,
        "sections": [
            {
                "key": "presentation",
                "label": "Presentation",
                "fields": [
                    _f("onset", "Onset", "select", options=["Sudden", "Gradual"]),
                    _f("duration", "Duration", "text"),
                    _f(
                        "symptoms",
                        "Symptoms",
                        "multiselect",
                        options=[
                            "Headache", "Seizure", "Weakness", "Numbness", "Dizziness", "Speech difficulty",
                            "Memory loss", "Tremor",
                        ],
                    ),
                ],
            },
            {
                "key": "examination",
                "label": "Examination",
                "fields": [
                    _f("gcs", "GCS", "number", min=3, max=15),
                    _f("higher_functions", "Higher functions", "text"),
                    _f("cranial_nerves", "Cranial nerves", "textarea"),
                    _f("motor_power", "Motor power", "textarea"),
                    _f("reflexes", "Reflexes", "textarea"),
                    _f("sensory", "Sensory", "textarea"),
                    _f("gait", "Gait & coordination", "text"),
                ],
            },
            {
                "key": "investigations",
                "label": "Investigations",
                "fields": [
                    _f("imaging", "Imaging (CT / MRI)", "textarea"),
                    _f("neurophysiology", "EEG / EMG / NCS", "textarea"),
                ],
            },
        ],
    },
    # LMP and EDD are not fields here: they live on Vitals, which derives EDD and
    # POG from LMP, and a second copy would let the two disagree. Antenatal
    # *tracking* (the pregnancy record and ANC visits) is the `anc` module's
    # job; this is the department's visit note and works with or without it.
    "obstetrics-gynecology": {
        "id": "obstetrics-gynecology",
        "label": "Obstetrics & Gynecology",
        "version": 1,
        "sections": [
            {
                "key": "presentation",
                "label": "Presentation",
                "fields": [
                    _f(
                        "visit_kind",
                        "Visit for",
                        "select",
                        options=["Antenatal", "Postnatal", "Gynecological", "Infertility", "Family planning"],
                        required=True,
                    ),
                    _f("duration", "Duration", "text"),
                ],
            },
            {
                "key": "obstetric",
                "label": "Obstetric history",
                "fields": [
                    _f("gravida", "Gravida", "number", min=0, max=30),
                    _f("para", "Para", "number", min=0, max=30),
                    _f("living", "Living children", "number", min=0, max=30),
                    _f("abortions", "Abortions", "number", min=0, max=30),
                    _f("previous_cesarean", "Previous cesarean", "boolean"),
                    _f(
                        "risk_factors",
                        "Risk factors",
                        "multiselect",
                        options=[
                            "Advanced maternal age", "Hypertension", "Diabetes", "Anemia", "Previous cesarean",
                            "Multiple pregnancy", "Previous preterm birth", "Rh negative", "Thyroid disease",
                        ],
                    ),
                ],
            },
            {
                "key": "examination",
                "label": "Examination",
                "fields": [
                    _f("fundal_height", "Fundal height", "number", unit="cm", min=0, max=60),
                    _f(
                        "fetal_presentation",
                        "Fetal presentation",
                        "select",
                        options=["Cephalic", "Breech", "Transverse", "Not applicable"],
                    ),
                    _f("fetal_heart_rate", "Fetal heart rate", "number", unit="bpm", min=60, max=220),
                    _f("fetal_movements", "Fetal movements", "select", options=["Present", "Reduced", "Absent"]),
                    _f("edema", "Pedal edema", "boolean"),
                    _f("pelvic_findings", "Pelvic / per-vaginal findings", "textarea"),
                ],
            },
            {
                "key": "gynecology",
                "label": "Gynecology",
                "fields": [
                    _f(
                        "menstrual_pattern",
                        "Menstrual pattern",
                        "select",
                        options=["Regular", "Irregular", "Amenorrhea", "Heavy bleeding", "Postmenopausal"],
                    ),
                    _f("contraception", "Contraception", "text"),
                    _f("pap_smear", "Pap smear", "select", options=["Not done", "Normal", "Abnormal"]),
                ],
            },
            {
                "key": "investigations",
                "label": "Investigations",
                "fields": [
                    _f("usg_findings", "Ultrasound findings", "textarea"),
                    _f("hemoglobin", "Hemoglobin", "number", unit="g/dL", min=2, max=25),
                    _f("urine_albumin", "Urine albumin", "select", options=["Nil", "Trace", "+", "++", "+++"]),
                    _f("glucose_test", "Glucose test (OGTT / random)", "text"),
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
    (("cardio", "cardiac", "heart"), "cardiology"),
    (("orthop", "musculo", "bone", "joint", "fracture"), "orthopedics"),
    (("dermat", "skin"), "dermatology"),
    (("neonat", "nicu", "newborn"), "neonatology"),
    (("pediatric", "paediatric", "child"), "pediatrics"),
    (("obstetric", "gynec", "gynaec", "maternal", "maternity", "antenatal", "prenatal", "labor &", "labor and", "labour"), "obstetrics-gynecology"),
    (("ophthalm", "optom", "retina", "cornea", "glaucoma", "eye"), "ophthalmology"),
    (("neuro",), "neurology"),
    (("nephro", "renal", "kidney", "dialysis"), "nephrology"),
    (("urolog",), "urology"),
    (("oncolog", "cancer"), "oncology"),
    (("psychiat", "mental"), "psychiatry"),
    (("pulmon", "respirat", "chest", "lung"), "pulmonology"),
    (("gastro",), "gastroenterology"),
    (("endocrin", "diabet", "thyroid"), "endocrinology"),
    (("surgery", "surgical"), "general-surgery"),
    (("emergency", "casualty"), "emergency"),
    (("radiolog", "imaging"), "radiology"),
    (("patholog",), "pathology"),
    (("general medicine", "internal medicine", "general physician"), "general-medicine"),
]


def infer_specialty(department_name: str) -> str:
    """A best-guess specialty id for a department name, or "" when none fits."""
    name = (department_name or "").lower()
    if re.search(r"\bent\b", name) or "otolaryng" in name or "ear nose" in name or "ear, nose" in name:
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
    if not cleaned:
        raise EncounterDataError("Record at least one finding")
    return cleaned

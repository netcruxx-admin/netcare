"""Hospital category (vertical) templates — the Python port of the frontend's
lib/hospitalCategories.ts.

A category is a curated preset: which feature-modules are on, the suggested
departments, and the specializations that fit the vertical. Used only at
onboarding to seed a new hospital's config + departments. It is intentionally a
static catalog, not a table — templates change with code, not per-tenant data.
"""

from typing import TypedDict


class CategoryTemplate(TypedDict):
    label: str
    tagline: str
    currency: str
    theme: dict
    modules: dict
    specializations: list[str]
    departments: list[dict]  # {"name", "description"}


_ALL_ON = {
    "lab": True,
    "pharmacy": True,
    "nursing": True,
    "payments": True,
    "medicalRecords": True,
    "telemedicine": True,
    "anc": False,
}


def _modules(**overrides) -> dict:
    return {**_ALL_ON, **overrides}


CATEGORY_TEMPLATES: dict[str, CategoryTemplate] = {
    "maternity": {
        "label": "Maternity & Newborn",
        "tagline": "Maternity & Newborn Care",
        "currency": "INR",
        "theme": {"primary": "#0891b2", "primaryDark": "#0d9488"},
        "modules": _modules(anc=True),
        "specializations": [
            "Obstetrics & Gynecology",
            "Neonatology",
            "Maternal Wellness",
            "Pediatric Care",
        ],
        "departments": [
            {"name": "Obstetrics & Gynecology", "description": "Pregnancy, childbirth, and postpartum care"},
            {"name": "Neonatology", "description": "Newborn and infant care"},
            {"name": "Maternal Wellness", "description": "Pre-conception and maternal health"},
            {"name": "Labor & Delivery", "description": "Active labor and delivery services"},
            {"name": "Pediatric Care", "description": "Child health and development"},
        ],
    },
    "multi-specialty": {
        "label": "Multi-Specialty",
        "tagline": "Comprehensive Healthcare",
        "currency": "INR",
        "theme": {"primary": "#4f46e5", "primaryDark": "#4338ca"},
        "modules": _modules(telemedicine=True),
        "specializations": [
            "General Medicine",
            "Cardiology",
            "Orthopedics",
            "Pediatrics",
            "Dermatology",
            "ENT",
        ],
        "departments": [
            {"name": "General Medicine", "description": "Primary and internal medicine"},
            {"name": "Cardiology", "description": "Heart and vascular care"},
            {"name": "Orthopedics", "description": "Bones, joints and musculoskeletal care"},
            {"name": "Pediatrics", "description": "Child health and development"},
            {"name": "Emergency", "description": "Casualty and emergency services"},
        ],
    },
    "dental": {
        "label": "Dental Clinic",
        "tagline": "Dental & Oral Care",
        "currency": "INR",
        "theme": {"primary": "#0d9488", "primaryDark": "#0f766e"},
        "modules": _modules(lab=False, nursing=False, anc=False),
        "specializations": ["General Dentistry", "Orthodontics", "Endodontics", "Periodontics", "Oral Surgery"],
        "departments": [
            {"name": "General Dentistry", "description": "Routine dental care and checkups"},
            {"name": "Orthodontics", "description": "Braces and teeth alignment"},
            {"name": "Oral Surgery", "description": "Extractions and surgical procedures"},
        ],
    },
    "eye": {
        "label": "Eye Hospital",
        "tagline": "Ophthalmology & Vision Care",
        "currency": "INR",
        "theme": {"primary": "#2563eb", "primaryDark": "#1d4ed8"},
        "modules": _modules(lab=False, nursing=False, anc=False),
        "specializations": ["Ophthalmology", "Optometry", "Retina", "Glaucoma", "Cornea"],
        "departments": [
            {"name": "General Ophthalmology", "description": "Comprehensive eye examinations"},
            {"name": "Optometry", "description": "Vision testing and corrective lenses"},
            {"name": "Retina Clinic", "description": "Retinal and vitreous care"},
        ],
    },
    "diagnostic": {
        "label": "Diagnostic Center",
        "tagline": "Diagnostics & Pathology",
        "currency": "INR",
        "theme": {"primary": "#7c3aed", "primaryDark": "#6d28d9"},
        "modules": _modules(pharmacy=False, nursing=False, telemedicine=False, anc=False),
        "specializations": ["Pathology", "Radiology", "Microbiology", "Biochemistry"],
        "departments": [
            {"name": "Pathology", "description": "Blood, urine and tissue analysis"},
            {"name": "Radiology", "description": "X-ray, ultrasound, CT and MRI imaging"},
            {"name": "Sample Collection", "description": "Walk-in and home sample collection"},
        ],
    },
}

CATEGORY_IDS = list(CATEGORY_TEMPLATES.keys())


def get_template(category: str) -> CategoryTemplate:
    if category not in CATEGORY_TEMPLATES:
        raise ValueError(f"Unknown hospital category: {category}")
    return CATEGORY_TEMPLATES[category]

"""Catalog of the statutory licences and registration documents a hospital
carries, plus the enumerations the onboarding wizard renders.

Code-owned reference data, like categories.py and the permission catalog — not a
table. A licence type exists here because the product knows how to ask for it;
which licences a *particular* hospital holds is data in `hospital_licences`.

`required_for` is the interesting column. Most licences are conditional: a drug
licence matters only if the pharmacy module is on, PCPNDT only where there is an
ultrasound, NABL only for a lab. Encoding that here means the wizard can ask a
maternity hospital for its PCPNDT registration and never show it to a dental
clinic, and the same rule can later drive a "you are missing X" nag without
either place re-deriving it.

Nothing here is enforced as a hard requirement at onboarding. A tenant is
routinely created for a demo or a trial before a single certificate exists, so
blocking POST /hospitals on a drug licence would block the common case to serve
the rare one. The catalog describes what *should* be collected; the
`onboarding_status` on the hospital records how far that got.
"""

from typing import Optional, TypedDict


class LicenceType(TypedDict):
    code: str
    label: str
    description: str
    authority: str
    # Hospital categories this applies to; empty means "all".
    categories: list[str]
    # Feature module that makes it relevant; None means "regardless of plan".
    module: Optional[str]
    # Whether this licence carries an expiry date worth tracking.
    expires: bool
    sort_order: int


LICENCE_TYPES: list[LicenceType] = [
    {
        "code": "clinical_establishment",
        "label": "Clinical Establishment Registration",
        "description": (
            "Registration under the Clinical Establishments Act (or the state "
            "Nursing Home Act where the CEA has not been adopted)."
        ),
        "authority": "State Health Department / District Registering Authority",
        "categories": [],
        "module": None,
        "expires": True,
        "sort_order": 10,
    },
    {
        "code": "fire_safety",
        "label": "Fire Safety NOC",
        "description": "No-objection certificate from the state fire service.",
        "authority": "State Fire & Emergency Services",
        "categories": [],
        "module": None,
        "expires": True,
        "sort_order": 20,
    },
    {
        "code": "biomedical_waste",
        "label": "Biomedical Waste Authorisation",
        "description": (
            "Authorisation under the Bio-Medical Waste Management Rules, plus "
            "the agreement with the common treatment facility."
        ),
        "authority": "State Pollution Control Board",
        "categories": [],
        "module": None,
        "expires": True,
        "sort_order": 30,
    },
    {
        "code": "drug_licence",
        "label": "Drug Licence (Form 20 / 21)",
        "description": (
            "Retail licence to stock and dispense medicines. Required only "
            "where the hospital runs its own pharmacy."
        ),
        "authority": "State Drugs Control Administration",
        "categories": [],
        "module": "pharmacy",
        "expires": True,
        "sort_order": 40,
    },
    {
        "code": "nabl",
        "label": "NABL Accreditation",
        "description": "Laboratory accreditation under ISO 15189.",
        "authority": "National Accreditation Board for Testing and Calibration Laboratories",
        "categories": [],
        "module": "lab",
        "expires": True,
        "sort_order": 50,
    },
    {
        "code": "pcpndt",
        "label": "PC-PNDT Registration",
        "description": (
            "Registration of every ultrasound machine under the PC-PNDT Act. "
            "Operating one without it is a criminal offence, not a lapse."
        ),
        "authority": "District Appropriate Authority (PC-PNDT)",
        "categories": ["maternity", "multi-specialty", "diagnostic"],
        "module": None,
        "expires": True,
        "sort_order": 60,
    },
    {
        "code": "aerb",
        "label": "AERB Radiation Licence",
        "description": "Licence for X-ray, CT and other radiation-emitting equipment.",
        "authority": "Atomic Energy Regulatory Board",
        "categories": ["multi-specialty", "diagnostic"],
        "module": None,
        "expires": True,
        "sort_order": 70,
    },
    {
        "code": "blood_bank",
        "label": "Blood Bank / Storage Licence",
        "description": "Licence to store or issue blood components.",
        "authority": "CDSCO / State Drugs Control Administration",
        "categories": ["multi-specialty", "maternity"],
        "module": None,
        "expires": True,
        "sort_order": 80,
    },
    {
        "code": "trade_licence",
        "label": "Municipal Trade Licence",
        "description": "Permission to operate the premises from the local body.",
        "authority": "Municipal Corporation / Panchayat",
        "categories": [],
        "module": None,
        "expires": True,
        "sort_order": 90,
    },
    {
        "code": "lift_licence",
        "label": "Lift / Elevator Licence",
        "description": "Required wherever the facility operates a passenger lift.",
        "authority": "State Electrical Inspectorate",
        "categories": [],
        "module": None,
        "expires": True,
        "sort_order": 100,
    },
    {
        "code": "other",
        "label": "Other",
        "description": "Any licence the catalog does not name.",
        "authority": "",
        "categories": [],
        "module": None,
        "expires": True,
        "sort_order": 999,
    },
]

LICENCE_TYPE_CODES = {lt["code"] for lt in LICENCE_TYPES}


def licences_for(category: str, modules: dict) -> list[LicenceType]:
    """The licence types worth asking a hospital of this shape about.

    A type applies when its category list is empty or contains `category`, and
    when its module is off the books or switched on for this tenant.
    """
    result = []
    for lt in LICENCE_TYPES:
        if lt["categories"] and category not in lt["categories"]:
            continue
        if lt["module"] and not (modules or {}).get(lt["module"]):
            continue
        result.append(lt)
    return sorted(result, key=lambda lt: lt["sort_order"])


class DocumentType(TypedDict):
    code: str
    label: str
    description: str
    sort_order: int


DOCUMENT_TYPES: list[DocumentType] = [
    {
        "code": "registration_certificate",
        "label": "Registration Certificate",
        "description": "The clinical establishment registration certificate.",
        "sort_order": 10,
    },
    {
        "code": "incorporation_certificate",
        "label": "Incorporation / Trust Deed",
        "description": "Certificate of incorporation, partnership deed, or trust deed.",
        "sort_order": 20,
    },
    {
        "code": "pan_card",
        "label": "PAN Card",
        "description": "PAN of the registered entity, not of the owner.",
        "sort_order": 30,
    },
    {
        "code": "gst_certificate",
        "label": "GST Certificate",
        "description": "GST registration certificate.",
        "sort_order": 40,
    },
    {
        "code": "licence",
        "label": "Licence Scan",
        "description": "The scan backing one of the licences recorded above.",
        "sort_order": 50,
    },
    {
        "code": "medical_director_registration",
        "label": "Medical Director's Registration",
        "description": "State medical council registration of the responsible clinician.",
        "sort_order": 60,
    },
    {
        "code": "premises_proof",
        "label": "Premises Proof",
        "description": "Ownership document or rent agreement for the premises.",
        "sort_order": 70,
    },
    {
        "code": "cancelled_cheque",
        "label": "Cancelled Cheque",
        "description": "Bank proof for settlements and refunds.",
        "sort_order": 80,
    },
    {
        "code": "logo",
        "label": "Logo / Letterhead",
        "description": "Branding assets used on prescriptions, invoices and reports.",
        "sort_order": 90,
    },
    {
        "code": "other",
        "label": "Other",
        "description": "Anything else supplied during onboarding.",
        "sort_order": 999,
    },
]

DOCUMENT_TYPE_CODES = {dt["code"] for dt in DOCUMENT_TYPES}


# --- Enumerations the wizard renders ----------------------------------------
# Kept here so the frontend fetches them rather than restating them. Every one
# of these was already a hardcoded <select> waiting to happen.

ENTITY_TYPES = [
    {"code": "proprietorship", "label": "Sole Proprietorship"},
    {"code": "partnership", "label": "Partnership Firm"},
    {"code": "llp", "label": "Limited Liability Partnership"},
    {"code": "private_limited", "label": "Private Limited Company"},
    {"code": "public_limited", "label": "Public Limited Company"},
    {"code": "trust", "label": "Trust"},
    {"code": "society", "label": "Society"},
    {"code": "government", "label": "Government Body"},
]

OWNERSHIP_TYPES = [
    {"code": "private", "label": "Private"},
    {"code": "trust", "label": "Trust / Charitable"},
    {"code": "government", "label": "Government"},
    {"code": "psu", "label": "Public Sector Undertaking"},
]

FACILITY_TYPES = [
    {"code": "clinic", "label": "Clinic"},
    {"code": "polyclinic", "label": "Polyclinic"},
    {"code": "nursing_home", "label": "Nursing Home"},
    {"code": "day_care", "label": "Day Care Centre"},
    {"code": "hospital", "label": "Hospital"},
    {"code": "diagnostic_centre", "label": "Diagnostic Centre"},
]

NABH_STATUSES = [
    {"code": "none", "label": "Not accredited"},
    {"code": "pre_accreditation", "label": "Pre-accreditation (Entry)"},
    {"code": "entry_level", "label": "Entry Level Certified"},
    {"code": "full", "label": "Full Accreditation"},
]

SUBSCRIPTION_PLANS = [
    {"code": "trial", "label": "Trial"},
    {"code": "basic", "label": "Basic"},
    {"code": "standard", "label": "Standard"},
    {"code": "enterprise", "label": "Enterprise"},
]

INDIAN_STATES = [
    "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam",
    "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
    "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh",
    "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
    "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
    "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
]

# State medical councils, for the medical director's registration.
MEDICAL_COUNCILS = [
    "National Medical Commission",
    "Andhra Pradesh Medical Council", "Assam Medical Council", "Bihar Medical Council",
    "Chhattisgarh Medical Council", "Delhi Medical Council", "Goa Medical Council",
    "Gujarat Medical Council", "Haryana Medical Council",
    "Himachal Pradesh Medical Council", "Jammu & Kashmir Medical Council",
    "Jharkhand Medical Council", "Karnataka Medical Council",
    "Madhya Pradesh Medical Council", "Maharashtra Medical Council",
    "Odisha Medical Council", "Punjab Medical Council", "Rajasthan Medical Council",
    "Tamil Nadu Medical Council", "Telangana State Medical Council",
    "Travancore-Cochin Medical Council", "Uttar Pradesh Medical Council",
    "Uttarakhand Medical Council", "West Bengal Medical Council",
]

"""Tenant provisioning — create a hospital from a category template and seed its
starter config (modules/theme/currency), its departments, its registration
profile, its licences, its subscription, and a first admin.

Used by the superadmin onboarding endpoint (POST /hospitals) and by the seed to
create demo tenants. Catalog tables (medicines / lab tests) are seeded in a
later slice once those tables exist.

Everything here happens in the caller's transaction and the caller commits. A
half-provisioned tenant — a hospital row with no profile, or with two of its
five licences — is a state every downstream screen would have to defend against,
so the whole registration lands or none of it does.
"""

from typing import Optional

from sqlalchemy.orm import Session

from . import models
from .auth import hash_password
from .categories import get_template
from .utils import new_id, now_iso

# Columns the caller may set on the hospital row beyond the template's own.
# Listed rather than splatted so a stray key is dropped here instead of raising
# a TypeError from the ORM constructor halfway through provisioning.
_LEGAL_FIELDS = (
    "legal_name",
    "entity_type",
    "ownership",
    "registration_no",
    "registration_authority",
    "registration_valid_till",
    "pan",
    "gstin",
    "hfr_id",
    "nabh_status",
    "nabh_valid_till",
    "onboarding_status",
    "go_live_date",
)

_LICENCE_FIELDS = (
    "type",
    "number",
    "issuing_authority",
    "issued_on",
    "expires_on",
    "status",
    "document_url",
    "notes",
)


def provision_hospital(
    db: Session,
    *,
    name: str,
    subdomain: str,
    category: str,
    hospital_id: Optional[str] = None,
    tagline: Optional[str] = None,
    currency: Optional[str] = None,
    theme: Optional[dict] = None,
    modules: Optional[dict] = None,
    legal: Optional[dict] = None,
    profile: Optional[dict] = None,
    licences: Optional[list[dict]] = None,
    departments: Optional[list[dict]] = None,
    subscription: Optional[dict] = None,
    admin_email: Optional[str] = None,
    admin_password: str = "password123",
    admin_name: Optional[str] = None,
    admin_phone: str = "",
) -> models.Hospital:
    template = get_template(category)
    hid = hospital_id or new_id("hosp")
    created = now_iso()
    resolved_modules = modules if modules is not None else template["modules"]

    hospital = models.Hospital(
        id=hid,
        name=name,
        subdomain=subdomain,
        category=category,
        tagline=tagline if tagline is not None else template["tagline"],
        currency=currency or template["currency"],
        modules=resolved_modules,
        theme=theme or template["theme"],
        status="active",
        created_at=created,
        **{
            k: v
            for k, v in (legal or {}).items()
            if k in _LEGAL_FIELDS and v is not None
        },
    )
    db.add(hospital)
    # Ensure the hospitals row exists before its hospital_id children insert.
    db.flush()

    # The category's departments are a *suggestion*, not a fact about the
    # facility. "Maternity" genuinely implies obstetrics and a labour ward;
    # "multi-specialty" implies almost nothing, and seeding six specialities a
    # hospital does not run leaves reception able to book patients into a
    # department with no doctors in it. So the caller may name its own, and the
    # template is the fallback for when it does not — which keeps every existing
    # caller, including the seeder, behaving exactly as before.
    for dept in departments if departments is not None else template["departments"]:
        dept_name = (dept.get("name") or "").strip()
        if not dept_name:
            continue
        db.add(
            models.Department(
                id=new_id("dept"),
                hospital_id=hid,
                name=dept_name,
                description=(dept.get("description") or "").strip(),
            )
        )

    # A profile row always exists, even when nothing was supplied. The settings
    # screen and whatever prints a letterhead then read one shape instead of
    # branching on "has this hospital been profiled yet".
    _provision_profile(db, hid, profile or {}, category=category, modules=resolved_modules)

    for licence in licences or []:
        if not (licence.get("type") or "").strip():
            continue
        db.add(
            models.HospitalLicence(
                id=new_id("lic"),
                hospital_id=hid,
                created_at=created,
                updated_at=created,
                **{
                    k: v
                    for k, v in licence.items()
                    if k in _LICENCE_FIELDS and v is not None
                },
            )
        )

    _provision_subscription(
        db, hid, subscription or {}, currency=hospital.currency, created=created
    )

    # First tenant admin so the hospital is usable immediately.
    db.add(
        models.User(
            id=new_id("user"),
            hospital_id=hid,
            email=admin_email or f"admin@{subdomain}.example.com",
            password=hash_password(admin_password),
            name=admin_name or f"{name} Admin",
            phone=admin_phone or "",
            role="admin",
            created_at=created,
        )
    )

    return hospital


def _provision_profile(
    db: Session, hospital_id: str, profile: dict, *, category: str, modules: dict
) -> models.HospitalProfile:
    values = {
        k: v
        for k, v in profile.items()
        if v is not None and hasattr(models.HospitalProfile, k)
    }

    # The wizard can skip the clinical step entirely, and when it does these
    # flags should still agree with what the tenant actually bought — a hospital
    # on the lab module has a lab. An explicit value from the form always wins;
    # this only fills a blank.
    for flag, module in (("has_lab", "lab"), ("has_pharmacy", "pharmacy")):
        values.setdefault(flag, bool((modules or {}).get(module)))
    values.setdefault(
        "facility_type", "diagnostic_centre" if category == "diagnostic" else ""
    )

    row = models.HospitalProfile(
        id=new_id("hprof"),
        hospital_id=hospital_id,
        updated_at=now_iso(),
        **values,
    )
    db.add(row)
    return row


def _provision_subscription(
    db: Session, hospital_id: str, subscription: dict, *, currency: str, created: str
) -> models.HospitalSubscription:
    values = {
        k: v
        for k, v in subscription.items()
        if v is not None and hasattr(models.HospitalSubscription, k)
    }
    # setdefault is not enough here: the request schema carries defaults, so
    # these keys arrive *present and empty* rather than absent whenever the
    # wizard's plan step was skipped. Empty has to count as unanswered.
    #
    # The tenant's own currency is the sensible default for what we bill it in,
    # and a subscription starts the day the tenant does.
    if not values.get("currency"):
        values["currency"] = currency
    if not values.get("started_on"):
        values["started_on"] = created[:10]
    row = models.HospitalSubscription(
        id=new_id("sub"),
        hospital_id=hospital_id,
        created_at=created,
        updated_at=created,
        **values,
    )
    db.add(row)
    return row

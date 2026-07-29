"""Tenant provisioning — create a hospital from a category template and seed its
starter config (modules/theme/currency), its departments, and a first admin.

Used by the superadmin onboarding endpoint (POST /hospitals) and by the seed to
create demo tenants. Catalog tables (medicines / lab tests) are seeded in a
later slice once those tables exist.
"""

from typing import Optional

from sqlalchemy.orm import Session

from . import models
from .auth import hash_password
from .categories import get_template
from .utils import new_id, now_iso


def provision_hospital(
    db: Session,
    *,
    name: str,
    subdomain: str,
    category: str,
    hospital_id: Optional[str] = None,
    theme: Optional[dict] = None,
    admin_email: Optional[str] = None,
    admin_password: str = "password123",
    admin_name: Optional[str] = None,
) -> models.Hospital:
    template = get_template(category)
    hid = hospital_id or new_id("hosp")
    created = now_iso()

    hospital = models.Hospital(
        id=hid,
        name=name,
        subdomain=subdomain,
        category=category,
        tagline=template["tagline"],
        currency=template["currency"],
        modules=template["modules"],
        theme=theme or template["theme"],
        status="active",
        created_at=created,
    )
    db.add(hospital)
    # Ensure the hospitals row exists before its hospital_id children insert.
    db.flush()

    for dept in template["departments"]:
        db.add(
            models.Department(
                id=new_id("dept"),
                hospital_id=hid,
                name=dept["name"],
                description=dept["description"],
            )
        )

    # First tenant admin so the hospital is usable immediately.
    db.add(
        models.User(
            id=new_id("user"),
            hospital_id=hid,
            email=admin_email or f"admin@{subdomain}.example.com",
            password=hash_password(admin_password),
            name=admin_name or f"{name} Admin",
            role="admin",
            created_at=created,
        )
    )

    return hospital

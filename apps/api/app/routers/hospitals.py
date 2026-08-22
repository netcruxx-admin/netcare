"""Hospital (tenant) endpoints.

Two audiences, and the split matters. `/hospitals/current` and
`/hospitals/public` are public and serve the *runtime* config — the branding and
modules the login page needs before anyone has signed in. Everything else is the
platform superadmin's registration surface behind `hospitals.manage`, and none of
it is public: a hospital's PAN, its licence numbers and its billing terms are not
branding.

The registration is spread across five tables (see models.Hospital and friends)
but is created in one request, because a tenant that exists without a profile is
a state nothing downstream expects. Documents are the exception — they are files,
so they upload against a hospital that already exists.
"""

from datetime import date, timedelta
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from .. import audit, licences as licence_catalog, models, schemas, sessions, storage
from ..auth import get_current_user
from ..authz import require_permission
from ..categories import CATEGORY_TEMPLATES
from ..database import get_db
from ..utils import ListQuery, list_params, new_id, now_iso, paginate, text_search
from ..provisioning import provision_hospital
from ..tenancy import get_tenant_id, resolve_public_tenant

router = APIRouter(prefix="/hospitals", tags=["hospitals"])


@router.get("/public", response_model=list[schemas.HospitalPublicOut])
def list_public_hospitals(db: Session = Depends(get_db)):
    """Active, verified hospitals — for the patient self-registration picker.
    No auth: a patient choosing which hospital to register with has no account yet."""
    rows = (
        db.query(models.Hospital, models.HospitalProfile)
        .outerjoin(
            models.HospitalProfile,
            models.HospitalProfile.hospital_id == models.Hospital.id,
        )
        .filter(
            models.Hospital.status == "active",
            models.Hospital.onboarding_status == "verified",
        )
        .order_by(models.Hospital.name)
        .all()
    )
    # Built field by field rather than model_validate(row): this response is
    # public, so an allowlist means a column added later is private until someone
    # deliberately adds it here.
    return [
        schemas.HospitalPublicOut(
            id=h.id,
            name=h.name,
            subdomain=h.subdomain,
            category=h.category,
            tagline=h.tagline or "",
            theme=h.theme or {},
            logo_url=(p.logo_url if p else "") or "",
        )
        for h, p in rows
    ]


@router.get("/current", response_model=schemas.HospitalOut)
def current_hospital(
    db: Session = Depends(get_db),
    tenant_id: str = Depends(resolve_public_tenant),
):
    """The active tenant's config — the FE fetches this at boot to replace the
    old hardcoded lib/hospitalConfig.ts. Public (no auth): branding/modules are
    needed to render the login page. Tenant resolves from subdomain.

    Safe to serve wholesale because `hospitals` carries only runtime config and
    legal identity; the address, licences and billing terms a stranger has no
    business reading live in the child tables, which this does not touch.
    """
    hospital = db.get(models.Hospital, tenant_id)
    if hospital is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hospital not found")
    return hospital


# ----- Helpers ---------------------------------------------------------------


def _get_hospital(db: Session, hospital_id: str) -> models.Hospital:
    hospital = db.get(models.Hospital, hospital_id)
    if hospital is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hospital not found")
    return hospital


def _profile_of(db: Session, hospital_id: str) -> Optional[models.HospitalProfile]:
    return (
        db.query(models.HospitalProfile)
        .filter(models.HospitalProfile.hospital_id == hospital_id)
        .first()
    )


def _subscription_of(
    db: Session, hospital_id: str
) -> Optional[models.HospitalSubscription]:
    return (
        db.query(models.HospitalSubscription)
        .filter(models.HospitalSubscription.hospital_id == hospital_id)
        .first()
    )


def _licences_of(db: Session, hospital_id: str) -> list[models.HospitalLicence]:
    return (
        db.query(models.HospitalLicence)
        .filter(models.HospitalLicence.hospital_id == hospital_id)
        .order_by(models.HospitalLicence.type)
        .all()
    )


def _document_out(row: models.HospitalDocument) -> schemas.HospitalDocumentOut:
    """A document row with a URL the browser can actually fetch.

    `file_url` is stored opaque and stable (see app/storage.py); the signature
    is attached here, on the way out, and is never written back.
    """
    out = schemas.HospitalDocumentOut.model_validate(row)
    out.file_url = storage.public_url(row.file_url)
    return out


def _licence_out(row: models.HospitalLicence) -> schemas.HospitalLicenceOut:
    """Same treatment for the scan attached to a licence, which is a copy of
    some document's stored URL."""
    out = schemas.HospitalLicenceOut.model_validate(row)
    out.document_url = storage.public_url(row.document_url)
    return out


def _documents_of(db: Session, hospital_id: str) -> list[models.HospitalDocument]:
    return (
        db.query(models.HospitalDocument)
        .filter(models.HospitalDocument.hospital_id == hospital_id)
        .order_by(models.HospitalDocument.uploaded_at.desc())
        .all()
    )


# ----- Platform (superadmin) endpoints ---------------------------------------


@router.get("/meta/onboarding", response_model=schemas.OnboardingMetaOut)
def onboarding_meta(
    category: Optional[str] = Query(default=None),
    _: str = Depends(require_permission("hospitals.manage")),
):
    """The catalogs the onboarding wizard renders.

    Served rather than restated in TypeScript because which licences apply is
    already a rule (category + enabled modules, see licences.py), and a second
    copy of that rule in the frontend would drift the first time one side
    changed. Pass `category` to get only the licence types that vertical needs,
    plus its suggested departments.
    """
    template = CATEGORY_TEMPLATES.get(category or "")
    if template is not None:
        applicable = licence_catalog.licences_for(category, template["modules"])
        suggested = list(template["departments"])
    else:
        applicable = licence_catalog.LICENCE_TYPES
        suggested = []

    return schemas.OnboardingMetaOut(
        licence_types=[dict(lt) for lt in applicable],
        document_types=[dict(dt) for dt in licence_catalog.DOCUMENT_TYPES],
        entity_types=licence_catalog.ENTITY_TYPES,
        ownership_types=licence_catalog.OWNERSHIP_TYPES,
        facility_types=licence_catalog.FACILITY_TYPES,
        nabh_statuses=licence_catalog.NABH_STATUSES,
        subscription_plans=licence_catalog.SUBSCRIPTION_PLANS,
        states=licence_catalog.INDIAN_STATES,
        medical_councils=licence_catalog.MEDICAL_COUNCILS,
        categories=[
            {"code": code, "label": tpl["label"], "tagline": tpl["tagline"]}
            for code, tpl in CATEGORY_TEMPLATES.items()
        ],
        suggested_departments=suggested,
    )


@router.get(
    "/meta/expiring-licences", response_model=list[schemas.HospitalLicenceOut]
)
def expiring_licences(
    within_days: int = Query(default=60, ge=1, le=365),
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    """Licences lapsing in the next `within_days`, across every tenant.

    The question the licence table exists to answer, and the reason it is a table
    rather than columns on `hospitals`: one indexed range scan over
    `ix_hospital_licences_expiry`, whatever the licence type.

    A licence with no expiry date is not expiring and is excluded — "" sorts
    before every real date and would otherwise match every window.
    """
    horizon = (date.today() + timedelta(days=within_days)).isoformat()
    return (
        db.query(models.HospitalLicence)
        .filter(
            models.HospitalLicence.expires_on != "",
            models.HospitalLicence.expires_on <= horizon,
        )
        .order_by(models.HospitalLicence.expires_on)
        .all()
    )


@router.get("", response_model=list[schemas.HospitalOut])
def list_hospitals(
    response: Response,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    category: Optional[str] = Query(default=None),
    onboarding_status: Optional[str] = Query(default=None),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    query = db.query(models.Hospital)
    if status_filter:
        query = query.filter(models.Hospital.status == status_filter)
    if category:
        query = query.filter(models.Hospital.category == category)
    if onboarding_status:
        query = query.filter(models.Hospital.onboarding_status == onboarding_status)
    query = text_search(
        query,
        [
            models.Hospital.name,
            models.Hospital.subdomain,
            models.Hospital.tagline,
            models.Hospital.legal_name,
            models.Hospital.registration_no,
            models.Hospital.gstin,
        ],
        params.q,
    )
    query = query.order_by(models.Hospital.name)
    return paginate(query, response, params.limit, params.offset).all()


@router.post(
    "", response_model=schemas.HospitalDetailOut, status_code=status.HTTP_201_CREATED
)
def onboard_hospital(
    body: schemas.HospitalCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    """Create a tenant and its whole registration in one transaction."""
    if db.query(models.Hospital).filter(models.Hospital.subdomain == body.subdomain).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Subdomain already in use")

    admin = body.admin or schemas.HospitalAdminCreate(
        email=body.admin_email, password=body.admin_password, name=body.admin_name
    )
    if admin.email:
        # Caught here rather than at the unique index so the wizard can point at
        # the field. Platform users (hospital_id IS NULL) count too: an email
        # that already signs in as a superadmin must not also be minted as a
        # tenant admin.
        clash = (
            db.query(models.User)
            .filter(models.User.email == admin.email.strip().lower())
            .first()
        )
        if clash is not None and clash.hospital_id is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "That email already belongs to a platform account",
            )

    legal = body.model_dump(
        include={
            "legal_name", "entity_type", "ownership", "registration_no",
            "registration_authority", "registration_valid_till", "pan", "gstin",
            "hfr_id", "nabh_status", "nabh_valid_till", "onboarding_status",
            "go_live_date",
        }
    )

    hospital = provision_hospital(
        db,
        name=body.name,
        subdomain=body.subdomain,
        category=body.category,
        tagline=body.tagline,
        currency=body.currency,
        theme=body.theme,
        modules=body.modules,
        legal=legal,
        profile=body.profile.model_dump() if body.profile else None,
        licences=[lic.model_dump() for lic in body.licences],
        departments=(
            [d.model_dump() for d in body.departments]
            if body.departments is not None
            else None
        ),
        subscription=body.subscription.model_dump() if body.subscription else None,
        admin_email=(admin.email or "").strip().lower() or None,
        admin_password=admin.password or "password123",
        admin_name=admin.name,
        admin_phone=admin.phone or "",
    )
    db.commit()
    db.refresh(hospital)
    # Provisioning a tenant also mints its first admin account, so it belongs in
    # that tenant's own trail from row one — otherwise the hospital's earliest
    # audit entry is someone already inside it.
    audit.record_tenant(hospital.id)
    audit.record_subject("hospital", hospital.id, detail=hospital.subdomain)
    return _detail(db, hospital)


@router.get("/{hospital_id}", response_model=schemas.HospitalOut)
def get_hospital(
    hospital_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    return _get_hospital(db, hospital_id)


@router.get("/{hospital_id}/detail", response_model=schemas.HospitalDetailOut)
def get_hospital_detail(
    hospital_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    """Everything registered about one hospital, in one round trip — the
    settings screen would otherwise make five."""
    return _detail(db, _get_hospital(db, hospital_id))


def _detail(db: Session, hospital: models.Hospital) -> schemas.HospitalDetailOut:
    return schemas.HospitalDetailOut(
        hospital=schemas.HospitalOut.model_validate(hospital),
        profile=(
            schemas.HospitalProfileOut.model_validate(profile)
            if (profile := _profile_of(db, hospital.id))
            else None
        ),
        licences=[_licence_out(row) for row in _licences_of(db, hospital.id)],
        documents=[_document_out(row) for row in _documents_of(db, hospital.id)],
        subscription=(
            schemas.HospitalSubscriptionOut.model_validate(subscription)
            if (subscription := _subscription_of(db, hospital.id))
            else None
        ),
    )


@router.patch("/{hospital_id}", response_model=schemas.HospitalOut)
def update_hospital(
    hospital_id: str,
    body: schemas.HospitalUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _: str = Depends(require_permission("hospitals.manage")),
):
    hospital = _get_hospital(db, hospital_id)
    fields = body.model_dump(exclude_unset=True)
    for field, value in fields.items():
        setattr(hospital, field, value)

    # When and by whom a hospital was verified is a fact about what happened,
    # so the server writes it rather than trusting a client to send it — the
    # same rule that governs invoices and result timestamps.
    if fields.get("onboarding_status") == "verified" and not hospital.verified_at:
        hospital.verified_at = now_iso()
        hospital.verified_by = user.id

    # Suspending a tenant already blocks new sign-ins, but that leaves everyone
    # currently inside there until their refresh window lapses — which is up to
    # a week of a suspended hospital still reading records. Cutting the sessions
    # is what makes the suspension take effect now.
    if fields.get("status") == "suspended":
        sessions.revoke_all_for_hospital(
            db, hospital.id, reason=sessions.REVOKED_HOSPITAL_SUSPENDED
        )

    db.commit()
    db.refresh(hospital)
    audit.record_subject("hospital", hospital.id, detail=hospital.subdomain)
    return hospital


@router.delete("/{hospital_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_hospital(
    hospital_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    hospital = _get_hospital(db, hospital_id)
    sessions.revoke_all_for_hospital(
        db, hospital.id, reason=sessions.REVOKED_HOSPITAL_SUSPENDED
    )
    # The rows cascade; the blobs behind the documents do not, so they are
    # removed here rather than left orphaned on disk forever.
    for document in _documents_of(db, hospital.id):
        storage.delete_file(document.file_url)
    db.delete(hospital)
    db.commit()


# ----- The hospital's own settings screen ------------------------------------
#
# Everything above this point is the platform looking at a hospital
# (`hospitals.manage`, any tenant, by id). These two are a hospital looking at
# itself: the tenant comes from the caller's token, never from the URL, so
# there is no id to tamper with and no way to name someone else's hospital.


@router.get("/me/settings", response_model=schemas.HospitalDetailOut)
def my_hospital_settings(
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospital.profile.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    """The caller's own hospital, whole — identity, profile, licences,
    documents and plan.

    The same shape the platform's detail endpoint returns, deliberately: an
    admin should be able to see everything recorded about them, including the
    parts only we can change. Being unable to *edit* the GSTIN is not a reason
    to be unable to *read* it — quite the opposite, since noticing it is wrong
    is the first step to asking for it to be fixed.
    """
    return _detail(db, _get_hospital(db, tenant_id))


@router.patch("/me/settings", response_model=schemas.HospitalDetailOut)
def update_my_hospital_settings(
    body: schemas.HospitalSelfUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospital.profile.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Update the parts of their own hospital an admin owns.

    The allowlist is `HospitalSelfUpdate` itself — a field that is not on that
    model cannot arrive here, so legal identity, subdomain, category, modules
    and the numbering prefixes are unreachable rather than merely unrendered.
    A screen that hides a field is a hint; this is the guarantee.

    PATCH, not PUT: unset fields are left alone, so one section can be saved
    without blanking the rest.
    """
    hospital = _get_hospital(db, tenant_id)
    changes = body.model_dump(exclude_unset=True)

    profile = _profile_of(db, tenant_id)
    if profile is None:
        # A hospital onboarded before profiles existed has no row yet. Create it
        # rather than 404 — the admin asking to set their address is not the
        # right moment to explain our migration history.
        profile = models.HospitalProfile(id=new_id("hprof"), hospital_id=tenant_id)
        db.add(profile)

    for field, value in changes.items():
        target = (
            hospital
            if field in schemas.HOSPITAL_SELF_FIELDS_ON_HOSPITAL
            else profile
        )
        setattr(target, field, value)

    if changes:
        profile.updated_at = now_iso()
        db.commit()
        db.refresh(hospital)
        db.refresh(profile)
        audit.record_subject("hospital_profile", profile.id, detail=tenant_id)

    return _detail(db, hospital)


@router.put("/me/razorpay", response_model=schemas.RazorpaySettingsOut)
def update_my_razorpay_settings(
    body: schemas.RazorpaySettingsUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospital.profile.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Store this hospital's own Razorpay Key ID and Key Secret.

    The secret is written to the DB but never returned — only `has_secret`
    comes back so the UI can show a masked indicator. To rotate, submit new
    values; to clear, use DELETE /hospitals/me/razorpay (not implemented yet,
    since no hospital has asked for it).
    """
    profile = _profile_of(db, tenant_id)
    if profile is None:
        profile = models.HospitalProfile(id=new_id("hprof"), hospital_id=tenant_id)
        db.add(profile)

    profile.razorpay_key_id = body.key_id.strip()
    profile.razorpay_key_secret = body.key_secret.strip()
    profile.updated_at = now_iso()
    db.commit()
    db.refresh(profile)
    audit.record_subject("hospital_profile", profile.id, detail=tenant_id)

    return schemas.RazorpaySettingsOut(
        key_id=profile.razorpay_key_id,
        has_secret=bool(profile.razorpay_key_secret),
    )


@router.get("/me/razorpay", response_model=schemas.RazorpaySettingsOut)
def get_my_razorpay_settings(
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospital.profile.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Return current Razorpay configuration (key_id + has_secret indicator)."""
    profile = _profile_of(db, tenant_id)
    return schemas.RazorpaySettingsOut(
        key_id=profile.razorpay_key_id if profile and profile.razorpay_key_id else "",
        has_secret=bool(profile and profile.razorpay_key_secret),
    )


# ----- Operational settings --------------------------------------------------
# Public read (booking UI needs it before login) + admin write.


@router.get("/current/operational", response_model=schemas.HospitalOperationalOut)
def current_operational(
    db: Session = Depends(get_db),
    tenant_id: str = Depends(resolve_public_tenant),
):
    """Operational config — public, resolves from subdomain like /current.

    Returns the default (12:00-14:00) when the hospital has no profile yet.
    """
    if not tenant_id:
        return schemas.HospitalOperationalOut()
    profile = _profile_of(db, tenant_id)
    if not profile:
        return schemas.HospitalOperationalOut()
    return schemas.HospitalOperationalOut(
        lunch_break_start=profile.lunch_break_start or "12:00",
        lunch_break_end=profile.lunch_break_end or "14:00",
        appointment_slot_minutes=profile.appointment_slot_minutes or 15,
    )


@router.put("/me/operational", response_model=schemas.HospitalOperationalOut)
def update_operational(
    body: schemas.HospitalOperationalUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _: str = Depends(require_permission("hospital.operational.manage")),
):
    """Update the operational settings (lunch break window) for the caller's hospital."""
    profile = _profile_of(db, user.hospital_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hospital profile not found")
    profile.lunch_break_start = body.lunch_break_start
    profile.lunch_break_end = body.lunch_break_end
    profile.updated_at = now_iso()
    db.commit()
    db.refresh(profile)
    return schemas.HospitalOperationalOut(
        lunch_break_start=profile.lunch_break_start,
        lunch_break_end=profile.lunch_break_end,
    )


# ----- Profile ---------------------------------------------------------------


@router.get("/{hospital_id}/profile", response_model=schemas.HospitalProfileOut)
def get_profile(
    hospital_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    _get_hospital(db, hospital_id)
    profile = _profile_of(db, hospital_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    return profile


@router.put("/{hospital_id}/profile", response_model=schemas.HospitalProfileOut)
def replace_profile(
    hospital_id: str,
    body: schemas.HospitalProfileUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    """PUT rather than PATCH: the settings screen edits the profile as one form
    and submits all of it, so a full replacement is what actually happens."""
    _get_hospital(db, hospital_id)
    profile = _profile_of(db, hospital_id)
    if profile is None:
        # A hospital created before this table existed has no row yet.
        profile = models.HospitalProfile(id=new_id("hprof"), hospital_id=hospital_id)
        db.add(profile)
    for field, value in body.model_dump().items():
        setattr(profile, field, value)
    profile.updated_at = now_iso()
    db.commit()
    db.refresh(profile)
    audit.record_subject("hospital_profile", profile.id, detail=hospital_id)
    return profile


# ----- Licences --------------------------------------------------------------


@router.get("/{hospital_id}/licences", response_model=list[schemas.HospitalLicenceOut])
def list_licences(
    hospital_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    _get_hospital(db, hospital_id)
    return _licences_of(db, hospital_id)


@router.post(
    "/{hospital_id}/licences",
    response_model=schemas.HospitalLicenceOut,
    status_code=status.HTTP_201_CREATED,
)
def add_licence(
    hospital_id: str,
    body: schemas.HospitalLicenceCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    _get_hospital(db, hospital_id)
    now = now_iso()
    licence = models.HospitalLicence(
        id=new_id("lic"),
        hospital_id=hospital_id,
        created_at=now,
        updated_at=now,
        **body.model_dump(),
    )
    db.add(licence)
    db.commit()
    db.refresh(licence)
    audit.record_subject("hospital_licence", licence.id, detail=licence.type)
    return _licence_out(licence)


@router.patch(
    "/{hospital_id}/licences/{licence_id}", response_model=schemas.HospitalLicenceOut
)
def update_licence(
    hospital_id: str,
    licence_id: str,
    body: schemas.HospitalLicenceUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    licence = _licence_or_404(db, hospital_id, licence_id)
    fields = body.model_dump(exclude_unset=True)
    # Which scan backs a licence is set by the upload that produced it, not by
    # the client echoing a URL back. Since outgoing URLs are now signed, taking
    # this from the client would store a link that expires — and a stored URL
    # that has expired is a document nobody can open again.
    fields.pop("document_url", None)
    for field, value in fields.items():
        setattr(licence, field, value)
    licence.updated_at = now_iso()
    db.commit()
    db.refresh(licence)
    audit.record_subject("hospital_licence", licence.id, detail=licence.type)
    return _licence_out(licence)


@router.delete(
    "/{hospital_id}/licences/{licence_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_licence(
    hospital_id: str,
    licence_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    licence = _licence_or_404(db, hospital_id, licence_id)
    db.delete(licence)
    db.commit()


def _licence_or_404(
    db: Session, hospital_id: str, licence_id: str
) -> models.HospitalLicence:
    # Filtered by hospital as well as id: a licence belonging to another
    # hospital is not found here, it is not forbidden. A 403 would confirm the
    # id exists.
    licence = (
        db.query(models.HospitalLicence)
        .filter(
            models.HospitalLicence.id == licence_id,
            models.HospitalLicence.hospital_id == hospital_id,
        )
        .first()
    )
    if licence is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Licence not found")
    return licence


# ----- Documents -------------------------------------------------------------


@router.get("/{hospital_id}/documents", response_model=list[schemas.HospitalDocumentOut])
def list_documents(
    hospital_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    _get_hospital(db, hospital_id)
    return [_document_out(row) for row in _documents_of(db, hospital_id)]


@router.post(
    "/{hospital_id}/documents",
    response_model=schemas.HospitalDocumentOut,
    status_code=status.HTTP_201_CREATED,
)
def upload_document(
    hospital_id: str,
    file: UploadFile = File(...),
    # Aliased to camelCase because that is what crosses the wire everywhere else
    # (CamelModel does it for JSON bodies). Form parameters get no alias
    # generator, so without these the field names silently do not match what the
    # client sends and every upload lands as an untyped "other" — which is
    # exactly what happened before they were added.
    doc_type: str = Form(default="other", alias="docType"),
    licence_type: str = Form(default="", alias="licenceType"),
    title: str = Form(default=""),
    notes: str = Form(default=""),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _: str = Depends(require_permission("hospitals.manage")),
):
    """Upload one registration document.

    Multipart, and separate from POST /hospitals, because files are: the wizard
    creates the hospital from its JSON body and then posts each collected file
    against the id it got back. Bundling base64 blobs into the create body would
    make an ordinary onboarding request tens of megabytes of JSON.
    """
    _get_hospital(db, hospital_id)
    if doc_type not in licence_catalog.DOCUMENT_TYPE_CODES:
        doc_type = "other"

    url, original_name, size = storage.save_upload(
        fileobj=file.file,
        filename=file.filename or "document",
        content_type=file.content_type or "",
        folder=hospital_id,
    )

    document = models.HospitalDocument(
        id=new_id("hdoc"),
        hospital_id=hospital_id,
        doc_type=doc_type,
        licence_type=licence_type or "",
        title=title or original_name,
        file_name=original_name,
        file_url=url,
        content_type=file.content_type or "",
        size_bytes=size,
        uploaded_by=user.id,
        uploaded_at=now_iso(),
        notes=notes or "",
    )
    db.add(document)

    # A licence scan is only useful attached to its licence, and making the
    # client do that as a second request means a scan that silently belongs to
    # nothing whenever the second request fails.
    if doc_type == "licence" and licence_type:
        licence = (
            db.query(models.HospitalLicence)
            .filter(
                models.HospitalLicence.hospital_id == hospital_id,
                models.HospitalLicence.type == licence_type,
            )
            .first()
        )
        if licence is not None:
            licence.document_url = url
            licence.updated_at = now_iso()

    db.commit()
    db.refresh(document)
    audit.record_subject("hospital_document", document.id, detail=doc_type)
    return _document_out(document)


@router.delete(
    "/{hospital_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_document(
    hospital_id: str,
    document_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    document = (
        db.query(models.HospitalDocument)
        .filter(
            models.HospitalDocument.id == document_id,
            models.HospitalDocument.hospital_id == hospital_id,
        )
        .first()
    )
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")

    # Clear the pointer before the row goes, so no licence is left citing a URL
    # that 404s.
    db.query(models.HospitalLicence).filter(
        models.HospitalLicence.hospital_id == hospital_id,
        models.HospitalLicence.document_url == document.file_url,
    ).update({models.HospitalLicence.document_url: ""}, synchronize_session=False)

    storage.delete_file(document.file_url)
    db.delete(document)
    db.commit()


# ----- Subscription ----------------------------------------------------------


@router.get(
    "/{hospital_id}/subscription", response_model=schemas.HospitalSubscriptionOut
)
def get_subscription(
    hospital_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    _get_hospital(db, hospital_id)
    subscription = _subscription_of(db, hospital_id)
    if subscription is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription not found")
    return subscription


@router.put(
    "/{hospital_id}/subscription", response_model=schemas.HospitalSubscriptionOut
)
def replace_subscription(
    hospital_id: str,
    body: schemas.HospitalSubscriptionUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("hospitals.manage")),
):
    _get_hospital(db, hospital_id)
    subscription = _subscription_of(db, hospital_id)
    now = now_iso()
    if subscription is None:
        subscription = models.HospitalSubscription(
            id=new_id("sub"), hospital_id=hospital_id, created_at=now
        )
        db.add(subscription)
    for field, value in body.model_dump().items():
        setattr(subscription, field, value)
    subscription.updated_at = now
    db.commit()
    db.refresh(subscription)
    audit.record_subject("hospital_subscription", subscription.id, detail=hospital_id)
    return subscription

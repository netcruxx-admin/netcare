"""Hospital (tenant) endpoints.

Two audiences, and the split matters. `/hospitals/current` is public and serves
the *runtime* config — the branding and modules the login page needs before
anyone has signed in. Everything else is the platform superadmin's registration
surface behind `hospitals.manage`, and none of it is public: a hospital's PAN,
its licence numbers and its billing terms are not branding.

The registration is spread across five tables (see models.Hospital and
friends) but is created in one request, because a tenant that exists without a
profile is a state nothing downstream expects. Documents are the exception —
they are files, so they upload against a hospital that already exists.
"""

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
from ..tenancy import resolve_public_tenant

router = APIRouter(prefix="/hospitals", tags=["hospitals"])


@router.get("/current", response_model=schemas.HospitalOut)
def current_hospital(
    db: Session = Depends(get_db),
    tenant_id: str = Depends(resolve_public_tenant),
):
    """The active tenant's config — the FE fetches this at boot to replace the
    old hardcoded lib/hospitalConfig.ts. Public (no auth): branding/modules are
    needed to render the login page. Tenant resolves from subdomain."""
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
    changed. Pass `category` to get only the licence types that vertical needs.
    """
    if category and category in CATEGORY_TEMPLATES:
        template = CATEGORY_TEMPLATES[category]
        applicable = licence_catalog.licences_for(category, template["modules"])
    else:
        applicable = licence_catalog.LICENCE_TYPES

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


@router.post("", response_model=schemas.HospitalDetailOut, status_code=status.HTTP_201_CREATED)
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
        licences=[
            schemas.HospitalLicenceOut.model_validate(row)
            for row in _licences_of(db, hospital.id)
        ],
        documents=[
            schemas.HospitalDocumentOut.model_validate(row)
            for row in _documents_of(db, hospital.id)
        ],
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
    return licence


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
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(licence, field, value)
    licence.updated_at = now_iso()
    db.commit()
    db.refresh(licence)
    audit.record_subject("hospital_licence", licence.id, detail=licence.type)
    return licence


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
    return _documents_of(db, hospital_id)


@router.post(
    "/{hospital_id}/documents",
    response_model=schemas.HospitalDocumentOut,
    status_code=status.HTTP_201_CREATED,
)
def upload_document(
    hospital_id: str,
    file: UploadFile = File(...),
    # Aliased because a multipart body does not go through CamelModel, and the
    # rest of this API is camelCase on the wire. Without these the frontend
    # would have to remember that one endpoint out of every endpoint is snake.
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
    return document


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

"""Reading the notice, giving consent, and taking it back.

`GET /consent-purposes` is deliberately unauthenticated. A DPDP notice has to be
readable *before* collection, and the sign-up form that shows it has no token
yet — a notice you can only see after handing over your data is not a notice.

Everything else is permission-gated, with the asymmetry the law asks for:
recording someone else's consent needs `consents.manage`, but withdrawing your
own needs nothing beyond being signed in. Withdrawal must be as easy as granting
was, so it does not route through staff.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from .. import audit, consent as consent_lib, models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, require_permission
from ..database import get_db
from ..tenancy import get_tenant_id, resolve_public_tenant, scoped
from ..utils import ListQuery, list_params, paginate

router = APIRouter(tags=["consent"])


@router.get("/consent-purposes", response_model=list[schemas.ConsentPurposeOut])
def list_consent_purposes(
    db: Session = Depends(get_db),
    tenant_id: str = Depends(resolve_public_tenant),
):
    """The notice: everything this hospital may ask to do with your data.

    Public, and masked by the tenant's enabled modules — a hospital that runs no
    video consultations should not be showing a telemedicine notice, because
    describing processing that will never happen misleads as surely as omitting
    processing that will.
    """
    hospital = db.get(models.Hospital, tenant_id) if tenant_id else None
    return consent_lib.available_purposes(db, hospital)


@router.get("/consents", response_model=list[schemas.ConsentOut])
def list_consents(
    response: Response,
    subject_user_id: Optional[str] = Query(default=None, alias="subjectUserId"),
    include_withdrawn: bool = Query(default=False, alias="includeWithdrawn"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("consents.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    """What a person has agreed to. Under scope "own", only yourself."""
    query = scoped(db, models.Consent, tenant_id)
    if scope == SCOPE_OWN:
        # Not a 403 on a mismatched subjectUserId: narrowing to the caller means
        # asking about someone else returns nothing, which tells the asker
        # nothing about whether that someone exists.
        query = query.filter(models.Consent.subject_user_id == user.id)
    elif subject_user_id:
        query = query.filter(models.Consent.subject_user_id == subject_user_id)
    if not include_withdrawn:
        query = query.filter(models.Consent.withdrawn_at.is_(None))
    query = query.order_by(models.Consent.granted_at.desc(), models.Consent.id)
    rows = paginate(query, response, params.limit, params.offset).all()

    labels = {
        p.code: p.label for p in db.query(models.ConsentPurpose).all()
    }
    # Computed per subject rather than per row — the answer is the same for
    # every row belonging to one person, and the query is not free.
    stale_by_subject: dict[str, set[str]] = {}
    out = []
    for row in rows:
        item = schemas.ConsentOut.model_validate(row)
        item.purpose_label = labels.get(row.purpose_code, row.purpose_code)
        if row.subject_user_id not in stale_by_subject:
            stale_by_subject[row.subject_user_id] = consent_lib.stale_purpose_codes(
                db, row.subject_user_id, tenant_id
            )
        item.stale = row.purpose_code in stale_by_subject[row.subject_user_id]
        out.append(item)
    return out


@router.post(
    "/consents", response_model=schemas.ConsentOut, status_code=status.HTTP_201_CREATED
)
def create_consent(
    body: schemas.ConsentCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("consents.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Record a consent — your own, or someone else's at the desk.

    Scope "own" is what a patient holds: they may consent for themselves and
    nobody else. Staff holding "all" record on behalf, and the row keeps both
    identities so an auditor can see who operated the form.
    """
    subject_user_id = body.subject_user_id or user.id
    if scope == SCOPE_OWN and subject_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only record your own consent",
        )

    purpose = db.get(models.ConsentPurpose, body.purpose_code)
    hospital = db.get(models.Hospital, tenant_id)
    offered = {p.code for p in consent_lib.available_purposes(db, hospital)}
    if purpose is None or purpose.code not in offered:
        # An unknown purpose and one this hospital does not offer are the same
        # answer to the client: there is nothing here to consent to.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown consent purpose"
        )

    if purpose.cadence == consent_lib.CADENCE_PER_EVENT and not body.appointment_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"'{purpose.code}' is consented per consultation — name the "
                "appointment it applies to."
            ),
        )

    row = consent_lib.record(
        db,
        tenant_id=tenant_id,
        subject_user_id=subject_user_id,
        purpose=purpose,
        method=body.method,
        recorded_by_user_id=user.id,
        guardian_user_id=body.guardian_user_id,
        guardian_name=body.guardian_name,
        guardian_relationship=body.guardian_relationship,
        appointment_id=body.appointment_id,
        ip=request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else ""),
        user_agent=request.headers.get("user-agent", "")[:256],
    )
    db.commit()
    db.refresh(row)

    audit.record_subject("consent", row.id, detail=purpose.code)
    out = schemas.ConsentOut.model_validate(row)
    out.purpose_label = purpose.label
    return out


@router.post("/consents/{purpose_code}/withdraw", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_consent(
    purpose_code: str,
    subject_user_id: Optional[str] = Query(default=None, alias="subjectUserId"),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
):
    """Take a consent back.

    No permission dependency, and that is the point: DPDP requires withdrawal to
    be as easy as granting, so a signed-in person can always withdraw their own
    without holding anything. Withdrawing on someone *else's* behalf is the
    privileged act, so that branch checks `consents.manage` explicitly rather
    than the endpoint as a whole.
    """
    subject = subject_user_id or user.id
    if subject != user.id:
        from ..authz import effective_permissions

        if effective_permissions(db, user).get("consents.manage") != "all":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only withdraw your own consent",
            )

    closed = consent_lib.withdraw(
        db, tenant_id=tenant_id, subject_user_id=subject, purpose_code=purpose_code
    )
    if not closed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active consent to withdraw",
        )
    db.commit()
    audit.record_subject("consent", purpose_code, detail="withdrawn")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

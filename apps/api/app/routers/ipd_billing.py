from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, require_permission
from ..database import get_db
from ..ipd import caller_may_view_admission, compute_bill
from ..tenancy import get_tenant_id, scoped
from ..utils import new_id, now_iso

router = APIRouter(prefix="/admissions", tags=["ipd-billing"])

# room is computed from nights-stayed x the bed's daily_rate (see ipd.compute_bill),
# never a line a person enters — see AdmissionChargeItemCreate.
_MANUAL_CHARGE_TYPES = {"nursing", "doctor_visit", "procedure", "misc"}


def _get_admission_or_404(db: Session, tenant_id: str, admission_id: str) -> models.Admission:
    admission = (
        scoped(db, models.Admission, tenant_id)
        .filter(models.Admission.id == admission_id)
        .first()
    )
    if admission is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admission not found")
    return admission


def _check_own_scope(db: Session, user: models.User, scope: str, admission: models.Admission) -> None:
    # No list-filter to hang an "own" grant off here — there is just the one
    # admission named in the URL — so this checks the party directly instead
    # of building a query filter, unlike list_admissions/list_discharge_summaries.
    if scope == SCOPE_OWN and not caller_may_view_admission(db, user, admission):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not a party to this admission")


@router.get("/{admission_id}/bill", response_model=schemas.AdmissionBillOut)
def get_admission_bill(
    admission_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("ipd_billing.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    admission = _get_admission_or_404(db, tenant_id, admission_id)
    _check_own_scope(db, user, scope, admission)
    bill = compute_bill(db, tenant_id, admission)
    return schemas.AdmissionBillOut(**bill)


@router.get("/{admission_id}/charge-items", response_model=list[schemas.AdmissionChargeItemOut])
def list_charge_items(
    admission_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("ipd_billing.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    admission = _get_admission_or_404(db, tenant_id, admission_id)
    _check_own_scope(db, user, scope, admission)
    return (
        scoped(db, models.AdmissionChargeItem, tenant_id)
        .filter(models.AdmissionChargeItem.admission_id == admission_id)
        .order_by(models.AdmissionChargeItem.charged_at)
        .all()
    )


@router.post(
    "/{admission_id}/charge-items",
    response_model=schemas.AdmissionChargeItemOut,
    status_code=status.HTTP_201_CREATED,
)
def create_charge_item(
    admission_id: str,
    body: schemas.AdmissionChargeItemCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("ipd_billing.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    # No current grant hands ipd_billing.manage out at "own" scope (only
    # admin/receptionist, both "all") — this check is here so that if one
    # ever is, it fails safe instead of silently letting anyone bill any
    # admission.
    admission = _get_admission_or_404(db, tenant_id, admission_id)
    _check_own_scope(db, user, scope, admission)
    # Charge items are deliberately postable even after discharge — settling
    # the final bill is itself a post-discharge activity — so this does not
    # check TERMINAL_STATUSES the way clinical writes on the admission do.
    if body.charge_type not in _MANUAL_CHARGE_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"charge_type must be one of {sorted(_MANUAL_CHARGE_TYPES)}",
        )
    item = models.AdmissionChargeItem(
        id=new_id("chg"),
        hospital_id=tenant_id,
        admission_id=admission_id,
        charge_type=body.charge_type,
        description=body.description,
        amount=body.amount,
        quantity=body.quantity,
        created_by=user.id,
        charged_at=now_iso(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

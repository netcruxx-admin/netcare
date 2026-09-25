from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import audit, ipd, models, schemas
from ..auth import get_current_user
from ..authz import effective_permissions, require_any_permission, require_permission
from ..database import get_db
from ..tenancy import assert_in_tenant, get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, paginate, text_search

router = APIRouter(prefix="/wards", tags=["wards"])


def _bed_counts(db: Session, tenant_id: str, ward_ids: list[str]) -> dict[str, int]:
    """How many beds each of these wards holds, in one GROUP BY.

    Counted here rather than stored on the ward, so the number can never drift
    from the beds table, and rather than left to the client, which would have
    to download every bed row to add up a column — the same reason
    GET /appointments/stats exists instead of counting fifty rows on screen.
    """
    if not ward_ids:
        return {}
    rows = (
        scoped(db, models.Bed, tenant_id)
        .with_entities(models.Bed.ward_id, func.count())
        .filter(models.Bed.ward_id.in_(ward_ids))
        .group_by(models.Bed.ward_id)
        .all()
    )
    return dict(rows)


@router.get("", response_model=list[schemas.WardOut])
def list_wards(
    response: Response,
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    # Read on either grant: the ward-management screen holds wards.manage, a
    # bed picker (admit flow, bed board) holds only beds.read.
    _: dict = Depends(require_any_permission("wards.manage", "beds.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Ward, tenant_id)
    query = text_search(query, [models.Ward.name, models.Ward.description], params.q)
    query = query.order_by(models.Ward.name)
    wards = paginate(query, response, params.limit, params.offset).all()
    counts = _bed_counts(db, tenant_id, [w.id for w in wards])
    for ward in wards:
        ward.bed_count = counts.get(ward.id, 0)
    return wards


@router.post("", response_model=schemas.WardOut, status_code=status.HTTP_201_CREATED)
def create_ward(
    body: schemas.WardCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("wards.manage")),
    user: models.User = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
):
    """Create a ward, optionally with its first beds in the same transaction.

    `body.beds` is what makes this one job rather than two: an admin opening a
    ward has always had to come back and add its beds one POST at a time, and
    a ward with no beds is not yet usable by the admit flow.

    Two capabilities meet here, so both are checked rather than letting
    `wards.manage` quietly grow the power to create beds. The endpoint guard
    stays `wards.manage`; `beds.manage` is required *only* when beds were
    actually asked for, so a role holding just `wards.manage` keeps working
    exactly as before instead of losing the endpoint.
    """
    assert_in_tenant(db, models.Department, body.department_id, tenant_id)
    seed = body.beds
    if seed is not None:
        held = effective_permissions(db, user)
        audit.record_permission("beds.manage", held.get("beds.manage"))
        if "beds.manage" not in held:
            audit.record_action("permission_denied")
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "You do not have permission to add beds",
            )

    ward = models.Ward(
        id=new_id("ward"),
        hospital_id=tenant_id,
        **body.model_dump(exclude={"beds"}),
    )
    db.add(ward)
    # Ward and Bed are joined by a raw FK column, not a relationship(), so the
    # unit of work has no dependency to order these inserts by and would send
    # the beds first. Flush pins the ward row down before they reference it;
    # it stays inside the same transaction, so the commit below is still what
    # makes either half visible.
    db.flush()

    created = 0
    if seed is not None:
        for number in ipd.seeded_bed_numbers(seed.number_prefix, seed.count):
            db.add(
                models.Bed(
                    id=new_id("bed"),
                    hospital_id=tenant_id,
                    ward_id=ward.id,
                    bed_number=number,
                    bed_type=seed.bed_type,
                    daily_rate=seed.daily_rate,
                )
            )
        created = seed.count

    # One commit for both halves: a ward that half-created its beds would leave
    # the admin guessing which numbers exist.
    db.commit()
    db.refresh(ward)
    # A brand-new ward holds exactly what was just seeded, so there is nothing
    # to count — set on the instance rather than stored, since bed_count is
    # derived, not a column.
    ward.bed_count = created
    return ward


@router.put("/{ward_id}", response_model=schemas.WardOut)
def update_ward(
    ward_id: str,
    body: schemas.WardUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("wards.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    changes = body.model_dump(exclude_unset=True)
    if "department_id" in changes:
        assert_in_tenant(db, models.Department, changes["department_id"], tenant_id)
    ward = (
        scoped(db, models.Ward, tenant_id).filter(models.Ward.id == ward_id).first()
    )
    if ward is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ward not found")
    for field, value in changes.items():
        setattr(ward, field, value)
    db.commit()
    db.refresh(ward)
    ward.bed_count = _bed_counts(db, tenant_id, [ward.id]).get(ward.id, 0)
    return ward


@router.delete("/{ward_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ward(
    ward_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("wards.delete")),
    tenant_id: str = Depends(get_tenant_id),
):
    ward = (
        scoped(db, models.Ward, tenant_id).filter(models.Ward.id == ward_id).first()
    )
    if ward is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ward not found")
    # A ward with any occupied bed cannot be deleted out from under an active
    # stay — the FK cascade on beds.ward_id would otherwise silently strand
    # admissions pointing at a bed that no longer exists.
    occupied = (
        scoped(db, models.Bed, tenant_id)
        .filter(models.Bed.ward_id == ward_id, models.Bed.status == "occupied")
        .first()
    )
    if occupied is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This ward has an occupied bed and cannot be deleted",
        )
    db.delete(ward)
    db.commit()

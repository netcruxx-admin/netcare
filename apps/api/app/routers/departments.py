from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import require_permission
from ..database import get_db
from .. import clinical_fields
from ..specialties import SPECIALTY_CATALOG, SPECIALTY_CATALOG_IDS, SPECIALTY_TEMPLATES, infer_specialty
from ..tenancy import get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, paginate, text_search

router = APIRouter(prefix="/departments", tags=["departments"])


def _checked_specialty(value: str) -> str:
    if value and value not in SPECIALTY_CATALOG_IDS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown specialty: {value}")
    return value


def _checked_overrides(vitals: Optional[list[str]], notes: Optional[list[str]]) -> None:
    for given, catalog, what in (
        (vitals, clinical_fields.VITAL_KEYS, "vitals field"),
        (notes, clinical_fields.NOTE_KEYS, "clinical-note field"),
    ):
        if given is not None and (bad := clinical_fields.unknown_keys(given, catalog)):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown {what}: {bad[0]}")


# Declared before "/{department_id}" so "field-catalog" is not read as an id.
@router.get("/field-catalog", response_model=schemas.FieldCatalogOut)
def field_catalog(
    _scope: str = Depends(require_permission("departments.read")),
    _tenant_id: str = Depends(get_tenant_id),
):
    """Every vitals / clinical-note field a department can record, for the
    checklist on the department form."""
    return schemas.FieldCatalogOut(
        vitals=[schemas.FieldOption(key=k, label=l, group=g) for k, l, g in clinical_fields.VITAL_FIELDS],
        notes=[
            schemas.FieldOption(key=k, label=l, group=g)
            for k, l, g in clinical_fields.NOTE_FIELDS
            if k not in clinical_fields.ALWAYS_NOTES
        ],
    )


# Declared before "/{department_id}" so "specialties" is not read as an id.
@router.get("/specialties", response_model=list[schemas.SpecialtyOption])
def list_specialties(
    _scope: str = Depends(require_permission("departments.read")),
    _tenant_id: str = Depends(get_tenant_id),
):
    """The dropdown for a department's specialty -- one copy of the list, so a
    form never offers a value the server would refuse."""
    return [
        schemas.SpecialtyOption(id=s["id"], label=s["label"], has_template=s["id"] in SPECIALTY_TEMPLATES)
        for s in SPECIALTY_CATALOG
    ]


@router.get("", response_model=list[schemas.DepartmentOut])
def list_departments(
    response: Response,
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("departments.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Department, tenant_id)
    query = text_search(query, [models.Department.name, models.Department.description], params.q)
    query = query.order_by(models.Department.name)
    return paginate(query, response, params.limit, params.offset).all()


@router.post("", response_model=schemas.DepartmentOut, status_code=status.HTTP_201_CREATED)
def create_department(
    body: schemas.DepartmentCreate,
    db: Session = Depends(get_db),
    # Tenant admin manages their own hospital; superadmin passes require_role.
    _: str = Depends(require_permission("departments.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    _checked_overrides(body.vitals_override, body.notes_override)
    department = models.Department(
        id=new_id("dept"),
        hospital_id=tenant_id,
        name=body.name,
        description=body.description,
        # Left blank, guessed from the name -- a guess a person can change.
        specialty=_checked_specialty(body.specialty) or infer_specialty(body.name),
        vitals_override=body.vitals_override,
        notes_override=body.notes_override,
    )
    db.add(department)
    db.commit()
    db.refresh(department)
    return department


@router.put("/{department_id}", response_model=schemas.DepartmentOut)
def update_department(
    department_id: str,
    body: schemas.DepartmentUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("departments.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    department = (
        scoped(db, models.Department, tenant_id)
        .filter(models.Department.id == department_id)
        .first()
    )
    if department is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Department not found")
    changes = body.model_dump(exclude_unset=True)
    _checked_overrides(changes.get("vitals_override"), changes.get("notes_override"))
    if changes.get("specialty") is not None:
        _checked_specialty(changes["specialty"])
    for field, value in changes.items():
        setattr(department, field, value)
    db.commit()
    db.refresh(department)
    return department


@router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    department_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("departments.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    department = (
        scoped(db, models.Department, tenant_id)
        .filter(models.Department.id == department_id)
        .first()
    )
    if department is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Department not found")
    db.delete(department)
    db.commit()

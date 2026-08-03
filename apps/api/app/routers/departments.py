from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import require_permission
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, paginate, text_search

router = APIRouter(prefix="/departments", tags=["departments"])


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
    department = models.Department(
        id=new_id("dept"),
        hospital_id=tenant_id,
        name=body.name,
        description=body.description,
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
    for field, value in body.model_dump(exclude_unset=True).items():
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

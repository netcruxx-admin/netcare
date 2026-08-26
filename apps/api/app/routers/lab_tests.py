from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import require_permission
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, paginate, text_search

router = APIRouter(prefix="/lab-tests", tags=["lab-tests"])


@router.get("", response_model=list[schemas.LabTestOut])
def list_lab_tests(
    response: Response,
    category: Optional[str] = Query(default=None),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("lab_tests.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.LabTest, tenant_id)
    if category:
        query = query.filter(models.LabTest.category == category)
    query = text_search(query, [models.LabTest.name, models.LabTest.category, models.LabTest.sample_type], params.q)
    query = query.order_by(models.LabTest.name)
    return paginate(query, response, params.limit, params.offset).all()


@router.post("", response_model=schemas.LabTestOut, status_code=status.HTTP_201_CREATED)
def create_lab_test(
    body: schemas.LabTestCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("lab_tests.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    test = models.LabTest(
        id=new_id("test"),
        hospital_id=tenant_id,
        **body.model_dump(),
    )
    db.add(test)
    db.commit()
    db.refresh(test)
    return test


@router.put("/{test_id}", response_model=schemas.LabTestOut)
def update_lab_test(
    test_id: str,
    body: schemas.LabTestUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("lab_tests.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    test = (
        scoped(db, models.LabTest, tenant_id)
        .filter(models.LabTest.id == test_id)
        .first()
    )
    if test is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lab test not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(test, field, value)
    db.commit()
    db.refresh(test)
    return test


@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lab_test(
    test_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("lab_tests.delete")),
    tenant_id: str = Depends(get_tenant_id),
):
    test = (
        scoped(db, models.LabTest, tenant_id)
        .filter(models.LabTest.id == test_id)
        .first()
    )
    if test is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lab test not found")
    db.delete(test)
    db.commit()

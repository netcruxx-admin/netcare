from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import create_token, get_current_user, hash_password, verify_password
from ..database import get_db
from ..tenancy import resolve_public_tenant
from ..utils import new_id, now_iso

router = APIRouter(prefix="/auth", tags=["auth"])


def _build_response(db: Session, user: models.User) -> schemas.AuthResponse:
    patient = None
    if user.role == "patient":
        patient = (
            db.query(models.Patient).filter(models.Patient.user_id == user.id).first()
        )
    role = db.get(models.Role, user.role)
    return schemas.AuthResponse(
        user=schemas.UserOut.model_validate(user),
        patient=schemas.PatientOut.model_validate(patient) if patient else None,
        role=schemas.RoleOptionOut.model_validate(role) if role else None,
        token=create_token(user.id, user.hospital_id, user.role),
        is_authenticated=True,
    )


@router.post("/register", response_model=schemas.AuthResponse)
def register(
    body: schemas.RegisterRequest,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(resolve_public_tenant),
):
    # Email is unique per tenant, so the check is scoped to this hospital.
    existing = (
        db.query(models.User)
        .filter(models.User.hospital_id == tenant_id, models.User.email == body.email)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )

    user = models.User(
        id=new_id("user"),
        hospital_id=tenant_id,
        email=body.email,
        password=hash_password(body.password),
        name=body.name,
        phone=body.phone,
        role=body.role,
        created_at=now_iso(),
    )
    db.add(user)

    if body.role == "patient":
        db.add(
            models.Patient(
                id=new_id("pat"),
                hospital_id=tenant_id,
                user_id=user.id,
                phone=body.phone,
                gender=body.gender or "",
                blood_group=body.blood_group or "",
                date_of_birth=body.date_of_birth or "",
                documents=[],
            )
        )
    elif body.role == "doctor":
        db.add(
            models.Doctor(
                id=new_id("doc"),
                hospital_id=tenant_id,
                user_id=user.id,
                specialization=body.specialization or "",
                qualification=body.qualification or "",
                experience_years=body.experience_years or 0,
                available_slots=[],
                verification_status="verified",
            )
        )

    db.commit()
    db.refresh(user)
    return _build_response(db, user)


@router.post("/login", response_model=schemas.AuthResponse)
def login(
    body: schemas.LoginRequest,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(resolve_public_tenant),
):
    # Prefer a user in the resolved tenant; fall back to a platform superadmin
    # (who belongs to no hospital and can sign in from any origin).
    user = (
        db.query(models.User)
        .filter(models.User.hospital_id == tenant_id, models.User.email == body.email)
        .first()
    )
    if user is None:
        user = (
            db.query(models.User)
            .filter(
                models.User.hospital_id.is_(None),
                models.User.role == "superadmin",
                models.User.email == body.email,
            )
            .first()
        )

    if user is None or not verify_password(body.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    return _build_response(db, user)


@router.get("/me", response_model=schemas.AuthResponse)
def me(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _build_response(db, user)

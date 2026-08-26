from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, own_record_filter, require_permission
from ..database import get_db
from ..tenancy import assert_in_tenant, get_tenant_id, scoped
from ..utils import (
    ListQuery,
    attach_patient_names,
    list_params,
    new_id,
    now_iso,
    paginate,
    patient_name_search,
)

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


@router.get("", response_model=list[schemas.PrescriptionOut])
def list_prescriptions(
    response: Response,
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    appointment_id: Optional[str] = Query(default=None, alias="appointmentId"),
    doctor_id: Optional[str] = Query(default=None, alias="doctorId"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("prescriptions.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Prescription, tenant_id)
    if patient_id:
        query = query.filter(models.Prescription.patient_id == patient_id)
    if appointment_id:
        query = query.filter(models.Prescription.appointment_id == appointment_id)
    if doctor_id:
        query = query.filter(models.Prescription.doctor_id == doctor_id)
    # The filters above are caller-supplied conveniences, not access control:
    # with scope "own" the caller must be a party to the row, so passing someone
    # else's id narrows the result to nothing rather than exposing their records.
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.Prescription))
    # The table shows the patient's name next to the medicine, so both have to
    # be searchable — the name reached through the patient join.
    query = patient_name_search(
        query,
        models.Prescription,
        params.q,
        models.Prescription.medicine_name,
        models.Prescription.dosage,
        models.Prescription.frequency,
        models.Prescription.instructions,
    )
    query = query.order_by(models.Prescription.created_at.desc(), models.Prescription.id)
    rows = paginate(query, response, params.limit, params.offset).all()
    out = [schemas.PrescriptionOut.model_validate(row) for row in rows]
    attach_patient_names(db, out, tenant_id=tenant_id)
    return out


@router.post("", response_model=schemas.PrescriptionOut, status_code=status.HTTP_201_CREATED)
def create_prescription(
    body: schemas.PrescriptionCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("prescriptions.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    # Foreign keys arrive in the body and are otherwise trusted, which would let
    # a row filed in this tenant point at another hospital's patient — an
    # integrity fault that becomes a disclosure the moment a display helper
    # resolves that id to a name. See tenancy.assert_in_tenant.
    assert_in_tenant(db, models.Patient, body.patient_id, tenant_id)
    assert_in_tenant(db, models.Doctor, body.doctor_id, tenant_id)
    assert_in_tenant(db, models.Appointment, body.appointment_id, tenant_id)

    prescription = models.Prescription(
        id=new_id("presc"),
        hospital_id=tenant_id,
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(prescription)
    db.flush()

    # Prescribing puts it in front of the pharmacist. Until this existed the
    # two tables were unconnected: a prescription was something pharmacy could
    # read and not act on, and reaching the dispense queue meant someone
    # retyping the drug by hand — so in practice the queue stayed empty.
    #
    # The order is a *starting point*, not a finished instruction. A
    # prescription records the dose, never the count, and its medicine is free
    # text that may or may not name something stocked. So quantity starts at 1
    # and the catalogue match is a guess; the pharmacist confirms both when
    # dispensing, which is the moment someone is actually counting tablets.
    match = (
        scoped(db, models.Medicine, tenant_id)
        .filter(func.lower(models.Medicine.name) == (body.medicine_name or "").strip().lower())
        .first()
    )
    db.add(
        models.MedicationOrder(
            id=new_id("mord"),
            hospital_id=tenant_id,
            appointment_id=prescription.appointment_id,
            patient_id=prescription.patient_id,
            doctor_id=prescription.doctor_id,
            prescription_id=prescription.id,
            medicine_id=match.id if match else None,
            medicine_name=prescription.medicine_name,
            quantity=1,
            dosage=prescription.dosage,
            route="Oral",
            frequency=prescription.frequency,
            duration=prescription.duration,
            instructions=prescription.instructions,
            status="pending",
            ordered_at=now_iso(),
        )
    )

    db.commit()
    db.refresh(prescription)
    return prescription


def _get_prescription(db: Session, prescription_id: str, tenant_id: str) -> models.Prescription:
    rx = (
        scoped(db, models.Prescription, tenant_id)
        .filter(models.Prescription.id == prescription_id)
        .first()
    )
    if rx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prescription not found")
    return rx


@router.put("/{prescription_id}", response_model=schemas.PrescriptionOut)
def update_prescription(
    prescription_id: str,
    body: schemas.PrescriptionUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("prescriptions.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    rx = _get_prescription(db, prescription_id, tenant_id)

    # With scope "own" the caller must be the prescribing doctor — a 404 rather
    # than 403 so the id itself is not confirmed to an unauthorised caller.
    if scope == SCOPE_OWN:
        doctor = db.query(models.Doctor).filter(models.Doctor.user_id == user.id).first()
        if not doctor or rx.doctor_id != doctor.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prescription not found")

    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    for k, v in fields.items():
        setattr(rx, k, v)

    # Mirror editable fields onto the linked pending medication order so the
    # pharmacist sees the corrected values rather than the accidental ones.
    pending_order = (
        db.query(models.MedicationOrder)
        .filter(
            models.MedicationOrder.prescription_id == rx.id,
            models.MedicationOrder.status == "pending",
        )
        .first()
    )
    if pending_order:
        order_field_map = {
            "medicine_name": "medicine_name",
            "dosage": "dosage",
            "frequency": "frequency",
            "duration": "duration",
            "instructions": "instructions",
        }
        for src, dst in order_field_map.items():
            if src in fields:
                setattr(pending_order, dst, fields[src])

    db.commit()
    db.refresh(rx)
    return rx


@router.delete("/{prescription_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prescription(
    prescription_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("prescriptions.delete")),
    tenant_id: str = Depends(get_tenant_id),
):
    rx = _get_prescription(db, prescription_id, tenant_id)

    if scope == SCOPE_OWN:
        doctor = db.query(models.Doctor).filter(models.Doctor.user_id == user.id).first()
        if not doctor or rx.doctor_id != doctor.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prescription not found")

    # Block deletion when the pharmacy has already dispensed this order — the
    # dispensing record is a fact about what happened and cannot be unwound by
    # removing the prescription that triggered it.
    dispensed_order = (
        db.query(models.MedicationOrder)
        .filter(
            models.MedicationOrder.prescription_id == rx.id,
            models.MedicationOrder.status != "pending",
        )
        .first()
    )
    if dispensed_order:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This prescription has already been dispensed by the pharmacy and cannot be deleted.",
        )

    # Remove the pending pharmacy order that was created alongside the prescription.
    db.query(models.MedicationOrder).filter(
        models.MedicationOrder.prescription_id == rx.id,
        models.MedicationOrder.status == "pending",
    ).delete()

    db.delete(rx)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

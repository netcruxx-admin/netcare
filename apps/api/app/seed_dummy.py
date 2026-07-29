"""Seed the database with the flagship maternity tenant (hosp-1), a platform
superadmin, and the same demo data the frontend prototype uses.

Idempotent: only seeds when hosp-1 is absent."""

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from . import models
from .auth import hash_password
from .categories import get_template

DEMO_PASSWORD = "password123"
HOSP = "hosp-1"


def seed_database(db: Session) -> None:
    # Idempotent: only seed a fresh database.
    if db.get(models.Hospital, HOSP) is not None:
        return

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    def date_offset(days: int) -> str:
        return (now + timedelta(days=days)).date().isoformat()

    def iso_offset(days: int) -> str:
        return (now + timedelta(days=days)).isoformat()

    # --- Tenant: flagship maternity hospital --------------------------------
    template = get_template("maternity")
    db.add(
        models.Hospital(
            id=HOSP,
            name="MediCare Maternity",
            subdomain="medicare",
            category="maternity",
            tagline=template["tagline"],
            currency=template["currency"],
            modules=template["modules"],
            theme=template["theme"],
            status="active",
            created_at=now_iso,
        )
    )
    # Flush so the hospitals row exists before any hospital_id FK references it
    # (no ORM relationships are declared, so we order the inserts explicitly).
    db.flush()

    # --- Platform superadmin (no hospital) ----------------------------------
    db.add(
        models.User(
            id="user-superadmin",
            hospital_id=None,
            email="superadmin@platform.com",
            password=hash_password(DEMO_PASSWORD),
            name="Platform Superadmin",
            role="superadmin",
            created_at=now_iso,
        )
    )

    # Departments
    departments = [
        ("dept-1", "Obstetrics & Gynecology", "Pregnancy, childbirth, and postpartum care"),
        ("dept-2", "Neonatology", "Newborn and infant care"),
        ("dept-3", "Maternal Wellness", "Pre-conception and maternal health"),
        ("dept-4", "Labor & Delivery", "Active labor and delivery services"),
        ("dept-5", "Pediatric Care", "Child health and development"),
    ]
    for did, name, desc in departments:
        db.add(models.Department(id=did, hospital_id=HOSP, name=name, description=desc))

    # Users (tenant-scoped; demo password is "password123")
    users = [
        ("user-1", "patient@example.com", "Sarah Johnson", "patient"),
        ("user-2", "doctor@example.com", "Dr. Emily Watson", "doctor"),
        ("user-3", "doctor2@example.com", "Dr. Michael Chen", "doctor"),
        ("user-4", "doctor3@example.com", "Dr. Priya Sharma", "doctor"),
        ("user-5", "admin@example.com", "Hospital Admin", "admin"),
        ("user-6", "nurse@example.com", "Nurse Joy", "nurse"),
        ("user-7", "lab@example.com", "Lab Technician", "lab"),
    ]
    for uid, email, name, role in users:
        db.add(
            models.User(
                id=uid,
                hospital_id=HOSP,
                email=email,
                password=hash_password(DEMO_PASSWORD),
                name=name,
                role=role,
                created_at=now_iso,
            )
        )

    # Doctors
    doctors = [
        ("doc-1", "user-2", "MBBS, MD (Obstetrics & Gynecology), Fellowship (High-Risk Pregnancy)", "Obstetrics & Gynecology", 15, 800),
        ("doc-2", "user-3", "MBBS, MD (Pediatrics), Neonatology Certification", "Neonatology", 12, 600),
        ("doc-3", "user-4", "MBBS, MD (Obstetrics & Gynecology)", "Maternal Wellness", 10, 700),
    ]
    for did, uid, qual, spec, years, fee in doctors:
        db.add(
            models.Doctor(
                id=did,
                hospital_id=HOSP,
                user_id=uid,
                qualification=qual,
                specialization=spec,
                experience_years=years,
                consultation_fee=fee,
                available_slots=[],
                verification_status="verified",
            )
        )

    # Patient
    db.add(
        models.Patient(
            id="pat-1",
            hospital_id=HOSP,
            user_id="user-1",
            date_of_birth="1992-05-20",
            gender="Female",
            blood_group="A+",
            allergies="No Known Allergies",
            chronic_diseases="None",
            emergency_contact="Robert Johnson",
            emergency_phone="+1-555-0123",
            medical_history="Healthy pregnancy, no complications",
            insurance_provider="MaternityCare Insurance",
            insurance_number="MC-2024-089456",
            documents=[],
        )
    )

    # Appointments
    db.add(
        models.Appointment(
            id="apt-1",
            hospital_id=HOSP,
            patient_id="pat-1",
            doctor_id="doc-1",
            department_id="dept-1",
            date=date_offset(7),
            time="10:00 AM",
            status="scheduled",
            reason="3rd Trimester Checkup",
            notes="Routine antenatal visit, 32 weeks pregnancy",
            created_at=now_iso,
        )
    )
    db.add(
        models.Appointment(
            id="apt-2",
            hospital_id=HOSP,
            patient_id="pat-1",
            doctor_id="doc-1",
            department_id="dept-1",
            date=date_offset(-14),
            time="2:00 PM",
            status="completed",
            reason="2nd Trimester Ultrasound",
            notes="Anatomy scan completed successfully",
            created_at=iso_offset(-14),
        )
    )

    # Medical record
    db.add(
        models.MedicalRecord(
            id="med-1",
            hospital_id=HOSP,
            patient_id="pat-1",
            appointment_id="apt-2",
            doctor_id="doc-1",
            diagnosis="Normal pregnancy, 20 weeks gestation",
            prescription="Prenatal vitamins with folic acid 400mcg, Iron supplement",
            lab_reports=["AFP Level: Normal", "Glucose screening: Normal"],
            created_at=iso_offset(-14),
        )
    )

    # Prescriptions
    prescriptions = [
        ("presc-1", "Prenatal Multivitamin", "1 tablet", "Once daily", "Throughout pregnancy", "Take with food in the morning"),
        ("presc-2", "Folic Acid", "400 mcg", "Once daily", "Throughout pregnancy", "Essential for fetal development"),
        ("presc-3", "Iron Supplement", "300 mg elemental iron", "Once daily", "Second and third trimester", "Take on empty stomach with orange juice, avoid dairy"),
    ]
    for pid, med, dose, freq, dur, instr in prescriptions:
        db.add(
            models.Prescription(
                id=pid,
                hospital_id=HOSP,
                appointment_id="apt-2",
                patient_id="pat-1",
                doctor_id="doc-1",
                medicine_name=med,
                dosage=dose,
                frequency=freq,
                duration=dur,
                instructions=instr,
                created_at=iso_offset(-14),
            )
        )

    # Vitals
    db.add(
        models.Vitals(
            id="vit-1",
            hospital_id=HOSP,
            appointment_id="apt-2",
            patient_id="pat-1",
            doctor_id="doc-1",
            temperature=36.8,
            blood_pressure="118/76",
            heart_rate=78,
            respiratory_rate=16,
            weight=68.5,
            height=165,
            notes=(
                "Weight gain appropriate for 20 weeks gestation (3.5 kg). "
                "Blood pressure and vitals normal. Fetal heart rate: 140-150 bpm"
            ),
            created_at=iso_offset(-14),
        )
    )

    # Payments
    db.add(
        models.Payment(
            id="pay-1",
            hospital_id=HOSP,
            appointment_id="apt-2",
            patient_id="pat-1",
            amount=2500,
            status="completed",
            payment_method="Credit Card",
            created_at=iso_offset(-14),
        )
    )
    db.add(
        models.Payment(
            id="pay-2",
            hospital_id=HOSP,
            appointment_id="apt-1",
            patient_id="pat-1",
            amount=2500,
            status="pending",
            payment_method="Insurance",
            created_at=now_iso,
        )
    )

    # --- Catalog: pharmacy (medicines) --------------------------------------
    medicines = [
        ("med-c1", "Prenatal Multivitamin", "Prenatal", "Tablet", "1 tablet", 250, 120),
        ("med-c2", "Folic Acid", "Supplement", "Tablet", "400 mcg", 80, 300),
        ("med-c3", "Ferrous Sulfate (Iron)", "Supplement", "Tablet", "300 mg", 120, 200),
        ("med-c4", "Paracetamol", "Analgesic", "Tablet", "500 mg", 30, 500),
        ("med-c5", "Amoxicillin", "Antibiotic", "Capsule", "500 mg", 150, 90),
        ("med-c6", "Calcium + Vitamin D3", "Supplement", "Tablet", "500 mg", 180, 150),
        ("med-c7", "Ondansetron", "Antiemetic", "Tablet", "4 mg", 90, 60),
        ("med-c8", "Tetanus Toxoid (TT)", "Other", "Injection", "0.5 ml", 50, 100),
    ]
    for mid, name, cat, form, strength, price, stock in medicines:
        db.add(
            models.Medicine(
                id=mid, hospital_id=HOSP, name=name, category=cat, form=form,
                strength=strength, price=price, stock=stock,
            )
        )

    # --- Catalog: diagnostics (lab tests) -----------------------------------
    lab_tests = [
        ("test-1", "Complete Blood Count (CBC)", "Blood Test", "Blood", 400, "Same day", [
            {"name": "Hemoglobin", "unit": "g/dL", "referenceRange": "12.0 - 15.5", "low": 12, "high": 15.5},
            {"name": "WBC Count", "unit": "/uL", "referenceRange": "4000 - 11000", "low": 4000, "high": 11000},
            {"name": "Platelet Count", "unit": "/uL", "referenceRange": "150000 - 410000", "low": 150000, "high": 410000},
        ]),
        ("test-2", "Blood Glucose (Fasting)", "Blood Test", "Blood", 150, "Same day", [
            {"name": "Fasting Blood Sugar", "unit": "mg/dL", "referenceRange": "70 - 100", "low": 70, "high": 100},
        ]),
        ("test-3", "Obstetric Ultrasound", "Imaging", "Imaging", 1500, "30 minutes", []),
        ("test-4", "Urine Routine", "Urine Test", "Urine", 200, "Same day", []),
        ("test-5", "Thyroid Profile (TSH)", "Blood Test", "Blood", 600, "24 hours", [
            {"name": "TSH", "unit": "uIU/mL", "referenceRange": "0.4 - 4.0", "low": 0.4, "high": 4.0},
        ]),
        ("test-20", "Oral Glucose Tolerance Test (OGTT)", "Blood Test", "Blood", 500, "Same day", []),
    ]
    for tid, name, cat, sample, price, tat, params in lab_tests:
        db.add(
            models.LabTest(
                id=tid, hospital_id=HOSP, name=name, category=cat,
                sample_type=sample, price=price, turnaround_time=tat, parameters=params,
            )
        )

    # --- Maternity signature demo: pregnancy + ANC visits -------------------
    db.add(
        models.PregnancyRecord(
            id="preg-1", hospital_id=HOSP, patient_id="pat-1",
            lmp=date_offset(-224), edd=date_offset(56), gravida=1, para=0,
            height=165, pre_pregnancy_weight=58, blood_group="A+",
            risk_factors=[], status="active",
            notes="Healthy first pregnancy, 32 weeks", created_at=iso_offset(-210),
        )
    )
    anc_visits = [
        ("anc-1", -140, 12, 60.5, 110, 70, 12.0, 11.8, 150),
        ("anc-2", -84, 20, 63.0, 115, 72, 18.0, 11.5, 148),
        ("anc-3", -28, 28, 66.5, 118, 76, 26.0, 11.2, 145),
    ]
    for aid, off, weeks, weight, sys, dia, fundal, hb, fhr in anc_visits:
        db.add(
            models.ANCVisit(
                id=aid, hospital_id=HOSP, pregnancy_id="preg-1", patient_id="pat-1",
                doctor_id="doc-1", date=date_offset(off), weeks=weeks, weight=weight,
                systolic=sys, diastolic=dia, fundal_height=fundal, hemoglobin=hb,
                fetal_heart_rate=fhr, notes="", created_at=iso_offset(off),
            )
        )

    db.commit()

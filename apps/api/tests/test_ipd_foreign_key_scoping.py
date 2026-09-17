"""IPD's own creates, checked the same way test_foreign_key_scoping.py already
checks appointments/vitals/prescriptions/etc: a foreign key in the body naming
another tenant's row must be refused, never silently attached to a row in the
caller's own tenant.

The general-purpose sweep in test_foreign_key_scoping.py's
test_every_fk_carrying_schema_has_a_guarded_handler already proves every
handler *calls* a guard, by reading the source rather than the database — this
file is the complementary, concrete check: actually make the request and read
the response.

Uses hospital_c/hospital_d (ipd enabled) rather than hospital_a/hospital_b.
"""

from app.utils import new_id

ACCEPTABLE = (400, 403, 404, 409, 422)


def _fresh_vacant_bed(tenant) -> str:
    """A ward+bed that is guaranteed vacant, independent of whatever the
    fixture's own shared bed (tenant.ids['bed']) is doing in other tests —
    those may have occupied or transferred it by the time this file runs."""
    ward = tenant.post("/wards", {"name": f"FK-check ward {new_id('w')}", "wardType": "general"})
    assert ward.status_code == 201, ward.text
    bed = tenant.post("/beds", {"wardId": ward.json()["id"], "bedNumber": "FK-1", "dailyRate": 500})
    assert bed.status_code == 201, bed.text
    return bed.json()["id"]


def test_cannot_create_bed_in_another_tenants_ward(hospital_c, hospital_d):
    response = hospital_c.post(
        "/beds", {"wardId": hospital_d.ids["ward"], "bedNumber": "X", "dailyRate": 100}
    )
    assert response.status_code in ACCEPTABLE, (
        f"created a bed against another tenant's ward ({response.status_code})"
    )


def test_cannot_admit_another_tenants_patient(hospital_c, hospital_d):
    bed_id = _fresh_vacant_bed(hospital_c)
    response = hospital_c.post(
        "/admissions",
        {
            "patientId": hospital_d.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "bedId": bed_id,
        },
    )
    assert response.status_code in ACCEPTABLE, (
        f"admitted another tenant's patient ({response.status_code}) — "
        "patientId is not checked against the caller's tenant"
    )


def test_cannot_admit_under_another_tenants_doctor(hospital_c, hospital_d):
    bed_id = _fresh_vacant_bed(hospital_c)
    response = hospital_c.post(
        "/admissions",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_d.ids["doctor"],
            "bedId": bed_id,
        },
    )
    assert response.status_code in ACCEPTABLE, (
        f"admitted a patient under another tenant's doctor ({response.status_code})"
    )


def test_cannot_admit_into_another_tenants_bed(hospital_c, hospital_d):
    response = hospital_c.post(
        "/admissions",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "bedId": hospital_d.ids["bed"],
        },
    )
    assert response.status_code in ACCEPTABLE, (
        f"admitted a patient into another tenant's bed ({response.status_code})"
    )


def test_cannot_name_another_tenants_referring_doctor(hospital_c, hospital_d):
    bed_id = _fresh_vacant_bed(hospital_c)
    response = hospital_c.post(
        "/admissions",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "referringDoctorId": hospital_d.ids["doctor"],
            "bedId": bed_id,
        },
    )
    assert response.status_code in ACCEPTABLE, (
        f"accepted another tenant's referringDoctorId ({response.status_code})"
    )


def test_cannot_write_a_progress_note_against_another_tenants_admission(hospital_c, hospital_d):
    response = hospital_c.post(
        "/progress-notes",
        {"admissionId": hospital_d.ids["admission"], "note": "smuggled"},
        token=hospital_c.doctor_token,
    )
    assert response.status_code in ACCEPTABLE, (
        f"wrote a progress note against another tenant's admission ({response.status_code})"
    )


def test_cannot_discharge_another_tenants_admission(hospital_c, hospital_d):
    """Also proves the discharge endpoint checks admissionId before it does
    anything else — it must not touch hospital_d's bed or status on the way
    to refusing."""
    response = hospital_c.post(
        "/discharge-summaries",
        {"admissionId": hospital_d.ids["admission"], "dischargeType": "routine"},
    )
    assert response.status_code in ACCEPTABLE, (
        f"created a discharge summary against another tenant's admission ({response.status_code})"
    )

    # And hospital_d's admission is still open — the refusal did not half-happen.
    still_admitted = hospital_d.read(f"/admissions/{hospital_d.ids['admission']}").json()
    assert still_admitted["status"] == "admitted"

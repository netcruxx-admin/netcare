"""A doctor's `own` grant on patients.read must include patients they only
ever meet through an IPD admission — an emergency admit with no prior OPD
appointment, say — not just ones they have an Appointment with.

Before the fix in app/authz.py's own_patients_filter, such a patient was
invisible to the doctor under an `own` grant: the "treated" subquery only
looked at Appointment.doctor_id. This is the regression test for that fix,
using hospital_c (ipd enabled) since it needs a real admission to prove it.
"""

from app.utils import new_id


def _register_patient(client, tenant, label: str) -> str:
    response = client.post(
        "/auth/register",
        headers={"X-Hospital-Id": tenant.id},
        json={
            "name": f"{label} {new_id('pt')}",
            "email": f"{label.lower()}-{new_id('pt')}@{tenant.subdomain}.test",
            "password": "Passw0rd!test",
            "phone": "9111111111",
            "role": "patient",
            "dateOfBirth": "1985-05-05",
            "consents": ["treatment", "billing", "communications.service"],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["patient"]["id"]


def test_doctor_sees_a_patient_they_only_admitted(client, hospital_c):
    """The core case: no appointment, only an admission."""
    admission_only_patient = _register_patient(client, hospital_c, "AdmitOnly")

    ward = hospital_c.post("/wards", {"name": f"Own-filter ward {new_id('w')}", "wardType": "general"})
    assert ward.status_code == 201, ward.text
    bed = hospital_c.post(
        "/beds", {"wardId": ward.json()["id"], "bedNumber": "OF-1", "dailyRate": 500}
    )
    assert bed.status_code == 201, bed.text

    admission = hospital_c.post(
        "/admissions",
        {
            "patientId": admission_only_patient,
            "doctorId": hospital_c.ids["doctor"],
            "bedId": bed.json()["id"],
        },
    )
    assert admission.status_code == 201, admission.text

    seen = hospital_c.get("/patients", token=hospital_c.doctor_token).json()
    seen_ids = {p["id"] for p in seen}
    assert admission_only_patient in seen_ids, (
        "a doctor's own_patients_filter did not include a patient reachable "
        "only through an Admission — the fix in authz.py did not take"
    )


def test_doctor_does_not_see_a_patient_with_no_relationship_at_all(client, hospital_c):
    """The complement, so the fix is proven additive rather than a blanket
    widening: a patient neither admitted nor appointed under this doctor
    stays invisible."""
    unrelated_patient = _register_patient(client, hospital_c, "Unrelated")

    seen = hospital_c.get("/patients", token=hospital_c.doctor_token).json()
    seen_ids = {p["id"] for p in seen}
    assert unrelated_patient not in seen_ids, (
        "own_patients_filter leaked a patient the doctor has no appointment "
        "or admission with"
    )

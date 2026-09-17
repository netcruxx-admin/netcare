"""A discharged admission is a closed record — the same shape
test_completed_appointment_is_locked.py checks for a completed appointment,
plus the two things unique to IPD: discharge also frees the bed, and the
DischargeSummary itself has no edit route at all (immutable by the absence of
a PUT, not by a PUT that always refuses).

Uses a throwaway ward/bed/admission per test, never the shared fixture
admission other files still need "admitted".
"""

from app.utils import new_id


def _admit(tenant) -> tuple[str, str]:
    """A fresh admission, in a fresh bed. Returns (admission_id, bed_id)."""
    ward = tenant.post("/wards", {"name": f"Discharge-lock ward {new_id('w')}", "wardType": "general"})
    assert ward.status_code == 201, ward.text
    bed = tenant.post("/beds", {"wardId": ward.json()["id"], "bedNumber": "DL-1", "dailyRate": 750})
    assert bed.status_code == 201, bed.text
    admission = tenant.post(
        "/admissions",
        {
            "patientId": tenant.ids["patient"],
            "doctorId": tenant.ids["doctor"],
            "bedId": bed.json()["id"],
        },
    )
    assert admission.status_code == 201, admission.text
    return admission.json()["id"], bed.json()["id"]


def _discharge(tenant, admission_id, **overrides):
    body = {"admissionId": admission_id, "dischargeType": "routine", **overrides}
    return tenant.post("/discharge-summaries", body)


def test_discharge_creates_the_summary_and_closes_the_admission(hospital_c):
    admission_id, bed_id = _admit(hospital_c)

    response = _discharge(
        hospital_c,
        admission_id,
        diagnosisFinal="Resolved",
        conditionAtDischarge="Stable",
    )
    assert response.status_code == 201, response.text
    assert response.json()["dischargeType"] == "routine"

    admission = hospital_c.read(f"/admissions/{admission_id}").json()
    assert admission["status"] == "discharged"
    assert admission["dischargedAt"]

    # The bed it was holding is free again.
    beds = hospital_c.read("/beds").json()
    bed_row = next(b for b in beds if b["id"] == bed_id)
    assert bed_row["status"] == "vacant"


def test_a_discharged_admission_refuses_further_edits(hospital_c):
    admission_id, _ = _admit(hospital_c)
    done = _discharge(hospital_c, admission_id)
    assert done.status_code == 201, done.text

    response = hospital_c.put(
        f"/admissions/{admission_id}", {"provisionalDiagnosis": "Rewriting history"}
    )
    assert response.status_code == 409, response.text


def test_a_discharged_admission_cannot_be_transferred(hospital_c):
    admission_id, _ = _admit(hospital_c)
    done = _discharge(hospital_c, admission_id)
    assert done.status_code == 201, done.text

    _, other_bed_id = _admit(hospital_c)
    # That second _admit call occupied its own bed with its own admission, but
    # the bed id is all this needs — the point is the *first* admission is the
    # one that must be refused, regardless of the target bed's own state.
    response = hospital_c.post(f"/admissions/{admission_id}/transfer", {"bedId": other_bed_id})
    assert response.status_code == 409, response.text


def test_a_discharged_admission_refuses_new_progress_notes(hospital_c):
    admission_id, _ = _admit(hospital_c)
    done = _discharge(hospital_c, admission_id)
    assert done.status_code == 201, done.text

    response = hospital_c.post(
        "/progress-notes",
        {"admissionId": admission_id, "note": "too late"},
        token=hospital_c.doctor_token,
    )
    assert response.status_code == 409, response.text


def test_an_admission_cannot_be_discharged_twice(hospital_c):
    admission_id, _ = _admit(hospital_c)
    first = _discharge(hospital_c, admission_id)
    assert first.status_code == 201, first.text

    second = _discharge(hospital_c, admission_id, dischargeType="dama")
    assert second.status_code == 409, second.text


def test_discharge_summary_has_no_edit_route(hospital_c):
    """Immutability by the absence of a PUT, not a PUT that always refuses —
    see routers/discharge_summaries.py."""
    admission_id, _ = _admit(hospital_c)
    created = _discharge(hospital_c, admission_id)
    assert created.status_code == 201, created.text
    summary_id = created.json()["id"]

    response = hospital_c.put(f"/discharge-summaries/{summary_id}", {"diagnosisFinal": "edited"})
    assert response.status_code in (404, 405), response.text

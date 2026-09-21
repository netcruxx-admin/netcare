"""Nursing notes — the nurse-round counterpart of progress_notes, and the
direct answer to "no option for ... nurse round": progress_notes.write is
doctor-only by deliberate design, so a nurse's ward round previously had no
note-taking of any kind, only vitals/intake-output charting.

Asserts: module gating (hospital_a, IPD off, 403s regardless of role grants —
same shape as test_ipd_module_gating.py), nurse holds read+write "all", doctor
holds read "own" only (via the new admission-join filter in app/ipd.py, since
NursingNote has no doctor_id column), tenant isolation, FK scoping, and the
closed-admission guard.
"""


def test_hospital_without_ipd_refuses_nursing_notes(hospital_a):
    response = hospital_a.post(
        "/nursing-notes",
        {"admissionId": "doesnt-matter", "note": "x"},
        token=hospital_a.nurse_token,
    )
    assert response.status_code == 403, response.text

    response = hospital_a.get("/nursing-notes", token=hospital_a.nurse_token)
    assert response.status_code == 403, response.text


def test_nurse_can_write_and_read_a_nursing_note(hospital_c):
    response = hospital_c.post(
        "/nursing-notes",
        {"admissionId": hospital_c.ids["admission"], "shift": "morning", "note": "Patient stable, ate breakfast."},
        token=hospital_c.nurse_token,
    )
    assert response.status_code == 201, response.text
    note = response.json()
    assert note["admissionId"] == hospital_c.ids["admission"]
    assert note["shift"] == "morning"
    assert note["nurseName"]

    listed = hospital_c.get(
        f"/nursing-notes?admissionId={hospital_c.ids['admission']}", token=hospital_c.nurse_token
    )
    assert listed.status_code == 200, listed.text
    assert any(n["id"] == note["id"] for n in listed.json())


def test_doctor_cannot_write_a_nursing_note(hospital_c):
    """progress_notes.write is doctor-only; nursing_notes.write is nurse-only
    — the two are deliberately not interchangeable."""
    response = hospital_c.post(
        "/nursing-notes",
        {"admissionId": hospital_c.ids["admission"], "note": "A doctor should not be able to do this"},
        token=hospital_c.doctor_token,
    )
    assert response.status_code == 403, response.text


def test_doctor_reads_only_their_own_attending_admissions(hospital_c):
    """Doctor holds nursing_notes.read at scope "own" — own_nursing_notes_filter
    joins through Admission.doctor_id, since NursingNote itself has no
    doctor_id column for authz.own_record_filter's generic check to find."""
    note = hospital_c.post(
        "/nursing-notes",
        {"admissionId": hospital_c.ids["admission"], "note": "Attending doctor should see this"},
        token=hospital_c.nurse_token,
    )
    assert note.status_code == 201, note.text

    # hospital_c.ids["doctor"] IS the attending doctor on tenant.ids["admission"]
    # (set by _enable_ipd), so this should come back.
    own = hospital_c.get(
        f"/nursing-notes?admissionId={hospital_c.ids['admission']}", token=hospital_c.doctor_token
    )
    assert own.status_code == 200, own.text
    assert any(n["id"] == note.json()["id"] for n in own.json())

    # A second doctor, attending nobody, sees nothing under their own "own" grant.
    other_doctor = hospital_c.post(
        "/users",
        {
            "name": "Dr Other",
            "email": f"other-doc@{hospital_c.subdomain}.test",
            "password": "Passw0rd!test",
            "role": "doctor",
        },
    )
    assert other_doctor.status_code == 201, other_doctor.text
    from tests.conftest import _login

    other_doctor_token = _login(hospital_c.client, hospital_c.id, f"other-doc@{hospital_c.subdomain}.test")
    other = hospital_c.get(
        f"/nursing-notes?admissionId={hospital_c.ids['admission']}", token=other_doctor_token
    )
    assert other.status_code == 200, other.text
    assert other.json() == []


def test_nursing_note_is_refused_on_a_closed_admission(hospital_c):
    bed = hospital_c.post(
        "/beds", {"wardId": hospital_c.ids["ward"], "bedNumber": "nn-closed", "dailyRate": 500}
    )
    assert bed.status_code == 201, bed.text
    admission = hospital_c.post(
        "/admissions",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "bedId": bed.json()["id"],
            "provisionalDiagnosis": "closing soon",
        },
    )
    assert admission.status_code == 201, admission.text
    admission_id = admission.json()["id"]

    discharge = hospital_c.post(
        "/discharge-summaries", {"admissionId": admission_id, "dischargeType": "routine"}, token=hospital_c.doctor_token
    )
    assert discharge.status_code == 201, discharge.text

    response = hospital_c.post(
        "/nursing-notes",
        {"admissionId": admission_id, "note": "Too late"},
        token=hospital_c.nurse_token,
    )
    assert response.status_code == 409, response.text


def test_nursing_note_admission_id_from_another_tenant_is_refused(hospital_c, hospital_d):
    response = hospital_c.post(
        "/nursing-notes",
        {"admissionId": hospital_d.ids["admission"], "note": "Cross tenant"},
        token=hospital_c.nurse_token,
    )
    assert response.status_code == 404, response.text


def test_nursing_notes_are_tenant_isolated(hospital_c, hospital_d):
    note = hospital_c.post(
        "/nursing-notes",
        {"admissionId": hospital_c.ids["admission"], "note": "hospital_c only"},
        token=hospital_c.nurse_token,
    )
    assert note.status_code == 201, note.text

    listed = hospital_d.get("/nursing-notes", token=hospital_d.nurse_token)
    assert listed.status_code == 200, listed.text
    assert all(n["id"] != note.json()["id"] for n in listed.json())

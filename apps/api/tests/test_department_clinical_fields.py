"""A department records the vitals and clinical notes that fit it.

A cardiology visit has no menstrual history and no LMP; an obstetrics visit
does. The defaults come from the department's specialty, a superadmin can
override them per department, and the API -- not just the form -- refuses a
field the department does not record.
"""

import itertools

import pytest

from tests.conftest import _superadmin_token, unique_date

_times = itertools.count(6 * 60)


def _su(client, tenant):
    return {"Authorization": f"Bearer {_superadmin_token(client)}", "X-Hospital-Id": tenant.id}


def _department(client, tenant, name, specialty="", **extra):
    made = client.post(
        "/departments", json={"name": name, "specialty": specialty, **extra}, headers=_su(client, tenant)
    )
    assert made.status_code == 201, made.text
    return made.json()


def _appointment(tenant, department_id):
    minutes = next(_times)
    made = tenant.post(
        "/appointments",
        {
            "patientId": tenant.ids["patient"],
            "doctorId": tenant.ids["doctor"],
            "departmentId": department_id,
            "date": unique_date(),
            "time": f"{(minutes // 60) % 24:02d}:{minutes % 60:02d}",
            "reason": "fields check",
        },
    )
    assert made.status_code == 201, made.text
    return made.json()["id"]


def _vitals(tenant, appointment_id, **fields):
    return tenant.post(
        "/vitals",
        {"appointmentId": appointment_id, "patientId": tenant.ids["patient"], "doctorId": tenant.ids["doctor"], **fields},
    )


def _note(tenant, appointment_id, **fields):
    # Clinical notes are the doctor's to write (medical_records.manage).
    return tenant.post(
        "/medical-records",
        {"appointmentId": appointment_id, "patientId": tenant.ids["patient"], "doctorId": tenant.ids["doctor"], **fields},
        token=tenant.doctor_token,
    )


@pytest.fixture(scope="module")
def depts(client, hospital_d):
    t = hospital_d
    return {
        "cardio": _department(client, t, "Heart Unit", "cardiology"),
        "obgyn": _department(client, t, "Women's Health", "obstetrics-gynecology"),
        "plain": _department(client, t, "Records Desk"),
    }


def test_the_defaults_follow_the_specialty(depts):
    cardio, obgyn, plain = depts["cardio"], depts["obgyn"], depts["plain"]
    assert "spo2" in cardio["vitalsFields"]
    assert not {"lmp", "edd", "pog", "pregnancy_status"} & set(cardio["vitalsFields"])
    assert not {"menstrual_history", "obstetric_history", "per_vaginum"} & set(cardio["noteFields"])
    assert {"diagnosis", "treatment_advice", "chief_complaint"} <= set(cardio["noteFields"])

    assert {"lmp", "edd", "pog", "pregnancy_status"} <= set(obgyn["vitalsFields"])
    assert {"menstrual_history", "obstetric_history", "per_abdomen"} <= set(obgyn["noteFields"])

    # No specialty yet: everything, exactly as before -- nothing disappears
    # until someone says what the department is.
    assert "lmp" in plain["vitalsFields"] and "menstrual_history" in plain["noteFields"]


def test_the_catalog_is_served(hospital_d):
    response = hospital_d.get("/departments/field-catalog")
    assert response.status_code == 200, response.text
    keys = {f["key"] for f in response.json()["vitals"]}
    assert {"blood_pressure", "spo2", "lmp"} <= keys
    # The assessment fields are never optional, so they are not offered.
    assert "diagnosis" not in {f["key"] for f in response.json()["notes"]}


def test_cardiology_refuses_pregnancy_vitals_but_takes_spo2(hospital_d, depts):
    appointment = _appointment(hospital_d, depts["cardio"]["id"])
    refused = _vitals(hospital_d, appointment, lmp="2026-08-01", pregnancyStatus="pregnant")
    assert refused.status_code == 422, refused.text
    assert "not recorded for Heart Unit" in refused.json()["detail"]
    accepted = _vitals(hospital_d, appointment, heartRate=80, spo2=97, bloodPressure="120/80")
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["spo2"] == 97


def test_cardiology_refuses_obstetric_notes_but_takes_a_diagnosis(hospital_d, depts):
    appointment = _appointment(hospital_d, depts["cardio"]["id"])
    refused = _note(hospital_d, appointment, menstrualHistory="regular")
    assert refused.status_code == 422, refused.text
    accepted = _note(hospital_d, appointment, diagnosis="Hypertension", chiefComplaint="Headache")
    assert accepted.status_code == 201, accepted.text


def test_an_edit_cannot_slip_a_field_in(hospital_d, depts):
    appointment = _appointment(hospital_d, depts["cardio"]["id"])
    note = _note(hospital_d, appointment, diagnosis="x").json()
    assert hospital_d.put(
            f"/medical-records/{note['id']}", {"perVaginum": "normal"}, token=hospital_d.doctor_token
        ).status_code == 422
    vit = _vitals(hospital_d, appointment, heartRate=70).json()
    assert hospital_d.put(f"/vitals/{vit['id']}", {"lmp": "2026-08-01"}).status_code == 422


def test_obstetrics_takes_them(hospital_d, depts):
    appointment = _appointment(hospital_d, depts["obgyn"]["id"])
    assert _vitals(hospital_d, appointment, lmp="2026-08-01", pregnancyStatus="pregnant").status_code == 201
    assert _note(hospital_d, appointment, menstrualHistory="regular", perAbdomen="soft").status_code == 201


def test_an_override_replaces_the_default(client, hospital_d, depts):
    dept = depts["obgyn"]
    changed = client.put(
        f"/departments/{dept['id']}",
        json={"vitalsOverride": ["blood_pressure", "weight"], "notesOverride": ["chief_complaint"]},
        headers=_su(client, hospital_d),
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["vitalsFields"] == ["blood_pressure", "weight"]
    # The assessment fields stay on whatever is ticked.
    assert changed.json()["noteFields"] == ["chief_complaint", "diagnosis", "treatment_advice", "follow_up_advice"]

    appointment = _appointment(hospital_d, dept["id"])
    assert _vitals(hospital_d, appointment, lmp="2026-08-01").status_code == 422
    assert _vitals(hospital_d, appointment, weight=60).status_code == 201

    # null goes back to the specialty's default.
    reset = client.put(
        f"/departments/{dept['id']}",
        json={"vitalsOverride": None, "notesOverride": None},
        headers=_su(client, hospital_d),
    )
    assert "lmp" in reset.json()["vitalsFields"]
    assert reset.json()["vitalsOverride"] is None


def test_an_unknown_field_is_refused(client, hospital_d, depts):
    response = client.put(
        f"/departments/{depts['cardio']['id']}",
        json={"vitalsOverride": ["blood_pressure", "aura"]},
        headers=_su(client, hospital_d),
    )
    assert response.status_code == 422, response.text


def test_admin_cannot_change_them(hospital_d, depts):
    response = hospital_d.put(f"/departments/{depts['cardio']['id']}", {"vitalsOverride": ["weight"]})
    assert response.status_code == 403

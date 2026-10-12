"""Specialty encounters are recorded on a visit, and the department decides the form.

A doctor opens an appointment; the appointment's department has a specialty; the
specialty has a template. Nothing in that chain is typed by the client, and the
department's own doctors -- not the whole hospital -- read each other's visits
and see its patients.

hospital_a (maternity) never has the module on; hospital_c and hospital_d are
multi-specialty, which turns it on through the category template.
"""

import itertools

import pytest

from tests.conftest import PROVISIONED_PASSWORD, _login, _superadmin_token, unique_date

CARDIO = {
    "presentation": {"chief_complaint": "Chest tightness on exertion", "symptoms": ["Chest pain"]},
    "examination": {"heart_rate": 88, "systolic": 142, "diastolic": 90},
    "assessment": {"diagnosis": "Stable angina"},
}

_times = itertools.count(8 * 60)


def _su(client, tenant):
    return {"Authorization": f"Bearer {_superadmin_token(client)}", "X-Hospital-Id": tenant.id}


def _department(client, tenant, name, specialty):
    made = client.post("/departments", json={"name": name, "specialty": specialty}, headers=_su(client, tenant))
    assert made.status_code == 201, made.text
    return made.json()["id"]


def _doctor(client, tenant, email, department_id):
    made = tenant.post(
        "/users",
        {
            "name": f"Dr {email.split('@')[0]}",
            "email": email,
            "password": PROVISIONED_PASSWORD,
            "role": "doctor",
            "departmentId": department_id,
        },
    )
    assert made.status_code == 201, made.text
    doctor_id = next(d["id"] for d in tenant.get("/doctors").json() if d["user"]["email"] == email)
    return doctor_id, _login(client, tenant.id, email)


def _visit(tenant, department_id, doctor_id):
    """A fresh appointment: one record per visit means every test needs its own."""
    minutes = next(_times)
    response = tenant.post(
        "/appointments",
        {
            "patientId": tenant.ids["patient"],
            "doctorId": doctor_id,
            "departmentId": department_id,
            "date": unique_date(),
            "time": f"{(minutes // 60) % 24:02d}:{minutes % 60:02d}",
            "reason": "specialty visit",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.fixture(scope="module")
def world(client, hospital_c):
    """Two cardiologists, a dermatologist, and one cardiology visit with a record."""
    t = hospital_c
    cardio = _department(client, t, "Cardiology Unit", "cardiology")
    derm = _department(client, t, "Skin Clinic", "dermatology")
    ent = _department(client, t, "Ear Nose Throat", "ent")
    cardio_a, token_a = _doctor(client, t, "cardio-a@gamma.test", cardio)
    cardio_b, token_b = _doctor(client, t, "cardio-b@gamma.test", cardio)
    derm_doc, token_d = _doctor(client, t, "derm-a@gamma.test", derm)
    visit = _visit(t, cardio, cardio_a)
    made = t.post("/specialty-encounters", {"appointmentId": visit, "data": CARDIO}, token=token_a)
    assert made.status_code == 201, made.text
    return {
        "t": t, "cardio": cardio, "derm": derm, "ent": ent,
        "a": (cardio_a, token_a), "b": (cardio_b, token_b), "d": (derm_doc, token_d),
        "visit": visit, "encounter": made.json(),
    }


def test_hospital_without_the_module_refuses_everything(hospital_a):
    assert hospital_a.get("/specialty-encounters", token=hospital_a.doctor_token).status_code == 403
    assert hospital_a.get("/specialty-encounters/templates", token=hospital_a.doctor_token).status_code == 403
    made = hospital_a.post(
        "/specialty-encounters",
        {"appointmentId": hospital_a.ids["appointment"], "data": CARDIO},
        token=hospital_a.doctor_token,
    )
    assert made.status_code == 403


def test_templates_are_served_from_the_catalog(world):
    t = world["t"]
    response = t.get("/specialty-encounters/templates", token=world["a"][1])
    assert response.status_code == 200, response.text
    assert {"cardiology", "orthopedics", "dermatology"} <= {x["id"] for x in response.json()}


def test_the_department_decides_the_specialty_and_the_visit_the_patient(world):
    e = world["encounter"]
    assert e["specialty"] == "cardiology"
    assert e["patientId"] == world["t"].ids["patient"]
    assert e["doctorId"] == world["a"][0]
    assert e["appointmentId"] == world["visit"]
    assert e["templateVersion"] == 1
    assert e["patientName"] and e["doctorName"]


def test_a_client_cannot_choose_the_specialty_or_the_author(client, world):
    t = world["t"]
    doctor, token = world["a"]
    visit = _visit(t, world["cardio"], doctor)
    made = t.post(
        "/specialty-encounters",
        {"appointmentId": visit, "specialty": "dermatology", "doctorId": "someone-else", "data": CARDIO},
        token=token,
    )
    assert made.status_code == 201, made.text
    assert made.json()["specialty"] == "cardiology"
    assert made.json()["doctorId"] == doctor


def test_one_record_per_visit(world):
    again = world["t"].post(
        "/specialty-encounters", {"appointmentId": world["visit"], "data": CARDIO}, token=world["a"][1]
    )
    assert again.status_code == 409, again.text


def test_a_department_without_a_usable_specialty_is_refused(client, world):
    t = world["t"]
    doctor, token = world["a"]
    # No form for ENT yet; and a department with no specialty set at all.
    ent_visit = _visit(t, world["ent"], doctor)
    assert t.post("/specialty-encounters", {"appointmentId": ent_visit, "data": {}}, token=token).status_code == 409
    blank = client.post("/departments", json={"name": "Records Room"}, headers=_su(client, t)).json()["id"]
    blank_visit = _visit(t, blank, doctor)
    assert t.post("/specialty-encounters", {"appointmentId": blank_visit, "data": {}}, token=token).status_code == 409


def test_only_the_visits_own_doctor_can_record(world):
    t = world["t"]
    visit = _visit(t, world["cardio"], world["a"][0])
    # A colleague in the same department: a 404, the same as no such visit.
    other = t.post("/specialty-encounters", {"appointmentId": visit, "data": CARDIO}, token=world["b"][1])
    assert other.status_code == 404, other.text


def test_only_a_doctor_can_record(world):
    t = world["t"]
    visit = _visit(t, world["cardio"], world["a"][0])
    assert t.post("/specialty-encounters", {"appointmentId": visit, "data": CARDIO}, token=t.nurse_token).status_code == 403


@pytest.mark.parametrize(
    "data,fragment",
    [
        ({"presentation": {}, "assessment": {"diagnosis": "x"}}, "Chief complaint is required"),
        ({**CARDIO, "bogus": {}}, "Unknown section"),
        ({**CARDIO, "examination": {"heart_rate": 5000}}, "at most"),
        ({**CARDIO, "examination": {"heart_rate": "fast"}}, "must be a number"),
        ({**CARDIO, "examination": {"heart_rate": True}}, "must be a number"),
        ({**CARDIO, "examination": {"nope": 1}}, "Unknown field"),
        ({**CARDIO, "presentation": {**CARDIO["presentation"], "nyha_class": "IX"}}, "must be one of"),
        ({**CARDIO, "assessment": {"diagnosis": "x", "follow_up_date": "tomorrow"}}, "date"),
    ],
)
def test_the_template_decides_what_is_valid(world, data, fragment):
    t = world["t"]
    visit = _visit(t, world["cardio"], world["a"][0])
    response = t.post("/specialty-encounters", {"appointmentId": visit, "data": data}, token=world["a"][1])
    assert response.status_code == 422, response.text
    assert fragment in response.json()["detail"]


def test_blank_answers_are_dropped_not_stored(world):
    t = world["t"]
    visit = _visit(t, world["cardio"], world["a"][0])
    response = t.post(
        "/specialty-encounters",
        {"appointmentId": visit, "data": {**CARDIO, "examination": {"heart_rate": 70, "murmur": "  ", "spo2": None}}},
        token=world["a"][1],
    )
    assert response.status_code == 201, response.text
    assert response.json()["data"]["examination"] == {"heart_rate": 70}


def test_another_hospitals_visit_is_a_404(world, hospital_d):
    made = world["t"].post(
        "/specialty-encounters",
        {"appointmentId": hospital_d.ids["appointment"], "data": CARDIO},
        token=world["a"][1],
    )
    assert made.status_code == 404, made.text


def test_another_hospital_cannot_see_or_open_it(world, hospital_d):
    e = world["encounter"]
    listed = hospital_d.read("/specialty-encounters")
    assert listed.status_code == 200, listed.text
    assert e["id"] not in {x["id"] for x in listed.json()}
    assert hospital_d.get(f"/specialty-encounters/{e['id']}", token=hospital_d.nurse_token).status_code == 404
    assert hospital_d.put(f"/specialty-encounters/{e['id']}", {"data": CARDIO}, token=hospital_d.doctor_token).status_code == 404


def test_the_department_reads_each_others_visits_but_only_the_author_edits(world):
    t, e = world["t"], world["encounter"]
    url = f"/specialty-encounters/{e['id']}"
    # A second cardiologist reads it and sees it listed ...
    assert t.get(url, token=world["b"][1]).status_code == 200
    assert e["id"] in {x["id"] for x in t.get("/specialty-encounters", token=world["b"][1]).json()}
    # ... but cannot change it.
    assert t.put(url, {"data": CARDIO}, token=world["b"][1]).status_code == 404


def test_another_department_does_not_see_it(world):
    t, e = world["t"], world["encounter"]
    token = world["d"][1]
    assert t.get(f"/specialty-encounters/{e['id']}", token=token).status_code == 404
    assert e["id"] not in {x["id"] for x in t.get("/specialty-encounters", token=token).json()}


def test_nurse_reads_all_but_cannot_write(world):
    t, e = world["t"], world["encounter"]
    url = f"/specialty-encounters/{e['id']}"
    assert t.get(url, token=t.nurse_token).status_code == 200
    assert t.put(url, {"data": CARDIO}, token=t.nurse_token).status_code == 403


def test_patient_reads_their_own_record(world):
    t, e = world["t"], world["encounter"]
    token = t.ids["patient_token"]
    listed = t.get("/specialty-encounters", token=token)
    assert listed.status_code == 200, listed.text
    assert e["id"] in {x["id"] for x in listed.json()}
    visit = _visit(t, world["cardio"], world["a"][0])
    assert t.post("/specialty-encounters", {"appointmentId": visit, "data": CARDIO}, token=token).status_code == 403


def test_filtering_by_appointment(world):
    t, e = world["t"], world["encounter"]
    found = t.get(f"/specialty-encounters?appointmentId={world['visit']}", token=world["a"][1]).json()
    assert [x["id"] for x in found] == [e["id"]]


def test_author_can_edit_and_specialty_stays_fixed(world):
    t, e = world["t"], world["encounter"]
    edited = t.put(
        f"/specialty-encounters/{e['id']}",
        {"data": {**CARDIO, "assessment": {"diagnosis": "Unstable angina"}}},
        token=world["a"][1],
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["data"]["assessment"]["diagnosis"] == "Unstable angina"
    assert edited.json()["specialty"] == "cardiology"


def test_my_patients_includes_patients_seen_in_my_department(world):
    """A patient who came to Cardiology is the Cardiology team's patient: the
    second cardiologist never saw them, and still has them in My Patients. The
    dermatologist, whose department the patient never visited, does not."""
    t = world["t"]
    mine = lambda token: {p["id"] for p in t.get("/patients", token=token).json()}
    assert t.ids["patient"] in mine(world["b"][1])
    assert t.ids["patient"] not in mine(world["d"][1])


def test_the_widening_stops_at_the_patient_record(world):
    """Seeing the patient does not hand over a colleague's appointments."""
    t = world["t"]
    colleagues = t.get(f"/appointments?patientId={t.ids['patient']}", token=world["b"][1]).json()
    assert world["visit"] not in {a["id"] for a in colleagues}


def test_delete_is_platform_only(client, world):
    t = world["t"]
    visit = _visit(t, world["cardio"], world["a"][0])
    made = t.post("/specialty-encounters", {"appointmentId": visit, "data": CARDIO}, token=world["a"][1]).json()
    url = f"/specialty-encounters/{made['id']}"
    assert t.delete(url).status_code == 403
    assert t.delete(url, token=world["a"][1]).status_code == 403
    assert t.get(url, token=t.nurse_token).status_code == 200
    assert client.delete(url, headers=_su(client, t)).status_code == 204
    assert t.get(url, token=t.nurse_token).status_code == 404

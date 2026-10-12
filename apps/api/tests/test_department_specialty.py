"""A department carries a specialty, and a doctor's specialty is theirs.

The point of the change: which specialty screens a doctor is offered comes from
a catalog id the server validates, not from a word someone typed. The doctor's
free-text `specialization` survives as an optional sub-specialty and decides
nothing.
"""

import pytest

from app.specialties import SPECIALTY_CATALOG_IDS, SPECIALTY_TEMPLATES, infer_specialty
from tests.conftest import PROVISIONED_PASSWORD, _login, _superadmin_token


def _superadmin(client, hospital_id):
    return {
        "Authorization": f"Bearer {_superadmin_token(client)}",
        "X-Hospital-Id": hospital_id,
    }


def test_every_template_is_a_catalog_specialty():
    assert set(SPECIALTY_TEMPLATES) <= SPECIALTY_CATALOG_IDS


@pytest.mark.parametrize(
    "name,expected",
    [
        ("Cardiology", "cardiology"),
        ("Orthodontics", "dentistry"),  # contains "ortho"; must not read as orthopedics
        ("Orthopedics", "orthopedics"),
        ("ENT", "ent"),
        ("General Dentistry", "dentistry"),  # contains "ent"; not the ENT word
        ("Labor & Delivery", "obstetrics-gynecology"),
        ("Laboratory", ""),  # contains "labor"; not obstetrics
        ("Sample Collection", ""),
    ],
)
def test_the_name_hint(name, expected):
    assert infer_specialty(name) == expected


def test_admin_can_read_the_catalog(hospital_a):
    response = hospital_a.get("/departments/specialties")
    assert response.status_code == 200, response.text
    by_id = {s["id"]: s for s in response.json()}
    assert by_id["cardiology"]["hasTemplate"] is True
    assert by_id["ent"]["hasTemplate"] is False


def test_onboarding_seeds_departments_with_a_specialty(hospital_a):
    departments = {d["name"]: d["specialty"] for d in hospital_a.get("/departments").json()}
    assert departments["Obstetrics & Gynecology"] == "obstetrics-gynecology"
    assert departments["Neonatology"] == "neonatology"


def test_creating_a_department_guesses_when_not_told(client, hospital_a):
    made = client.post("/departments", json={"name": "Heart Clinic"}, headers=_superadmin(client, hospital_a.id))
    assert made.status_code == 201, made.text
    assert made.json()["specialty"] == "cardiology"


def test_an_unknown_specialty_is_refused(client, hospital_a):
    headers = _superadmin(client, hospital_a.id)
    assert client.post("/departments", json={"name": "X", "specialty": "astrology"}, headers=headers).status_code == 422
    dept = hospital_a.get("/departments").json()[0]
    assert client.put(f"/departments/{dept['id']}", json={"specialty": "astrology"}, headers=headers).status_code == 422


def test_admin_still_cannot_set_it(hospital_a):
    dept = hospital_a.get("/departments").json()[0]
    assert hospital_a.put(f"/departments/{dept['id']}", json={"specialty": "ent"}).status_code == 403


def test_a_doctors_specialty_follows_their_department(client, hospital_d):
    headers = _superadmin(client, hospital_d.id)
    cardio = client.post("/departments", json={"name": "Cardiac Care Unit", "specialty": "cardiology"}, headers=headers).json()
    other = client.post("/departments", json={"name": "Skin Clinic", "specialty": "dermatology"}, headers=headers).json()

    made = hospital_d.post(
        "/users",
        {
            "name": "Dr Follows Dept",
            "email": "follows@delta.test",
            "password": PROVISIONED_PASSWORD,
            "role": "doctor",
            "departmentId": cardio["id"],
            "specialization": "Interventional Cardiology",
        },
    )
    assert made.status_code == 201, made.text
    doctor = next(d for d in hospital_d.get("/doctors").json() if d["user"]["email"] == "follows@delta.test")
    assert doctor["specialty"] == "cardiology"
    assert doctor["specialtyLabel"] == "Cardiology"
    # The typed text is kept as a sub-specialty and decides nothing.
    assert doctor["specialization"] == "Interventional Cardiology"

    # Move the doctor: the specialty moves with the department.
    moved = hospital_d.put(f"/doctors/{doctor['id']}", {"departmentId": other["id"]})
    assert moved.status_code == 200, moved.text
    assert moved.json()["specialty"] == "dermatology"


def test_a_client_cannot_assert_a_doctors_specialty(hospital_d):
    doctor = hospital_d.get("/doctors").json()[0]
    before = doctor["specialty"]
    hospital_d.put(f"/doctors/{doctor['id']}", {"specialty": "oncology"})
    after = next(d for d in hospital_d.get("/doctors").json() if d["id"] == doctor["id"])
    assert after["specialty"] == before

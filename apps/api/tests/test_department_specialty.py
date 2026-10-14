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
        ("Cardiac Rehab", "cardiology"),
        ("Bone & Joint Clinic", "orthopedics"),
        ("Kidney Care", "nephrology"),
        ("Ear Nose Throat", "ent"),
        ("Newborn Unit", "neonatology"),
        ("Antenatal Clinic", "obstetrics-gynecology"),
        ("Thyroid Clinic", "endocrinology"),
    ],
)
def test_the_name_hint(name, expected):
    assert infer_specialty(name) == expected


def test_admin_can_read_the_catalog(hospital_a):
    response = hospital_a.get("/departments/specialties")
    assert response.status_code == 200, response.text
    by_id = {s["id"]: s for s in response.json()}
    assert by_id["cardiology"]["hasTemplate"] is True
    assert by_id["urology"]["hasTemplate"] is False


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


def test_every_visit_form_is_well_formed():
    """A template is hand-written clinical content; the mistakes it can hide are
    structural, so check the structure for all of them at once."""
    from app.specialties import FIELD_TYPES

    for template in SPECIALTY_TEMPLATES.values():
        assert template["label"] and template["version"] >= 1
        # Ends in the assessment, with a required diagnosis.
        last = template["sections"][-1]
        assert last["key"] == "assessment", template["id"]
        assert any(f["key"] == "diagnosis" and f.get("required") for f in last["fields"]), template["id"]

        section_keys = [s["key"] for s in template["sections"]]
        assert len(section_keys) == len(set(section_keys)), template["id"]
        for section in template["sections"]:
            keys = [f["key"] for f in section["fields"]]
            assert len(keys) == len(set(keys)), (template["id"], section["key"])
            for field in section["fields"]:
                assert field["type"] in FIELD_TYPES, (template["id"], field["key"])
                if field["type"] in ("select", "multiselect"):
                    assert field.get("options"), (template["id"], field["key"])
                if field["type"] == "number" and "min" in field and "max" in field:
                    assert field["min"] < field["max"], (template["id"], field["key"])


def test_the_catalog_reports_which_specialties_have_a_form(hospital_a):
    by_id = {s["id"]: s["hasTemplate"] for s in hospital_a.get("/departments/specialties").json()}
    assert all(by_id[i] for i in SPECIALTY_TEMPLATES)
    assert not by_id["urology"]


def test_the_wizard_gets_the_catalog_and_a_specialty_per_suggestion(client):
    """The onboarding step runs before any tenant exists, so the dropdown's
    options and each suggestion's specialty arrive with the wizard's metadata."""
    response = client.get(
        "/hospitals/meta/onboarding",
        params={"category": "maternity"},
        headers={"Authorization": f"Bearer {_superadmin_token(client)}"},
    )
    assert response.status_code == 200, response.text
    meta = response.json()
    assert {s["id"] for s in meta["specialties"]} == SPECIALTY_CATALOG_IDS
    by_name = {d["name"]: d["specialty"] for d in meta["suggestedDepartments"]}
    assert by_name["Neonatology"] == "neonatology"
    assert by_name["Obstetrics & Gynecology"] == "obstetrics-gynecology"


def test_a_wizard_department_keeps_the_specialty_it_was_given(client):
    made = client.post(
        "/hospitals",
        headers={"Authorization": f"Bearer {_superadmin_token(client)}"},
        json={
            "name": "Specialty Seed Clinic",
            "subdomain": "seedclinic",
            "category": "multi-specialty",
            "adminName": "Seed Admin",
            "adminEmail": "admin@seedclinic.test",
            "adminPassword": "Passw0rd!test",
            "departments": [
                {"name": "Heart Wing", "specialty": "cardiology"},
                {"name": "Wellness Hub"},  # no specialty, no hint in the name
                {"name": "Cardiac Rehab"},  # no specialty given: guessed from the name
            ],
        },
    )
    assert made.status_code == 201, made.text
    hospital_id = made.json().get("hospital", made.json())["id"]
    listed = client.get(
        "/departments",
        headers={"Authorization": f"Bearer {_superadmin_token(client)}", "X-Hospital-Id": hospital_id},
    ).json()
    by_name = {d["name"]: d["specialty"] for d in listed}
    assert by_name == {"Heart Wing": "cardiology", "Wellness Hub": "", "Cardiac Rehab": "cardiology"}

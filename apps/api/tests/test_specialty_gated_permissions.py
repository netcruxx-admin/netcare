"""Antenatal and newborn care belong to the doctors who do that care.

`pregnancies.*` and `babies.*` carry a `requires_specialties` list: a doctor
holds the permission only if their department practises one of them. It is a
rule on the permission, so it is the API that refuses -- and the sidebar, which
is built from the same resolved permissions, drops the entry for free.

Not narrowed: anyone with no doctor record (a nurse, an admin), and a doctor
whose department has no specialty set yet -- the permission was theirs before
departments said what they were.

A maternity hospital of its own (so `anc` is on, and the doctors added here
do not disturb tests that read the shared fixtures' first doctor).
"""

import pytest

from tests.conftest import PROVISIONED_PASSWORD, _build_tenant, _login, _superadmin_token, unique_date


def _su(client, tenant):
    return {"Authorization": f"Bearer {_superadmin_token(client)}", "X-Hospital-Id": tenant.id}


def _doctor_in(client, tenant, email, department_id):
    made = tenant.post(
        "/users",
        {
            "name": f"Dr {email.split('@')[0]}",
            "email": email,
            "password": PROVISIONED_PASSWORD,
            "role": "doctor",
            **({"departmentId": department_id} if department_id else {}),
        },
    )
    assert made.status_code == 201, made.text
    return _login(client, tenant.id, email)


@pytest.fixture(scope="module")
def maternity(client, database):
    return _build_tenant(client, "Gate Maternity", "gate", "maternity")


@pytest.fixture(scope="module")
def staff(client, maternity):
    t = maternity
    dept = lambda name, spec: client.post(
        "/departments", json={"name": name, "specialty": spec}, headers=_su(client, t)
    ).json()["id"]
    return {
        "cardio": _doctor_in(client, t, "heart@gate.test", dept("Heart Care", "cardiology")),
        "obgyn": _doctor_in(client, t, "ob@gate.test", dept("Antenatal Clinic", "obstetrics-gynecology")),
        "peds": _doctor_in(client, t, "kids@gate.test", dept("Child Health", "pediatrics")),
        "unset": _doctor_in(client, t, "unsorted@gate.test", dept("Front Desk Clinic", "")),
        "nodept": _doctor_in(client, t, "floating@gate.test", None),
    }


def _codes(client, tenant, token):
    me = client.get("/auth/me", headers=tenant.headers(token))
    assert me.status_code == 200, me.text
    return {p["code"] for p in me.json()["permissions"]}


def test_a_cardiologist_has_neither(client, maternity, staff):
    t = maternity
    assert t.get("/pregnancies", token=staff["cardio"]).status_code == 403
    assert t.get("/babies", token=staff["cardio"]).status_code == 403
    codes = _codes(client, t, staff["cardio"])
    assert not {"pregnancies.read", "pregnancies.manage", "babies.read", "babies.manage"} & codes


def test_the_session_matches_the_api(client, maternity, staff):
    """The menu is built from these, so what the API refuses is not offered."""
    t = maternity
    assert {"pregnancies.read", "pregnancies.manage"} <= _codes(client, t, staff["obgyn"])
    assert not {"babies.read", "babies.manage"} & _codes(client, t, staff["obgyn"])
    assert {"babies.read", "babies.manage"} <= _codes(client, t, staff["peds"])
    assert not {"pregnancies.read"} & _codes(client, t, staff["peds"])


def test_an_obstetrician_reads_pregnancies_and_a_paediatrician_babies(maternity, staff):
    t = maternity
    assert t.get("/pregnancies", token=staff["obgyn"]).status_code == 200
    assert t.get("/babies", token=staff["obgyn"]).status_code == 403
    assert t.get("/babies", token=staff["peds"]).status_code == 200
    assert t.get("/pregnancies", token=staff["peds"]).status_code == 403


def test_a_cardiologist_cannot_write_either(maternity, staff):
    t = maternity
    body = {"patientId": t.ids["patient"], "lmp": "2026-08-01", "edd": "2027-05-08"}
    assert t.post("/pregnancies", body, token=staff["cardio"]).status_code == 403
    assert t.post("/pregnancies", body, token=staff["obgyn"]).status_code == 201


@pytest.mark.parametrize("who", ["unset", "nodept"])
def test_a_doctor_with_no_specialty_yet_keeps_both(maternity, staff, who):
    """Nothing is taken away until the department says what it is."""
    t = maternity
    assert t.get("/pregnancies", token=staff[who]).status_code == 200
    assert t.get("/babies", token=staff[who]).status_code == 200


def test_staff_without_a_doctor_record_are_not_narrowed(maternity):
    t = maternity
    assert t.get("/pregnancies", token=t.nurse_token).status_code == 200
    assert t.get("/babies", token=t.nurse_token).status_code == 200


def test_the_patient_chart_stops_carrying_pregnancy_for_a_cardiologist(client, maternity, staff):
    """The chart adds `activePregnancy` only for callers who hold pregnancies.read."""
    t = maternity
    # Make the patient both departments' patients, so each doctor can open the
    # chart at all -- what is under test is what it carries.
    for name in ("Heart Care", "Antenatal Clinic"):
        department = next(d["id"] for d in t.get("/departments").json() if d["name"] == name)
        booked = t.post(
            "/appointments",
            {
                "patientId": t.ids["patient"],
                "doctorId": t.ids["doctor"],
                "departmentId": department,
                "date": unique_date(),
                "time": "09:30",
                "reason": "review",
            },
        )
        assert booked.status_code == 201, booked.text
    t.post(
        "/pregnancies",
        {"patientId": t.ids["patient"], "lmp": "2026-08-01", "edd": "2027-05-08"},
        token=staff["obgyn"],
    )
    obgyn = t.get(f"/patients/{t.ids['patient']}", token=staff["obgyn"])
    cardio = t.get(f"/patients/{t.ids['patient']}", token=staff["cardio"])
    assert obgyn.status_code == 200 and cardio.status_code == 200
    assert obgyn.json().get("activePregnancy")
    assert not cardio.json().get("activePregnancy")

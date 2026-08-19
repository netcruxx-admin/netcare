"""Which departments a new tenant starts with.

The category template is a *suggestion*. "Maternity" genuinely implies obstetrics
and a labour ward; "multi-specialty" implies almost nothing, and seeding six
specialities a hospital does not run leaves reception able to book a patient into
a department with no doctors in it.

So an explicit list wins, and omitting the field keeps the old behaviour exactly
— which is what lets the existing fixtures, the seeder and any older client go on
working untouched.
"""

import uuid

import pytest

from conftest import _superadmin_token


def _onboard(client, payload_extra: dict, category: str = "multi-specialty"):
    """Onboard a throwaway hospital. Returns the response, unwrapped by caller."""
    su = _superadmin_token(client)
    slug = f"dept{uuid.uuid4().hex[:8]}"
    body = {
        "name": f"Dept Test {slug}",
        "subdomain": slug,
        "category": category,
        "adminName": "Dept Admin",
        "adminEmail": f"admin@{slug}.test",
        "adminPassword": "Passw0rd!test",
        **payload_extra,
    }
    return client.post(
        "/hospitals", headers={"Authorization": f"Bearer {su}"}, json=body
    ), slug


def _department_names(client, hospital_id: str, slug: str) -> set[str]:
    login = client.post(
        "/auth/login",
        headers={"X-Hospital-Id": hospital_id},
        json={"email": f"admin@{slug}.test", "password": "Passw0rd!test"},
    )
    assert login.status_code == 200, login.text
    rows = client.get(
        "/departments",
        headers={
            "Authorization": f"Bearer {login.json()['token']}",
            "X-Hospital-Id": hospital_id,
        },
    ).json()
    return {row["name"] for row in rows}


def test_omitting_departments_seeds_the_category_template(client, database):
    """The old behaviour, unchanged. Every existing caller depends on this."""
    response, slug = _onboard(client, {}, category="maternity")
    assert response.status_code == 201, response.text
    hospital = response.json()["hospital"]

    names = _department_names(client, hospital["id"], slug)
    assert "Obstetrics & Gynecology" in names
    assert "Labor & Delivery" in names
    assert len(names) == 5, f"maternity template should seed 5 departments, got {names}"


def test_explicit_departments_replace_the_template(client, database):
    """A multi-specialty hospital naming only what it actually runs.

    The template's six specialities must not survive alongside the three given —
    a department nobody staffs is still bookable, which is the bug this fixes.
    """
    response, slug = _onboard(
        client,
        {
            "departments": [
                {"name": "Cardiology", "description": "Heart and vascular"},
                {"name": "Orthopedics"},
                {"name": "Fertility & IVF", "description": "Assisted reproduction"},
            ]
        },
    )
    assert response.status_code == 201, response.text
    hospital = response.json()["hospital"]

    names = _department_names(client, hospital["id"], slug)
    assert names == {"Cardiology", "Orthopedics", "Fertility & IVF"}
    assert "General Medicine" not in names, "template leaked in alongside the explicit list"


def test_a_custom_department_no_template_knows_about_is_accepted(client, database):
    """No catalog to validate against, by design.

    A hospital should not have to wait for us to have heard of a speciality
    before it can have one.
    """
    response, slug = _onboard(
        client, {"departments": [{"name": "Hepatobiliary & Pancreatic Surgery"}]}
    )
    assert response.status_code == 201, response.text
    names = _department_names(client, response.json()["hospital"]["id"], slug)
    assert names == {"Hepatobiliary & Pancreatic Surgery"}


def test_empty_department_list_is_refused(client, database):
    """A hospital with no departments cannot take a booking at all.

    Refused rather than silently falling back to the template: the caller meant
    something by sending [], and guessing which something is worse than saying
    no.
    """
    response, _ = _onboard(client, {"departments": []})
    assert response.status_code == 422, response.text
    assert "department" in response.text.lower()


def test_blank_names_do_not_count_as_departments(client, database):
    """A list of whitespace is an empty list wearing a hat."""
    response, _ = _onboard(client, {"departments": [{"name": "   "}, {"name": ""}]})
    assert response.status_code == 422, response.text


def test_duplicate_departments_are_refused(client, database):
    """Case-insensitively — there is no unique constraint to catch this later."""
    response, _ = _onboard(
        client,
        {"departments": [{"name": "Cardiology"}, {"name": "cardiology"}]},
    )
    assert response.status_code == 422, response.text
    assert "duplicate" in response.text.lower()


def test_department_names_are_trimmed(client, database):
    """Leading space is invisible in the UI and breaks sorting and matching."""
    response, slug = _onboard(client, {"departments": [{"name": "  Neurology  "}]})
    assert response.status_code == 201, response.text
    names = _department_names(client, response.json()["hospital"]["id"], slug)
    assert names == {"Neurology"}


def test_onboarding_meta_suggests_the_categorys_departments(client, database):
    """The wizard pre-ticks from here rather than restating the template in TS.

    One copy of the rule, for the same reason the licence list is served: a
    second copy drifts the first time one side changes.
    """
    su = _superadmin_token(client)
    headers = {"Authorization": f"Bearer {su}"}

    meta = client.get("/hospitals/meta/onboarding?category=maternity", headers=headers)
    assert meta.status_code == 200, meta.text
    names = {d["name"] for d in meta.json()["suggestedDepartments"]}
    assert "Obstetrics & Gynecology" in names

    other = client.get(
        "/hospitals/meta/onboarding?category=multi-specialty", headers=headers
    )
    other_names = {d["name"] for d in other.json()["suggestedDepartments"]}
    assert "Cardiology" in other_names
    assert names != other_names, "every category suggested the same departments"

    # Without a category there is nothing to suggest, so the wizard shows no
    # pre-ticked list rather than an arbitrary one.
    none = client.get("/hospitals/meta/onboarding", headers=headers)
    assert none.json()["suggestedDepartments"] == []

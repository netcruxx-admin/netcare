"""Hospital Setup belongs to the platform, not to a hospital admin.

The screen picks a category template and replaces a hospital's entire
department list. Both are provisioning decisions, and the second is destructive
against departments that already have appointments booked into them — so
`hospital.settings.manage` sits with superadmin.

Pinned as a test because the grant lives in data, not code: a migration moved it
and nothing in the source would stop the next one moving it back.
"""

from tests.conftest import _superadmin_token

PERMISSION = "hospital.settings.manage"


def _codes(client, token, hospital_id=None):
    headers = {"Authorization": f"Bearer {token}"}
    if hospital_id:
        headers["X-Hospital-Id"] = hospital_id
    response = client.get("/auth/me", headers=headers)
    assert response.status_code == 200, response.text
    return {grant["code"] for grant in response.json()["permissions"]}


def test_hospital_admin_cannot_manage_hospital_settings(client, hospital_a):
    assert PERMISSION not in _codes(client, hospital_a.token, hospital_a.id)


def test_superadmin_can(client):
    assert PERMISSION in _codes(client, _superadmin_token(client))


def test_admin_keeps_reading_the_departments_they_book_into(client, hospital_a):
    """Read stayed behind when `departments.manage` followed this one out.

    Department CRUD moved to the platform in d7a2c5f81e64, but the *list* is
    read by the admin overview, the appointments board and both doctor modals —
    and those modals write `department_id`. See
    test_departments_are_platform_only.py for the writes.
    """
    held = _codes(client, hospital_a.token, hospital_a.id)
    assert "departments.read" in held
    assert "departments.manage" not in held


def test_admin_cannot_be_the_one_who_wipes_departments(client, hospital_a):
    """The route table is not the guarantee — this is.

    A hospital admin reaching /dashboard/setup by URL must not find the
    capability behind it waiting for them.
    """
    assert PERMISSION not in _codes(client, hospital_a.token, hospital_a.id)
    assert PERMISSION in _codes(client, _superadmin_token(client))

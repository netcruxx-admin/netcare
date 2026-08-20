"""Creating, renaming and deleting a department is the platform's job.

Departments are the spine of booking — appointments are filed into them and
doctors belong to them — so editing one on a live tenant reaches records that
already point at it.

Written as real requests rather than as grant lookups: hiding the screen in the
route table proves nothing, because the URL is still typeable and the API is
still listening. What matters is that the endpoint says no.
"""

from tests.conftest import _superadmin_token


def _superadmin(client, hospital_id):
    return {
        "Authorization": f"Bearer {_superadmin_token(client)}",
        "X-Hospital-Id": hospital_id,
    }


def test_admin_cannot_create_a_department(hospital_a):
    response = hospital_a.post("/departments", json={"name": "Admin Made This"})
    assert response.status_code == 403, response.text


def test_admin_cannot_rename_a_department(client, hospital_a):
    existing = hospital_a.get("/departments").json()
    assert existing, "fixture hospital should have departments"
    response = hospital_a.put(
        f"/departments/{existing[0]['id']}", json={"name": "Renamed By Admin"}
    )
    assert response.status_code == 403, response.text


def test_admin_cannot_delete_a_department(hospital_a):
    existing = hospital_a.get("/departments").json()
    response = hospital_a.delete(f"/departments/{existing[0]['id']}")
    assert response.status_code == 403, response.text


def test_admin_can_still_read_the_department_list(hospital_a):
    """The list is not the screen.

    The admin overview, the appointments board and both doctor modals read this
    — and the doctor modals write `department_id` from it. Revoking read to hide
    one screen would have broken creating a doctor.
    """
    response = hospital_a.get("/departments")
    assert response.status_code == 200, response.text
    assert response.json(), "an admin must still see the departments they book into"


def test_superadmin_can_run_the_full_cycle(client, hospital_a):
    headers = _superadmin(client, hospital_a.id)

    created = client.post(
        "/departments", json={"name": "Platform Made This"}, headers=headers
    )
    assert created.status_code == 201, created.text
    department_id = created.json()["id"]

    renamed = client.put(
        f"/departments/{department_id}", json={"name": "Platform Renamed"}, headers=headers
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["name"] == "Platform Renamed"

    removed = client.delete(f"/departments/{department_id}", headers=headers)
    assert removed.status_code == 204, removed.text


def test_the_refusal_does_not_leak_across_tenants(client, hospital_a, hospital_b):
    """A department of B's, refused to A's admin, must still 404 rather than 403.

    Otherwise the refusal itself confirms the id exists in another hospital.
    """
    b_departments = client.get(
        "/departments", headers=_superadmin(client, hospital_b.id)
    ).json()
    assert b_departments

    response = hospital_a.put(
        f"/departments/{b_departments[0]['id']}", json={"name": "Reaching Across"}
    )
    assert response.status_code in (403, 404), response.text

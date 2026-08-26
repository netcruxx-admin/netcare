"""Deleting a record is the platform's job, not a hospital's.

Deletion used to ride on each module's `*.manage` grant, so "let an admin add a
doctor" and "let an admin erase a doctor" were the same decision. Since
x9y0z1a2b3c4 the destructive half is its own permission, held by superadmin
alone.

Written as real requests rather than as grant lookups: hiding the button proves
nothing, because the URL is still typeable and the API is still listening. What
matters is that the endpoint says no.

The complement matters as much as the refusal — an admin must keep *creating
and editing*, or this would have quietly taken away half the job.
"""

import pytest

from tests.conftest import _superadmin_token


def _superadmin(client, hospital_id):
    return {
        "Authorization": f"Bearer {_superadmin_token(client)}",
        "X-Hospital-Id": hospital_id,
    }


@pytest.mark.parametrize(
    "path,key",
    [
        ("/patients", "patient"),
        ("/appointments", "appointment"),
        ("/prescriptions", "prescription"),
    ],
)
def test_admin_cannot_delete(hospital_a, path, key):
    response = hospital_a.delete(f"{path}/{hospital_a.ids[key]}")
    assert response.status_code == 403, response.text


@pytest.mark.parametrize(
    "path,key",
    [
        ("/patients", "patient"),
        ("/appointments", "appointment"),
    ],
)
def test_the_row_is_still_there_after_a_refused_delete(hospital_a, path, key):
    """A 403 must mean nothing happened, not that it half-happened."""
    hospital_a.delete(f"{path}/{hospital_a.ids[key]}")
    rows = hospital_a.read(path).json()
    assert hospital_a.ids[key] in {row["id"] for row in rows}


def test_admin_can_still_edit_a_patient(hospital_a):
    """Splitting delete out must not have cost the admin the rest of the job.

    Edit is the half that stayed: `patients.manage` still covers it, and the
    same admin that is refused a delete above must get a 200 here.
    """
    edited = hospital_a.put(
        f"/patients/{hospital_a.ids['patient']}", {"bloodGroup": "O-"}
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["bloodGroup"] == "O-"


def test_superadmin_can_delete(client, hospital_a):
    """The capability did not just move out of reach — someone still holds it.

    Deletes a throwaway appointment rather than the fixture's: the tenant
    fixtures are session-scoped, so erasing a shared row here would surface as
    an unrelated failure in whichever test happens to run next.
    """
    made = hospital_a.post(
        "/appointments",
        {
            "patientId": hospital_a.ids["patient"],
            "doctorId": hospital_a.ids["doctor"],
            "departmentId": hospital_a.ids["department"],
            "date": "2026-09-02",
            "time": "11:30",
            "reason": "throwaway for the delete test",
        },
    )
    assert made.status_code == 201, made.text
    target = made.json()["id"]

    headers = _superadmin(client, hospital_a.id)
    removed = client.delete(f"/appointments/{target}", headers=headers)
    assert removed.status_code == 204, removed.text

    remaining = hospital_a.read("/appointments").json()
    assert target not in {row["id"] for row in remaining}

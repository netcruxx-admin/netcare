"""Deleting wards, beds and admissions is a platform capability too — the same
split x9y0z1a2b3c4 (delete_is_platform_only.py) drew for every other resource,
extended to the three this module adds. See migration d82b1ad42845.

Written as real requests, not grant lookups, for the same reason the original
file is: hiding the delete button proves nothing when the URL is still
typeable and the API is still listening.
"""

import pytest

from tests.conftest import _superadmin_token
from app.utils import new_id


def _superadmin(client, hospital_id):
    return {
        "Authorization": f"Bearer {_superadmin_token(client)}",
        "X-Hospital-Id": hospital_id,
    }


@pytest.fixture(scope="module")
def spare_ward_and_bed(hospital_c):
    """A ward/bed neither occupied nor otherwise entangled with another test —
    isolates "admin lacks the permission" from "the bed is occupied", which
    beds.py also refuses, for a different reason."""
    ward = hospital_c.post("/wards", {"name": f"Delete-only ward {new_id('w')}", "wardType": "general"})
    assert ward.status_code == 201, ward.text
    bed = hospital_c.post(
        "/beds", {"wardId": ward.json()["id"], "bedNumber": "DO-1", "dailyRate": 500}
    )
    assert bed.status_code == 201, bed.text
    return ward.json()["id"], bed.json()["id"]


def test_admin_cannot_delete_a_ward(hospital_c, spare_ward_and_bed):
    ward_id, _ = spare_ward_and_bed
    response = hospital_c.delete(f"/wards/{ward_id}")
    assert response.status_code == 403, response.text


def test_admin_cannot_delete_a_bed(hospital_c, spare_ward_and_bed):
    _, bed_id = spare_ward_and_bed
    response = hospital_c.delete(f"/beds/{bed_id}")
    assert response.status_code == 403, response.text


def test_admin_cannot_delete_an_admission(hospital_c):
    response = hospital_c.delete(f"/admissions/{hospital_c.ids['admission']}")
    assert response.status_code == 403, response.text


def test_the_rows_are_still_there_after_refused_deletes(hospital_c, spare_ward_and_bed):
    ward_id, bed_id = spare_ward_and_bed
    hospital_c.delete(f"/wards/{ward_id}")
    hospital_c.delete(f"/beds/{bed_id}")
    hospital_c.delete(f"/admissions/{hospital_c.ids['admission']}")

    wards = hospital_c.read("/wards").json()
    assert ward_id in {w["id"] for w in wards}
    beds = hospital_c.read("/beds").json()
    assert bed_id in {b["id"] for b in beds}
    admissions = hospital_c.read("/admissions").json()
    assert hospital_c.ids["admission"] in {a["id"] for a in admissions}


def test_admin_can_still_edit_a_ward(hospital_c, spare_ward_and_bed):
    """Splitting delete out must not have cost the admin the rest of the job —
    wards.manage still covers create and edit."""
    ward_id, _ = spare_ward_and_bed
    response = hospital_c.put(f"/wards/{ward_id}", {"floor": "3rd Floor"})
    assert response.status_code == 200, response.text
    assert response.json()["floor"] == "3rd Floor"


def test_superadmin_can_delete_a_ward(client, hospital_c):
    """The complement: the platform itself is not blocked by the same gate."""
    ward = hospital_c.post("/wards", {"name": f"Throwaway {new_id('w')}", "wardType": "general"})
    assert ward.status_code == 201, ward.text
    ward_id = ward.json()["id"]

    response = client.delete(f"/wards/{ward_id}", headers=_superadmin(client, hospital_c.id))
    assert response.status_code == 204, response.text

    wards = hospital_c.read("/wards").json()
    assert ward_id not in {w["id"] for w in wards}

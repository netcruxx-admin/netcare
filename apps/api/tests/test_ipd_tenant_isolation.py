"""IPD's own tables get the same two-hospital isolation coverage every other
table has (see test_tenant_isolation.py's module docstring for why a single
tenant can never surface this class of bug).

Uses hospital_c/hospital_d rather than hospital_a/hospital_b: those two exist
specifically to prove ordinary OPD behavior with the ipd module off (see
test_ipd_module_gating.py and test_ipd_does_not_affect_opd_vitals.py), and
mixing that concern into these tests would blur what each is protecting.
"""

import pytest

from tests.conftest import _superadmin_token

# (collection path, the key in Tenant.ids holding a row id in that collection)
COLLECTIONS = [
    ("/wards", "ward"),
    ("/beds", "bed"),
    ("/admissions", "admission"),
]


@pytest.mark.parametrize("path,key", COLLECTIONS)
def test_collection_returns_only_own_tenant(hospital_c, hospital_d, path, key):
    c_rows = hospital_c.read(path).json()
    d_rows = hospital_d.read(path).json()
    assert c_rows and d_rows, f"{path} fixture produced nothing to compare"

    c_ids = {row["id"] for row in c_rows}
    d_ids = {row["id"] for row in d_rows}

    assert hospital_c.ids[key] in c_ids
    assert hospital_d.ids[key] in d_ids
    assert not (c_ids & d_ids), f"{path} leaked rows across tenants: {c_ids & d_ids}"


def test_admission_detail_of_other_tenant_is_404(hospital_c, hospital_d):
    response = hospital_c.read(f"/admissions/{hospital_d.ids['admission']}")
    assert response.status_code == 404, response.text


def test_cannot_modify_other_tenants_ward(client, hospital_c, hospital_d):
    response = hospital_c.put(f"/wards/{hospital_d.ids['ward']}", {"name": "tampered"})
    assert response.status_code in (403, 404, 405, 422), response.text

    su = {
        "Authorization": f"Bearer {_superadmin_token(client)}",
        "X-Hospital-Id": hospital_c.id,
    }
    assert client.delete(f"/wards/{hospital_d.ids['ward']}", headers=su).status_code in (404, 405)

    still_there = hospital_d.read("/wards").json()
    assert hospital_d.ids["ward"] in {row["id"] for row in still_there}


def test_cannot_modify_other_tenants_bed(client, hospital_c, hospital_d):
    response = hospital_c.put(f"/beds/{hospital_d.ids['bed']}", {"bedNumber": "tampered"})
    assert response.status_code in (403, 404, 405, 422), response.text

    su = {
        "Authorization": f"Bearer {_superadmin_token(client)}",
        "X-Hospital-Id": hospital_c.id,
    }
    assert client.delete(f"/beds/{hospital_d.ids['bed']}", headers=su).status_code in (404, 405)

    still_there = hospital_d.read("/beds").json()
    assert hospital_d.ids["bed"] in {row["id"] for row in still_there}


def test_cannot_transfer_other_tenants_admission(hospital_c, hospital_d):
    """The transfer endpoint takes both an admission id in the path and a bed
    id in the body — either one naming another tenant's row must refuse."""
    response = hospital_c.post(
        f"/admissions/{hospital_d.ids['admission']}/transfer",
        {"bedId": hospital_c.ids["bed"]},
    )
    assert response.status_code in (403, 404), response.text


def test_progress_notes_filter_does_not_cross_tenants(hospital_c, hospital_d):
    """Asking for another tenant's admission_id must narrow to nothing, not
    reach across — the same rule test_tenant_isolation.py checks for patientId."""
    rows = hospital_c.read(f"/progress-notes?admissionId={hospital_d.ids['admission']}").json()
    assert rows == [], f"progress-notes honoured a foreign admissionId and returned {rows}"


def test_discharge_summaries_are_tenant_scoped(hospital_c, hospital_d):
    """Discharging here would lock the shared session-scoped admission that
    other test files still need "admitted" — so this only checks that asking
    for another tenant's admission_id turns up nothing, never actually
    discharges anyone. See test_admission_locked_after_discharge.py for the
    discharge flow itself, which uses its own throwaway admission."""
    rows = hospital_c.get(
        f"/discharge-summaries?admissionId={hospital_d.ids['admission']}"
    ).json()
    assert rows == [], f"discharge-summaries honoured a foreign admissionId and returned {rows}"


def test_billing_of_other_tenants_admission_is_refused(hospital_c, hospital_d):
    response = hospital_c.get(f"/admissions/{hospital_d.ids['admission']}/bill")
    assert response.status_code == 404, response.text

    response = hospital_c.get(f"/admissions/{hospital_d.ids['admission']}/charge-items")
    assert response.status_code == 404, response.text

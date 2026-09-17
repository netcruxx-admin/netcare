"""A hospital without the `ipd` module sees zero behavior change from this
module, no matter what its role_permissions say — this is the test that
proves docs/IPD_MODULE_CHANGELOG.md §1's central safety claim in code, not
just in prose.

hospital_a never has `ipd` turned on (see conftest.py — only hospital_c/d do,
deliberately), so its admin holds the exact same global `admin` role grants
(wards.manage, beds.read, admissions.create, ...) as hospital_c's admin. The
only difference between them is the module flag. If these tests pass, the
difference in behavior is provably the module, not a role or a permission
that happens to differ between the two fixtures.

Not tested here: a platform superadmin bypasses module gating for every
module, not just this one (app/authz.py's effective_permissions never applies
the module mask to a platform user) — that is existing, intentional platform
behavior predating this module, not something to assert against here.
"""


def test_hospital_without_ipd_refuses_list_wards(hospital_a):
    response = hospital_a.get("/wards")
    assert response.status_code == 403, response.text


def test_hospital_without_ipd_refuses_list_beds(hospital_a):
    response = hospital_a.get("/beds")
    assert response.status_code == 403, response.text


def test_hospital_without_ipd_refuses_list_admissions(hospital_a):
    response = hospital_a.get("/admissions")
    assert response.status_code == 403, response.text


def test_hospital_without_ipd_refuses_creating_a_ward(hospital_a):
    response = hospital_a.post("/wards", {"name": "Should not exist", "wardType": "general"})
    assert response.status_code == 403, response.text


def test_hospital_without_ipd_refuses_admitting_a_patient(hospital_a):
    response = hospital_a.post(
        "/admissions",
        {
            "patientId": hospital_a.ids["patient"],
            "doctorId": hospital_a.ids["doctor"],
            "bedId": "doesnt-matter",
        },
    )
    assert response.status_code == 403, response.text


def test_hospital_without_ipd_refuses_doctor_progress_notes(hospital_a):
    response = hospital_a.post(
        "/progress-notes",
        {"admissionId": "doesnt-matter", "note": "x"},
        token=hospital_a.doctor_token,
    )
    assert response.status_code == 403, response.text


def test_hospital_with_ipd_allows_the_same_admin_role_through(hospital_c):
    """The complement: the same role (admin), same permission codes, same
    grants — succeeding here is what proves hospital_a's 403s above are the
    module gate and nothing else."""
    response = hospital_c.get("/wards")
    assert response.status_code == 200, response.text

    response = hospital_c.get("/admissions")
    assert response.status_code == 200, response.text

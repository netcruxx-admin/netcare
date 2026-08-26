"""One hospital must never see another's data.

Every test here is the same shape: hospital A asks for something belonging to
hospital B, and must be told it does not exist. They are boring on purpose — the
value is in the coverage, because a leak only ever appears in the one endpoint
nobody thought to scope.

Two conventions the assertions rely on:

  * A record that is not yours returns **404, never 403**. A 403 would confirm
    the id exists, which is itself a leak across a tenant boundary.
  * A collection returns only your rows. Not "yours first" or "yours mostly" —
    the tests assert the other tenant's ids are entirely absent.
"""

import pytest

from tests.conftest import _superadmin_token


# (collection path, the key in Tenant.ids holding a row id in that collection)
COLLECTIONS = [
    ("/patients", "patient"),
    ("/doctors", "doctor"),
    ("/departments", "department"),
    ("/appointments", "appointment"),
    ("/vitals", "vitals"),
    ("/medical-records", "medical_record"),
    ("/prescriptions", "prescription"),
]


@pytest.mark.parametrize("path,key", COLLECTIONS)
def test_collection_returns_only_own_tenant(hospital_a, hospital_b, path, key):
    """Listing shows your rows and none of theirs."""
    a_rows = hospital_a.read(path).json()
    b_rows = hospital_b.read(path).json()
    assert a_rows and b_rows, f"{path} fixture produced nothing to compare"

    a_ids = {row["id"] for row in a_rows}
    b_ids = {row["id"] for row in b_rows}

    assert hospital_a.ids[key] in a_ids
    assert hospital_b.ids[key] in b_ids
    assert not (a_ids & b_ids), f"{path} leaked rows across tenants: {a_ids & b_ids}"


@pytest.mark.parametrize("path,key", COLLECTIONS)
def test_detail_of_other_tenants_record_is_404(hospital_a, hospital_b, path, key):
    """Fetching their record by id is indistinguishable from it not existing."""
    response = hospital_a.read(f"{path}/{hospital_b.ids[key]}")
    # 405 means the collection has no detail route at all (/departments has only
    # PUT and DELETE on that path, /prescriptions has nothing) — there is no
    # read to leak through. 404 is the answer where a route does exist. A 200 is
    # a leak, and a 403 is nearly as bad: it confirms the id is real.
    assert response.status_code in (404, 405), (
        f"{path}/{{id}} returned {response.status_code} for another tenant's row"
    )


@pytest.mark.parametrize(
    "path,key",
    [
        ("/patients", "patient"),
        ("/appointments", "appointment"),
        ("/prescriptions", "prescription"),
    ],
)
def test_cannot_modify_other_tenants_record(client, hospital_a, hospital_b, path, key):
    """Writes are scoped too. A leak that only blocks reads still corrupts data."""
    target = f"{path}/{hospital_b.ids[key]}"

    # 403 is an honest refusal here as much as 404 is: an admin holds no
    # `prescriptions.manage` at all (that grant is the doctor's), so the request
    # never reaches the row. What must never happen is a 2xx.
    assert hospital_a.put(target, {"notes": "tampered"}).status_code in (403, 404, 405, 422)

    # Deletion is asked as the superadmin, presenting *hospital_a's* header:
    # since x9y0z1a2b3c4 no hospital role holds `*.delete`, so an admin would be
    # turned away by the permission gate and this would stop testing tenant
    # scoping at all. The superadmin gets past the gate — and must still be
    # scoped to the hospital its header names.
    su = {
        "Authorization": f"Bearer {_superadmin_token(client)}",
        "X-Hospital-Id": hospital_a.id,
    }
    assert client.delete(target, headers=su).status_code in (404, 405)

    # And the row is untouched from its owner's side. Asserted through the
    # collection rather than the detail route, because several of these
    # collections have no detail route to ask.
    still_there = hospital_b.read(path).json()
    assert hospital_b.ids[key] in {row["id"] for row in still_there}


def test_filter_by_other_tenants_id_returns_nothing(hospital_a, hospital_b):
    """A caller-supplied filter is a convenience, not a way out of the tenant.

    Passing another hospital's patient id must narrow the result to nothing
    rather than reach across — the filter is applied *inside* the tenant scope.
    """
    for path in ("/appointments", "/vitals", "/prescriptions", "/medical-records"):
        rows = hospital_a.read(f"{path}?patientId={hospital_b.ids['patient']}").json()
        assert rows == [], f"{path} honoured a foreign patientId and returned {rows}"


def test_search_does_not_cross_tenants(hospital_a, hospital_b):
    """Free-text search runs within the tenant, not across the table."""
    rows = hospital_a.read("/patients?q=beta").json()
    assert all(row["id"] != hospital_b.ids["patient"] for row in rows)

    rows = hospital_a.read("/prescriptions?q=beta-drug").json()
    assert rows == [], "search matched another tenant's prescription"


def test_cannot_create_a_record_pointing_at_another_tenant(hospital_a, hospital_b):
    """A foreign key in the body must not smuggle a row across the boundary.

    The appointment would be filed under hospital A — its own tenant — but about
    hospital B's patient, which would put B's patient in A's records.
    """
    response = hospital_a.post(
        "/appointments",
        {
            "patientId": hospital_b.ids["patient"],
            "doctorId": hospital_a.ids["doctor"],
            "departmentId": hospital_a.ids["department"],
            "date": "2026-09-02",
            "time": "11:00",
        },
    )
    assert response.status_code in (400, 404, 422), (
        f"created an appointment against another tenant's patient "
        f"({response.status_code}) — the body's foreign keys are not validated "
        "against the caller's tenant"
    )


def test_login_is_scoped_to_the_hospital_on_the_host(client, hospital_a, hospital_b):
    """The same credentials must not work at the wrong hospital.

    Email is unique *per tenant*, so a person can exist at two hospitals. The
    tenant a sign-in lands in is decided by the host, never by the credentials.
    """
    response = client.post(
        "/auth/login",
        headers={"X-Hospital-Id": hospital_b.id},
        json={"email": hospital_a.ids["patient_email"], "password": "Passw0rd!test"},
    )
    assert response.status_code == 401, (
        "hospital A's patient signed in against hospital B"
    )


def test_patient_token_cannot_reach_across_tenants(hospital_a, hospital_b):
    """A real token from A, pointed at B, gets nothing.

    The header names B, but the tenant of an authenticated request comes from
    the user row, so this must resolve back to A — not to B, and not to both.
    """
    response = hospital_b.client.get(
        "/patients",
        headers={
            "Authorization": f"Bearer {hospital_a.ids['patient_token']}",
            "X-Hospital-Id": hospital_b.id,
        },
    )
    assert response.status_code in (200, 403)
    if response.status_code == 200:
        ids = {row["id"] for row in response.json()}
        assert hospital_b.ids["patient"] not in ids, (
            "X-Hospital-Id let a tenant user read another hospital's patients"
        )


def test_audit_trail_is_tenant_scoped(hospital_a, hospital_b):
    """Even the compliance record is per-tenant.

    A hospital's audit trail names its own staff and patients; showing it to
    another tenant would leak exactly the personnel and patient identities the
    trail exists to protect.
    """
    rows = hospital_a.get("/audit-logs").json()
    assert rows, "no audit rows recorded for hospital A"
    assert all(r["hospitalId"] == hospital_a.id for r in rows), (
        "audit trail returned another tenant's rows"
    )


def test_consents_are_tenant_scoped(hospital_a, hospital_b):
    """Consent is given to a hospital, not to the platform."""
    rows = hospital_a.get("/consents").json()
    b_subjects = {hospital_b.ids["patient_email"]}
    assert all(r["subjectUserId"] not in b_subjects for r in rows)
    assert rows, "hospital A recorded no consents at registration"


def test_foreign_key_smuggling_does_not_leak_patient_identity(hospital_a, hospital_b):
    """The consequence of an unvalidated foreign key, spelled out.

    If hospital A can file an appointment against hospital B's patient id, the
    display helpers then resolve that id to a name and phone number — so the
    integrity hole becomes a disclosure of B's patient identity inside A's own
    appointment list. This asserts the outcome rather than the mechanism, so it
    keeps holding whichever layer ends up doing the blocking.
    """
    hospital_a.post(
        "/appointments",
        {
            "patientId": hospital_b.ids["patient"],
            "doctorId": hospital_a.ids["doctor"],
            "departmentId": hospital_a.ids["department"],
            "date": "2026-09-03",
            "time": "12:00",
        },
    )
    rows = hospital_a.read("/appointments").json()
    leaked = [r for r in rows if r.get("patientName", "").lower().find("beta") >= 0]
    assert not leaked, (
        f"hospital A's appointment list shows another tenant's patient: {leaked}"
    )


# (path, body naming another tenant's rows). Every clinical create takes foreign
# keys straight from the body, so each one is a chance to file a row in your own
# tenant that points into somebody else's.
SMUGGLE_TARGETS = [
    ("/vitals", lambda a, b: {
        "patientId": b.ids["patient"],
        "doctorId": a.ids["doctor"],
        "appointmentId": a.ids["appointment"],
        "temperature": 37.0,
    }),
    ("/medical-records", lambda a, b: {
        "patientId": b.ids["patient"],
        "doctorId": a.ids["doctor"],
        "appointmentId": a.ids["appointment"],
        "diagnosis": "smuggled",
    }),
    ("/prescriptions", lambda a, b: {
        "patientId": b.ids["patient"],
        "doctorId": a.ids["doctor"],
        "appointmentId": a.ids["appointment"],
        "medicineName": "smuggled",
    }),
]


@pytest.mark.parametrize("path,build", SMUGGLE_TARGETS, ids=[t[0] for t in SMUGGLE_TARGETS])
def test_clinical_creates_reject_foreign_keys(hospital_a, hospital_b, path, build):
    """The same hole appointments had, checked everywhere else it could exist.

    A row filed under hospital A carrying hospital B's patient_id is both a data
    integrity fault and — once a display helper resolves that id to a name — a
    disclosure of B's patient inside A's screens.
    """
    response = hospital_a.post(
        path, build(hospital_a, hospital_b), token=hospital_a.doctor_token
    )
    assert response.status_code in (400, 403, 404, 422), (
        f"{path} accepted another tenant's patientId ({response.status_code}) — "
        "the body's foreign keys are not checked against the caller's tenant"
    )

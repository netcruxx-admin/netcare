"""POST /wards can open a ward with its beds in the same request.

Creating a ward and then adding its beds one POST at a time was two halves of
one job, and a ward with no beds is not yet usable by the admit flow. `beds` on
WardCreate closes that gap.

The two things worth pinning down here are the ones that would be easy to get
quietly wrong:

* **Both capabilities are checked.** The endpoint still guards on
  `wards.manage`, but seeding beds is `beds.manage` work, so a role holding
  only the first must not gain the power to create beds by going through this
  door. It must also keep working for plain ward creation rather than losing
  the endpoint — the same "don't let a split cost them the rest of the job"
  shape test_delete_is_platform_only.py asserts.
* **It is one transaction.** A ward whose beds half-materialised would leave
  the admin guessing which numbers exist.
"""

import pytest

from tests.conftest import PROVISIONED_PASSWORD, _login, _superadmin_token
from app.utils import new_id


def _bed_numbers(tenant, ward_id):
    beds = tenant.get("/beds", params={"wardId": ward_id, "limit": 200}).json()
    return [b["bedNumber"] for b in beds]


# ---------------------------------------------------------------------------
# The happy path
# ---------------------------------------------------------------------------


def test_a_ward_created_with_beds_has_them_numbered_and_priced(hospital_c):
    response = hospital_c.post(
        "/wards",
        {
            "name": "ICU Male",
            "wardType": "icu",
            "beds": {"count": 4, "numberPrefix": "ICU", "dailyRate": 3500},
        },
    )
    assert response.status_code == 201, response.text
    ward = response.json()
    assert ward["bedCount"] == 4

    beds = hospital_c.get("/beds", params={"wardId": ward["id"], "limit": 200}).json()
    assert [b["bedNumber"] for b in beds] == ["ICU-1", "ICU-2", "ICU-3", "ICU-4"]
    assert {b["dailyRate"] for b in beds} == {3500}
    assert {b["status"] for b in beds} == {"vacant"}
    assert {b["wardId"] for b in beds} == {ward["id"]}


def test_without_a_prefix_the_beds_are_numbered_from_one(hospital_c):
    response = hospital_c.post(
        "/wards", {"name": "Plain ward", "beds": {"count": 3, "dailyRate": 800}}
    )
    assert response.status_code == 201, response.text
    assert _bed_numbers(hospital_c, response.json()["id"]) == ["1", "2", "3"]


def test_a_single_bed_ward_is_allowed(hospital_c):
    response = hospital_c.post(
        "/wards", {"name": "Isolation room", "beds": {"count": 1, "numberPrefix": "ISO"}}
    )
    assert response.status_code == 201, response.text
    assert _bed_numbers(hospital_c, response.json()["id"]) == ["ISO-1"]


def test_the_seeded_beds_are_usable_by_the_admit_flow(hospital_c):
    """The point of the whole change: a ward created this way is ready to
    admit into, with no second trip to the Beds screen."""
    ward = hospital_c.post(
        "/wards", {"name": "Admit-ready ward", "beds": {"count": 2, "dailyRate": 1200}}
    )
    assert ward.status_code == 201, ward.text
    beds = hospital_c.get("/beds", params={"wardId": ward.json()["id"]}).json()

    admission = hospital_c.post(
        "/admissions",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "bedId": beds[0]["id"],
            "provisionalDiagnosis": "seeded bed admission",
        },
    )
    assert admission.status_code == 201, admission.text
    assert admission.json()["bedNumber"] == beds[0]["bedNumber"]


# ---------------------------------------------------------------------------
# The old shape still works
# ---------------------------------------------------------------------------


def test_a_ward_created_without_the_beds_field_is_still_empty(hospital_c):
    """`beds` is optional — every existing caller keeps its behaviour."""
    response = hospital_c.post("/wards", {"name": "Empty ward", "wardType": "general"})
    assert response.status_code == 201, response.text
    assert response.json()["bedCount"] == 0
    assert _bed_numbers(hospital_c, response.json()["id"]) == []


def test_the_bed_count_survives_a_read_back(hospital_c):
    """bedCount is derived per request, so the list reports the same number the
    POST did — not a stored field that could drift, and not a zero."""
    created = hospital_c.post("/wards", {"name": "Readback ward", "beds": {"count": 2}})
    assert created.status_code == 201, created.text
    assert created.json()["bedCount"] == 2

    listed = hospital_c.read("/wards", params={"limit": 200}).json()
    row = next(w for w in listed if w["id"] == created.json()["id"])
    assert row["bedCount"] == 2


# ---------------------------------------------------------------------------
# Refusals
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("count", [0, -1, 201])
def test_a_count_outside_the_allowed_range_is_refused(hospital_c, count):
    response = hospital_c.post(
        "/wards", {"name": f"Bad count {count}", "beds": {"count": count}}
    )
    assert response.status_code == 422, response.text


def test_a_negative_rate_is_refused(hospital_c):
    response = hospital_c.post(
        "/wards", {"name": "Negative rate ward", "beds": {"count": 2, "dailyRate": -1}}
    )
    assert response.status_code == 422, response.text


def test_a_refused_seed_creates_no_ward_either(hospital_c):
    """One transaction: a rejected bed seed must not leave the ward behind."""
    name = f"Rolled back {new_id('w')}"
    refused = hospital_c.post("/wards", {"name": name, "beds": {"count": 0}})
    assert refused.status_code == 422, refused.text

    wards = hospital_c.read("/wards", params={"limit": 200}).json()
    assert [w for w in wards if w["name"] == name] == []


# ---------------------------------------------------------------------------
# Two capabilities meet here
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def ward_only_client(client, hospital_c):
    """A user holding `wards.manage` but not `beds.manage`.

    Built through the real role catalog, the way a superadmin would invent one
    from the Roles screen — the point of roles-are-data is that this needs no
    code change, so the test should not need one either.
    """
    su = _superadmin_token(client)
    code = "ward_clerk"
    created = client.post(
        "/roles",
        headers={"Authorization": f"Bearer {su}"},
        json={
            "code": code,
            "label": "Ward Clerk",
            "permissions": [{"code": "wards.manage"}, {"code": "beds.read"}],
        },
    )
    assert created.status_code in (201, 409), created.text

    email = f"wardclerk@{hospital_c.subdomain}.test"
    user = hospital_c.post(
        "/users",
        {"name": "Ward Clerk", "email": email, "password": PROVISIONED_PASSWORD, "role": code},
    )
    assert user.status_code == 201, user.text
    return _login(client, hospital_c.id, email)


def test_ward_manage_alone_cannot_seed_beds(hospital_c, ward_only_client):
    response = hospital_c.post(
        "/wards",
        {"name": "Clerk ward with beds", "beds": {"count": 3}},
        token=ward_only_client,
    )
    assert response.status_code == 403, response.text


def test_the_refused_seed_left_no_ward_behind(hospital_c, ward_only_client):
    wards = hospital_c.read("/wards", params={"limit": 200}).json()
    assert [w for w in wards if w["name"] == "Clerk ward with beds"] == []


def test_ward_manage_alone_can_still_create_a_plain_ward(hospital_c, ward_only_client):
    """The split must not cost them the rest of the job — the same assertion
    test_delete_is_platform_only.py makes about an admin keeping edit."""
    response = hospital_c.post(
        "/wards", {"name": "Clerk plain ward"}, token=ward_only_client
    )
    assert response.status_code == 201, response.text
    assert response.json()["bedCount"] == 0


# ---------------------------------------------------------------------------
# Tenancy
# ---------------------------------------------------------------------------


def test_seeded_beds_belong_to_the_creating_tenant_only(hospital_c, hospital_d):
    ward = hospital_c.post(
        "/wards", {"name": "Tenant-scoped ward", "beds": {"count": 2, "numberPrefix": "TS"}}
    )
    assert ward.status_code == 201, ward.text
    ward_id = ward.json()["id"]

    assert len(_bed_numbers(hospital_c, ward_id)) == 2
    # The other tenant sees neither the ward nor its beds.
    assert _bed_numbers(hospital_d, ward_id) == []
    d_wards = hospital_d.read("/wards", params={"limit": 200}).json()
    assert [w for w in d_wards if w["id"] == ward_id] == []


# ---------------------------------------------------------------------------
# The bed count on the wards list
# ---------------------------------------------------------------------------


def test_the_wards_list_carries_each_ward_s_bed_count(hospital_c):
    """The Wards table's Beds column. One GROUP BY, so the count is right for
    every ward on the page without the client fetching any bed rows."""
    ward = hospital_c.post(
        "/wards", {"name": f"Counted ward {new_id('w')}", "beds": {"count": 5}}
    )
    assert ward.status_code == 201, ward.text
    ward_id = ward.json()["id"]

    listed = hospital_c.read("/wards", params={"limit": 200}).json()
    row = next(w for w in listed if w["id"] == ward_id)
    assert row["bedCount"] == 5
    # Every ward on the page gets a number, not just the one just created.
    assert all(isinstance(w["bedCount"], int) for w in listed)


def test_the_bed_count_follows_beds_added_and_removed_afterwards(hospital_c):
    """Derived, not stored: adding a bed through the ordinary endpoint moves
    the ward's count without anything writing to the ward row."""
    ward = hospital_c.post(
        "/wards", {"name": f"Moving count {new_id('w')}", "beds": {"count": 2}}
    )
    assert ward.status_code == 201, ward.text
    ward_id = ward.json()["id"]

    added = hospital_c.post("/beds", {"wardId": ward_id, "bedNumber": "extra-1"})
    assert added.status_code == 201, added.text

    listed = hospital_c.read("/wards", params={"limit": 200}).json()
    assert next(w for w in listed if w["id"] == ward_id)["bedCount"] == 3


def test_an_empty_ward_counts_zero_rather_than_going_missing(hospital_c):
    ward = hospital_c.post("/wards", {"name": f"No beds {new_id('w')}"})
    assert ward.status_code == 201, ward.text

    listed = hospital_c.read("/wards", params={"limit": 200}).json()
    row = next(w for w in listed if w["id"] == ward.json()["id"])
    assert row["bedCount"] == 0


def test_the_count_does_not_include_another_tenant_s_beds(hospital_c, hospital_d):
    """The count goes through scoped(), like every other query."""
    c_wards = hospital_c.read("/wards", params={"limit": 200}).json()
    d_wards = hospital_d.read("/wards", params={"limit": 200}).json()
    assert {w["id"] for w in c_wards}.isdisjoint({w["id"] for w in d_wards})

    # hospital_d's own seeded ward holds exactly the one bed _enable_ipd made.
    d_row = next(w for w in d_wards if w["id"] == hospital_d.ids["ward"])
    assert d_row["bedCount"] == 1


def test_editing_a_ward_reports_its_bed_count_too(hospital_c):
    ward = hospital_c.post(
        "/wards", {"name": f"Renamed ward {new_id('w')}", "beds": {"count": 3}}
    )
    assert ward.status_code == 201, ward.text

    updated = hospital_c.put(f"/wards/{ward.json()['id']}", {"floor": "3rd Floor"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["bedCount"] == 3

"""A hospital admin reading and editing their own hospital.

The interesting assertions here are the negative ones. A screen that hides the
GSTIN field is a hint; what stops an admin changing it is that the field is not
on `HospitalSelfUpdate` at all, so it cannot arrive. These tests send the
forbidden fields anyway and check the values did not move.
"""

from tests.conftest import _superadmin_token

SETTINGS = "/hospitals/me/settings"


def test_admin_can_read_their_whole_hospital(hospital_a):
    response = hospital_a.get(SETTINGS)
    assert response.status_code == 200, response.text
    body = response.json()
    # Including the parts they cannot edit: noticing the GSTIN is wrong is the
    # first step to asking for it to be fixed.
    assert body["hospital"]["id"] == hospital_a.id
    assert "licences" in body and "documents" in body
    assert "subscription" in body


def test_the_tenant_comes_from_the_token_not_the_url(hospital_a, hospital_b):
    """There is no id in the path, so there is nothing to point elsewhere."""
    a = hospital_a.get(SETTINGS).json()["hospital"]["id"]
    b = hospital_b.get(SETTINGS).json()["hospital"]["id"]
    assert a == hospital_a.id
    assert b == hospital_b.id
    assert a != b


def test_admin_can_edit_what_they_own(hospital_a):
    response = hospital_a.patch(
        SETTINGS,
        json={
            "phonePrimary": "9812345678",
            "addressLine1": "42 New Road",
            "city": "Pune",
            "bedCount": 120,
            "hasPharmacy": True,
            "appointmentSlotMinutes": 20,
            "medicalDirectorName": "Dr A Bhatt",
            "tagline": "Care, close to home",
        },
    )
    assert response.status_code == 200, response.text
    profile = response.json()["profile"]
    assert profile["phonePrimary"] == "9812345678"
    assert profile["addressLine1"] == "42 New Road"
    assert profile["city"] == "Pune"
    assert profile["bedCount"] == 120
    assert profile["hasPharmacy"] is True
    assert profile["appointmentSlotMinutes"] == 20
    assert profile["medicalDirectorName"] == "Dr A Bhatt"
    assert response.json()["hospital"]["tagline"] == "Care, close to home"


def test_a_patch_leaves_unsent_fields_alone(hospital_a):
    """PATCH, not PUT — one section saves without blanking the others."""
    hospital_a.patch(SETTINGS, json={"city": "Nashik", "website": "https://x.example"})
    hospital_a.patch(SETTINGS, json={"city": "Nagpur"})
    profile = hospital_a.get(SETTINGS).json()["profile"]
    assert profile["city"] == "Nagpur"
    assert profile["website"] == "https://x.example"


def test_legal_identity_cannot_be_edited(hospital_a):
    """These are attestations, not claims — verified_at says we checked them."""
    before = hospital_a.get(SETTINGS).json()["hospital"]
    response = hospital_a.patch(
        SETTINGS,
        json={
            "gstin": "27AAAAA0000A1Z5",
            "pan": "AAAAA0000A",
            "registrationNo": "FAKE-REG-1",
            "legalName": "Something Else Pvt Ltd",
            "nabhStatus": "accredited",
        },
    )
    assert response.status_code == 200, response.text
    after = response.json()["hospital"]
    for field in ("gstin", "pan", "registrationNo", "legalName", "nabhStatus"):
        assert after[field] == before[field], f"{field} was editable"


def test_tenancy_and_plan_fields_cannot_be_edited(hospital_a):
    before = hospital_a.get(SETTINGS).json()["hospital"]
    response = hospital_a.patch(
        SETTINGS,
        json={
            "subdomain": "stolen",
            "category": "multi-specialty",
            "status": "suspended",
            "onboardingStatus": "verified",
            "modules": {"lab": True, "pharmacy": True, "telemedicine": True},
        },
    )
    assert response.status_code == 200, response.text
    after = response.json()["hospital"]
    for field in ("subdomain", "category", "status", "onboardingStatus", "modules"):
        assert after[field] == before[field], f"{field} was editable"


def test_numbering_cannot_be_edited(hospital_a):
    """Nothing reads these yet — which is exactly why they are locked now.

    Once numbering is wired up, a mid-flight prefix change splits the series,
    and a GST invoice number must be sequential and unique within the year.
    """
    before = hospital_a.get(SETTINGS).json()["profile"]
    response = hospital_a.patch(
        SETTINGS,
        json={
            "invoicePrefix": "HACK",
            "invoiceSeriesStart": 9000,
            "mrnPrefix": "ZZZ",
            "mrnFormat": "{prefix}-{seq}",
            "financialYearStart": "01-01",
        },
    )
    assert response.status_code == 200, response.text
    after = response.json()["profile"]
    for field in ("invoicePrefix", "invoiceSeriesStart", "mrnPrefix", "mrnFormat", "financialYearStart"):
        assert after[field] == before[field], f"{field} was editable"


def test_validation_still_applies(hospital_a):
    bad_pin = hospital_a.patch(SETTINGS, json={"pincode": "12"})
    assert bad_pin.status_code == 422, bad_pin.text
    bad_slot = hospital_a.patch(SETTINGS, json={"appointmentSlotMinutes": 1})
    assert bad_slot.status_code == 422, bad_slot.text
    blank_name = hospital_a.patch(SETTINGS, json={"name": "   "})
    assert blank_name.status_code == 422, blank_name.text


def test_a_role_without_the_grant_is_refused(hospital_a):
    """The nurse holds plenty of reads; this is not one of them."""
    response = hospital_a.client.get(
        SETTINGS, headers=hospital_a.headers(hospital_a.nurse_token)
    )
    assert response.status_code == 403, response.text

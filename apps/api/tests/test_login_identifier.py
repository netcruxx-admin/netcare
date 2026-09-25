"""Signing in with a phone number, not just an email.

Phone is not unique per tenant the way email is — a patient identified by a
relative (`relation_type`: W/O, D/O, S/O, B/O) commonly shares a household or
parent's number with another account on purpose, and registration must never
refuse that. So the interesting cases here are less "does phone login work"
and more "what happens when a phone number is not enough to pick one account."

Every test creates its own account(s) with a unique email and phone, because
`hospital_a` is a session-scoped fixture shared by the whole suite.
"""

import uuid

from tests.conftest import PROVISIONED_PASSWORD


def _unique_phone() -> str:
    return f"9{uuid.uuid4().int % 10**9:09d}"


def _create_account(tenant, role: str, phone: str, **overrides) -> dict:
    # Stored as +91-prefixed, same as every phone field on the frontend sends
    # it (see PhoneField.withPrefix) — the backend itself does not normalise
    # what it is given, so a test that wrote the bare digits would not be
    # exercising the shape phone numbers actually arrive in.
    body = {
        "name": f"{role.title()} Account",
        "email": f"{uuid.uuid4().hex[:8]}@login.test",
        "password": PROVISIONED_PASSWORD,
        "role": role,
        "phone": f"+91{phone}",
        **overrides,
    }
    created = tenant.post("/users", body)
    assert created.status_code == 201, created.text
    return {**body, "id": created.json()["id"]}


def _login(client, tenant, identifier: str, password: str = PROVISIONED_PASSWORD):
    return client.post(
        "/auth/login",
        headers={"X-Hospital-Id": tenant.id},
        json={"identifier": identifier, "password": password},
    )


def test_login_by_email_still_works(client, hospital_a):
    account = _create_account(hospital_a, "patient", _unique_phone())
    response = _login(client, hospital_a, account["email"])
    assert response.status_code == 200, response.text
    assert response.json()["user"]["email"] == account["email"]


def test_login_by_phone_works(client, hospital_a):
    phone = _unique_phone()
    account = _create_account(hospital_a, "patient", phone)
    response = _login(client, hospital_a, phone)
    assert response.status_code == 200, response.text
    assert response.json()["user"]["email"] == account["email"]


def test_login_by_phone_works_for_staff_too(client, hospital_a):
    """Not just patients — the lookup doesn't branch on role at all."""
    phone = _unique_phone()
    account = _create_account(hospital_a, "doctor", phone)
    response = _login(client, hospital_a, phone)
    assert response.status_code == 200, response.text
    assert response.json()["user"]["role"] == "doctor"
    assert response.json()["user"]["email"] == account["email"]


def test_login_by_phone_accepts_the_formats_people_type(client, hospital_a):
    """+91, a bare 91 prefix, and spaced-out digits all normalise the same way
    the frontend's own PhoneField would have sent them in the first place."""
    ten_digits = _unique_phone()
    _create_account(hospital_a, "patient", ten_digits)

    for typed in (
        ten_digits,
        f"+91{ten_digits}",
        f"91{ten_digits}",
        f"{ten_digits[:5]} {ten_digits[5:]}",
    ):
        response = _login(client, hospital_a, typed)
        assert response.status_code == 200, f"{typed!r} -> {response.text}"


def test_wrong_password_via_phone_is_a_clear_error(client, hospital_a):
    phone = _unique_phone()
    _create_account(hospital_a, "patient", phone)
    response = _login(client, hospital_a, phone, password="not-the-password")
    assert response.status_code == 401
    assert "Incorrect password" in response.json()["detail"]


def test_an_unknown_phone_gives_the_generic_no_account_message(client, hospital_a):
    response = _login(client, hospital_a, _unique_phone())
    assert response.status_code == 401
    assert "No account found" in response.json()["detail"]


def test_two_accounts_sharing_a_phone_cannot_sign_in_by_that_phone(client, hospital_a):
    """The mother-and-baby case: two accounts, one real phone number, neither
    registration refused. Phone stops being a usable key for either of them —
    it must not silently pick one — but each keeps signing in by email."""
    shared_phone = _unique_phone()
    mother = _create_account(hospital_a, "patient", shared_phone, name="Mother")
    baby = _create_account(hospital_a, "patient", shared_phone, name="Baby", relationType="baby_of")

    ambiguous = _login(client, hospital_a, shared_phone)
    assert ambiguous.status_code == 401
    assert "more than one account" in ambiguous.json()["detail"].lower()

    for account in (mother, baby):
        response = _login(client, hospital_a, account["email"])
        assert response.status_code == 200, response.text
        assert response.json()["user"]["email"] == account["email"]

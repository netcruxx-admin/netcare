"""Email matching does not care about case.

"user@x.com" and "User@X.com" are the same address to every mail provider
anyone actually uses, and treating them as different accounts here mostly
means someone gets locked out the day a phone keyboard's autocapitalize
turns "email@x.com" into "Email@x.com". Every write path lowercases
(identity.normalise_email, applied by a validator on each schema that
carries a login email — see schemas.py), so the tests below exercise the
observable behaviour: what gets stored, what counts as a duplicate, and
whether login and password reset find the account regardless of how the
address was typed.
"""

import uuid

from tests.conftest import PROVISIONED_PASSWORD, REQUIRED_CONSENTS


def _unique_local_part() -> str:
    return uuid.uuid4().hex[:10]


def test_created_account_email_is_stored_lowercase(hospital_a):
    local = _unique_local_part()
    created = hospital_a.post(
        "/users",
        {
            "name": "Case Check",
            "email": f"MixedCase.{local}@Example.COM",
            "password": PROVISIONED_PASSWORD,
            "role": "patient",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["email"] == f"mixedcase.{local}@example.com"


def test_signup_stores_email_lowercase(client, hospital_a):
    local = _unique_local_part()
    response = client.post(
        "/auth/register",
        headers={"X-Hospital-Id": hospital_a.id},
        json={
            "name": "Signup Case Check",
            "email": f"SignUp.{local}@Example.COM",
            "password": PROVISIONED_PASSWORD,
            "phone": "9000000001",
            "role": "patient",
            "dateOfBirth": "1990-01-01",
            "consents": REQUIRED_CONSENTS,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["user"]["email"] == f"signup.{local}@example.com"


def test_signup_uniqueness_is_case_insensitive(client, hospital_a):
    local = _unique_local_part()
    first = client.post(
        "/auth/register",
        headers={"X-Hospital-Id": hospital_a.id},
        json={
            "name": "First",
            "email": f"dup.{local}@example.com",
            "password": PROVISIONED_PASSWORD,
            "phone": "9000000002",
            "role": "patient",
            "dateOfBirth": "1990-01-01",
            "consents": REQUIRED_CONSENTS,
        },
    )
    assert first.status_code == 200, first.text

    second = client.post(
        "/auth/register",
        headers={"X-Hospital-Id": hospital_a.id},
        json={
            "name": "Second",
            "email": f"DUP.{local}@EXAMPLE.COM",
            "password": PROVISIONED_PASSWORD,
            "phone": "9000000003",
            "role": "patient",
            "dateOfBirth": "1990-01-01",
            "consents": REQUIRED_CONSENTS,
        },
    )
    assert second.status_code == 409, second.text


def test_login_by_email_is_case_insensitive(client, hospital_a):
    local = _unique_local_part()
    created = hospital_a.post(
        "/users",
        {
            "name": "Login Case Check",
            "email": f"login.{local}@example.com",
            "password": PROVISIONED_PASSWORD,
            "role": "patient",
        },
    )
    assert created.status_code == 201, created.text

    for typed in (
        f"login.{local}@example.com",
        f"LOGIN.{local}@EXAMPLE.COM",
        f"Login.{local}@Example.Com",
    ):
        response = client.post(
            "/auth/login",
            headers={"X-Hospital-Id": hospital_a.id},
            json={"identifier": typed, "password": PROVISIONED_PASSWORD},
        )
        assert response.status_code == 200, f"{typed!r} -> {response.text}"
        assert response.json()["user"]["email"] == f"login.{local}@example.com"


def test_own_account_update_email_is_lowercased_and_checked_case_insensitively(hospital_a):
    local = _unique_local_part()
    existing = hospital_a.post(
        "/users",
        {
            "name": "Existing",
            "email": f"taken.{local}@example.com",
            "password": PROVISIONED_PASSWORD,
            "role": "patient",
        },
    )
    assert existing.status_code == 201, existing.text

    mover = hospital_a.post(
        "/users",
        {
            "name": "Mover",
            "email": f"mover.{local}@example.com",
            "password": PROVISIONED_PASSWORD,
            "role": "patient",
        },
    )
    assert mover.status_code == 201, mover.text

    # A different-case update to the mover's own address is stored lowercase.
    self_update = hospital_a.put(
        f"/users/{mover.json()['id']}",
        {"email": f"MOVER.{local}@EXAMPLE.COM"},
    )
    assert self_update.status_code == 200, self_update.text
    assert self_update.json()["email"] == f"mover.{local}@example.com"

    # Moving onto the other account's address, differently cased, still 409s.
    clash = hospital_a.put(
        f"/users/{mover.json()['id']}",
        {"email": f"TAKEN.{local}@EXAMPLE.COM"},
    )
    assert clash.status_code == 409, clash.text


def test_forgot_password_finds_the_account_regardless_of_case(client, hospital_a):
    local = _unique_local_part()
    created = hospital_a.post(
        "/users",
        {
            "name": "Reset Case Check",
            "email": f"reset.{local}@example.com",
            "password": PROVISIONED_PASSWORD,
            "role": "patient",
        },
    )
    assert created.status_code == 201, created.text

    response = client.post(
        "/auth/forgot-password",
        headers={"X-Hospital-Id": hospital_a.id},
        json={"email": f"RESET.{local}@EXAMPLE.COM"},
    )
    assert response.status_code == 200, response.text

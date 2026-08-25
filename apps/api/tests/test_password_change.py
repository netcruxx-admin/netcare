"""Changing your own password, and resetting somebody else's.

Before this there was no recovery at all: a person who forgot their password had
no path back, and a person who suspected their account was compromised had no
way to act on it. The only mechanism was one admin editing another user's row.
"""

import uuid

import pytest

from conftest import PROVISIONED_PASSWORD, SETTLED_PASSWORD, _login, _superadmin_token


def _new_staff(tenant, role="nurse"):
    """A freshly provisioned account, still on its forced first change."""
    slug = uuid.uuid4().hex[:8]
    email = f"{role}{slug}@{tenant.subdomain}.test"
    created = tenant.post(
        "/users",
        {
            "name": f"Temp {slug}",
            "email": email,
            "password": PROVISIONED_PASSWORD,
            "role": role,
        },
    )
    assert created.status_code == 201, created.text
    return created.json()["id"], email


def _signin(tenant, email, password):
    return tenant.client.post(
        "/auth/login",
        headers={"X-Hospital-Id": tenant.id},
        json={"email": email, "password": password},
    )


# --- the forced first change ------------------------------------------------


def test_a_provisioned_account_must_change_its_password_first(hospital_a):
    """Someone else typed it, so it buys exactly one thing: choosing a real one."""
    _, email = _new_staff(hospital_a)

    signin = _signin(hospital_a, email, PROVISIONED_PASSWORD)
    assert signin.status_code == 200, signin.text
    assert signin.json()["mustChangePassword"] is True

    # Signed in, and refused everywhere that matters.
    token = signin.json()["token"]
    blocked = hospital_a.get("/patients", token=token)
    assert blocked.status_code == 403
    assert "change your password" in blocked.json()["detail"].lower()


def test_the_change_endpoint_stays_reachable_while_blocked(hospital_a):
    """The one exception, and the reason the block is not a dead end."""
    _, email = _new_staff(hospital_a)
    token = _signin(hospital_a, email, PROVISIONED_PASSWORD).json()["token"]

    changed = hospital_a.post(
        "/auth/change-password",
        {"currentPassword": PROVISIONED_PASSWORD, "newPassword": SETTLED_PASSWORD},
        token=token,
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["mustChangePassword"] is False

    # And now the rest of the API opens up, on the token the change returned.
    assert hospital_a.get("/patients", token=changed.json()["token"]).status_code == 200


# --- changing your own ------------------------------------------------------


def test_the_current_password_is_required(hospital_a):
    """An access token left on a shared machine must not be enough to take over.

    Without this check, whoever found one could set a new password and lock the
    real owner out of their own account.
    """
    _, email = _new_staff(hospital_a)
    token = _signin(hospital_a, email, PROVISIONED_PASSWORD).json()["token"]

    wrong = hospital_a.post(
        "/auth/change-password",
        {"currentPassword": "not-the-password", "newPassword": SETTLED_PASSWORD},
        token=token,
    )
    assert wrong.status_code == 400
    # And the old password still works, i.e. nothing was changed on the way out.
    assert _signin(hospital_a, email, PROVISIONED_PASSWORD).status_code == 200


def test_the_new_password_must_differ(hospital_a):
    """Re-submitting the same password would clear the forced-change flag
    without the password ever stopping being one somebody else knows."""
    _, email = _new_staff(hospital_a)
    token = _signin(hospital_a, email, PROVISIONED_PASSWORD).json()["token"]

    same = hospital_a.post(
        "/auth/change-password",
        {"currentPassword": PROVISIONED_PASSWORD, "newPassword": PROVISIONED_PASSWORD},
        token=token,
    )
    assert same.status_code == 400
    assert "different" in same.json()["detail"].lower()


def test_a_short_password_is_refused(hospital_a):
    _, email = _new_staff(hospital_a)
    token = _signin(hospital_a, email, PROVISIONED_PASSWORD).json()["token"]
    short = hospital_a.post(
        "/auth/change-password",
        {"currentPassword": PROVISIONED_PASSWORD, "newPassword": "short"},
        token=token,
    )
    assert short.status_code == 422


def test_changing_ends_other_sessions_but_not_this_one(hospital_a):
    """What someone does when they think they are compromised has to evict the
    other party — while not signing the caller out of the act of doing it."""
    _, email = _new_staff(hospital_a)
    settled = _login(hospital_a.client, hospital_a.id, email)

    # A second device.
    other = _signin(hospital_a, email, SETTLED_PASSWORD).json()["token"]
    assert hospital_a.get("/patients", token=other).status_code == 200

    changed = hospital_a.post(
        "/auth/change-password",
        {"currentPassword": SETTLED_PASSWORD, "newPassword": "Another!one2026"},
        token=settled,
    )
    assert changed.status_code == 200, changed.text

    assert hospital_a.get("/patients", token=other).status_code == 401, (
        "the other device kept working after a password change"
    )
    assert hospital_a.get("/patients", token=changed.json()["token"]).status_code == 200


def test_the_old_password_stops_working(hospital_a):
    _, email = _new_staff(hospital_a)
    _login(hospital_a.client, hospital_a.id, email)  # settles it to SETTLED_PASSWORD
    assert _signin(hospital_a, email, PROVISIONED_PASSWORD).status_code == 401
    assert _signin(hospital_a, email, SETTLED_PASSWORD).status_code == 200


# --- resetting somebody else's ----------------------------------------------


def test_staff_can_reset_a_password_and_the_holder_must_replace_it(hospital_a):
    """The whole recovery story until there is an email or SMS provider."""
    user_id, email = _new_staff(hospital_a)
    _login(hospital_a.client, hospital_a.id, email)  # settle it first

    reset = hospital_a.post(f"/users/{user_id}/reset-password", {})
    assert reset.status_code == 201, reset.text
    body = reset.json()
    temporary = body["temporaryPassword"]
    assert body["mustChangePassword"] is True
    assert len(temporary) >= 12

    assert _signin(hospital_a, email, SETTLED_PASSWORD).status_code == 401
    signin = _signin(hospital_a, email, temporary)
    assert signin.status_code == 200
    assert signin.json()["mustChangePassword"] is True
    assert hospital_a.get("/patients", token=signin.json()["token"]).status_code == 403


def test_a_reset_ends_every_session_the_account_had(hospital_a):
    """A reset is what gets done *because* an account is suspected compromised.
    Leaving the attacker's session alive would make it theatre."""
    user_id, email = _new_staff(hospital_a)
    live = _login(hospital_a.client, hospital_a.id, email)
    assert hospital_a.get("/patients", token=live).status_code == 200

    assert hospital_a.post(f"/users/{user_id}/reset-password", {}).status_code == 201
    assert hospital_a.get("/patients", token=live).status_code == 401


def test_two_resets_give_different_passwords(hospital_a):
    """There is nothing to look up, so "I lost the note" is answered by another
    reset rather than by retrieving the first."""
    user_id, _ = _new_staff(hospital_a)
    first = hospital_a.post(f"/users/{user_id}/reset-password", {}).json()
    second = hospital_a.post(f"/users/{user_id}/reset-password", {}).json()
    assert first["temporaryPassword"] != second["temporaryPassword"]


def test_you_cannot_reset_your_own_this_way(hospital_a):
    """It would skip the current-password check, and lock the caller out of
    every endpoint until they completed a change they could have done directly."""
    me = hospital_a.get("/auth/me").json()["user"]["id"]
    refused = hospital_a.post(f"/users/{me}/reset-password", {})
    assert refused.status_code == 409
    assert "change-password" in refused.json()["detail"]


def test_a_nurse_cannot_reset_anyone(hospital_a):
    """Recovery requires someone who can vouch for the person asking, and that
    authority is `users.manage` — not merely being staff."""
    user_id, _ = _new_staff(hospital_a)
    refused = hospital_a.post(
        f"/users/{user_id}/reset-password", {}, token=hospital_a.nurse_token
    )
    assert refused.status_code == 403


def test_one_hospital_cannot_reset_anothers_staff(hospital_a, hospital_b):
    """404, not 403 — a 403 would confirm the user id is real."""
    other_id, _ = _new_staff(hospital_b)
    refused = hospital_a.post(f"/users/{other_id}/reset-password", {})
    assert refused.status_code == 404, (
        f"reset reached across the tenant boundary ({refused.status_code})"
    )


def test_a_chosen_reset_password_is_honoured(hospital_a):
    """Staff may set one explicitly, for the case where the person is on the
    phone and a generated string is painful to read out."""
    user_id, email = _new_staff(hospital_a)
    chosen = "Reception!2026"
    reset = hospital_a.post(
        f"/users/{user_id}/reset-password", {"newPassword": chosen}
    )
    assert reset.status_code == 201, reset.text
    assert reset.json()["temporaryPassword"] == chosen
    assert _signin(hospital_a, email, chosen).status_code == 200


def test_a_short_chosen_reset_password_is_refused(hospital_a):
    user_id, _ = _new_staff(hospital_a)
    refused = hospital_a.post(f"/users/{user_id}/reset-password", {"newPassword": "abc"})
    assert refused.status_code == 422


# --- the patient path -------------------------------------------------------


def test_a_self_registered_patient_is_not_forced_to_change(hospital_a):
    """They chose the password themselves at sign-up, so nobody else knows it
    and there is nothing to replace."""
    slug = uuid.uuid4().hex[:8]
    registered = hospital_a.client.post(
        "/auth/register",
        headers={"X-Hospital-Id": hospital_a.id},
        json={
            "name": "Self Signup",
            "email": f"self{slug}@alpha.test",
            "password": "MyOwn!password1",
            "phone": "9000000222",
            "role": "patient",
            "dateOfBirth": "1990-01-01",
            "consents": ["treatment", "billing", "communications.service"],
        },
    )
    assert registered.status_code == 200, registered.text
    assert registered.json()["mustChangePassword"] is False


def test_a_patient_can_change_their_own_password(hospital_a):
    """The gap this whole change exists to close: before it, nobody could."""
    slug = uuid.uuid4().hex[:8]
    email = f"selfchg{slug}@alpha.test"
    registered = hospital_a.client.post(
        "/auth/register",
        headers={"X-Hospital-Id": hospital_a.id},
        json={
            "name": "Self Change",
            "email": email,
            "password": "MyOwn!password1",
            "phone": "9000000333",
            "role": "patient",
            "dateOfBirth": "1990-01-01",
            "consents": ["treatment", "billing", "communications.service"],
        },
    )
    token = registered.json()["token"]

    changed = hospital_a.post(
        "/auth/change-password",
        {"currentPassword": "MyOwn!password1", "newPassword": "MyNew!password2"},
        token=token,
    )
    assert changed.status_code == 200, changed.text
    assert _signin(hospital_a, email, "MyNew!password2").status_code == 200
    assert _signin(hospital_a, email, "MyOwn!password1").status_code == 401


def test_the_reset_is_audited(hospital_a):
    """An admin setting someone else's password is exactly the act a
    medico-legal review asks about."""
    user_id, _ = _new_staff(hospital_a)
    assert hospital_a.post(f"/users/{user_id}/reset-password", {}).status_code == 201

    rows = hospital_a.get("/audit-logs?action=password_reset").json()
    assert any(r["subjectId"] == user_id for r in rows), (
        "the password reset left no audit trail"
    )

"""What an unauthenticated caller learns from a tenant's subdomain.

`GET /hospitals/current` resolves the tenant from the request host and answers
without a session, because a hospital's login page has to brand itself before
anyone signs in. It used to return the whole `hospitals` row, which put every
tenant's PAN, GSTIN and registration number on that page.

The allowlist is the guarantee, so these tests name the fields that must never
come back — including the ones that do not exist yet.
"""

import io

CURRENT = "/hospitals/current"

#: Attestations the platform verified, and identifiers a stranger has no
#: business reading. A GSTIN is semi-public — it is printed on invoices — but
#: it is still not something to publish on an unauthenticated endpoint.
PRIVATE = [
    "pan", "gstin", "registrationNo", "registrationAuthority",
    "registrationValidTill", "legalName", "entityType", "ownership",
    "hfrId", "nabhStatus", "nabhValidTill",
    "onboardingStatus", "verifiedAt", "verifiedBy", "goLiveDate",
]


def _public(client, hospital_id):
    """No Authorization header — this is the pre-login case."""
    return client.get(CURRENT, headers={"X-Hospital-Id": hospital_id})


def test_it_answers_without_a_session(client, hospital_a):
    response = _public(client, hospital_a.id)
    assert response.status_code == 200, response.text


def test_it_carries_what_the_login_page_needs(client, hospital_a):
    body = _public(client, hospital_a.id).json()
    for field in ("id", "name", "subdomain", "category", "theme", "modules", "logoUrl", "status"):
        assert field in body, f"{field} is needed to render a tenant's pages"
    assert body["id"] == hospital_a.id


def test_it_leaks_no_legal_identity(client, hospital_a):
    body = _public(client, hospital_a.id).json()
    leaked = [f for f in PRIVATE if f in body]
    assert not leaked, f"unauthenticated callers can read: {leaked}"


def test_the_allowlist_is_closed(client, hospital_a):
    """A column added to `hospitals` later must not appear here by default.

    The handler builds the response field by field rather than from the ORM
    row, so this asserts the exact set — if it grows, someone chose that.
    """
    body = _public(client, hospital_a.id).json()
    assert set(body) == {
        "id", "name", "subdomain", "category", "tagline",
        "currency", "modules", "theme", "logoUrl", "status",
    }, sorted(body)


def test_the_logo_still_comes_through(client, hospital_a):
    hospital_a.client.put(
        "/hospitals/me/logo",
        headers=hospital_a.headers(),
        files={"file": ("logo.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 64), "image/png")},
    )
    assert _public(client, hospital_a.id).json()["logoUrl"]


def test_an_authenticated_platform_read_still_sees_everything(client, hospital_a):
    """Narrowing the public endpoint must not blind the superadmin console."""
    from tests.conftest import _superadmin_token

    response = client.get(
        f"/hospitals/{hospital_a.id}",
        headers={"Authorization": f"Bearer {_superadmin_token(client)}"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    for field in ("pan", "gstin", "registrationNo", "onboardingStatus"):
        assert field in body, f"{field} disappeared from the authenticated read"

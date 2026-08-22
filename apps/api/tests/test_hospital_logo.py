"""A hospital's own logo — upload, replace, remove, and who can see it.

The interesting one is the last: the logo has to be readable with no session at
all, because the login page on a tenant's subdomain shows it before anyone has
signed in.
"""

import io

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
LOGO = "/hospitals/me/logo"
SETTINGS = "/hospitals/me/settings"


def _put(tenant, *, name="logo.png", content_type="image/png", token=None):
    return tenant.client.put(
        LOGO,
        headers=tenant.headers(token),
        files={"file": (name, io.BytesIO(PNG), content_type)},
    )


def test_an_admin_can_upload_a_logo(hospital_a):
    response = _put(hospital_a)
    assert response.status_code == 200, response.text
    assert response.json()["logoUrl"]


def test_the_logo_comes_back_on_the_settings_screen(hospital_a):
    _put(hospital_a)
    profile = hospital_a.get(SETTINGS).json()["profile"]
    assert profile["logoUrl"]


def test_uploading_again_replaces_rather_than_accumulates(hospital_a):
    first = _put(hospital_a).json()["logoUrl"]
    second = _put(hospital_a, name="new-logo.png").json()["logoUrl"]
    assert second != first, "a fresh id is minted per upload"
    assert hospital_a.get(SETTINGS).json()["profile"]["logoUrl"] == second


def test_a_logo_must_be_an_image(hospital_a):
    """The document allowlist takes PDFs; an <img> on every page does not."""
    response = _put(hospital_a, name="scan.pdf", content_type="application/pdf")
    assert response.status_code == 415, response.text


def test_removing_the_logo_clears_it(hospital_a):
    _put(hospital_a)
    removed = hospital_a.delete(LOGO)
    assert removed.status_code == 200, removed.text
    assert removed.json()["logoUrl"] == ""
    assert hospital_a.get(SETTINGS).json()["profile"]["logoUrl"] == ""


def test_removing_a_logo_that_is_not_there_is_a_404(hospital_a):
    hospital_a.delete(LOGO)
    assert hospital_a.delete(LOGO).status_code == 404


def test_the_logo_is_public_because_the_login_page_needs_it(client, hospital_a):
    """No Authorization header at all — this is the pre-login case."""
    _put(hospital_a)
    response = client.get(
        "/hospitals/current", headers={"X-Hospital-Id": hospital_a.id}
    )
    assert response.status_code == 200, response.text
    assert response.json()["logoUrl"], "a tenant's login page cannot brand itself without this"


def test_one_hospital_does_not_get_anothers_logo(client, hospital_a, hospital_b):
    _put(hospital_a)
    a = client.get("/hospitals/current", headers={"X-Hospital-Id": hospital_a.id}).json()
    b = client.get("/hospitals/current", headers={"X-Hospital-Id": hospital_b.id}).json()
    assert a["logoUrl"]
    assert a["logoUrl"] != b.get("logoUrl", "")


def test_a_nurse_cannot_change_the_logo(hospital_a):
    """Branding is the admin's, not everyone with a login."""
    response = _put(hospital_a, token=hospital_a.nurse_token)
    assert response.status_code == 403, response.text

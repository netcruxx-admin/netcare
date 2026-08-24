"""The bill a patient can print, assembled server-side.

This endpoint exists because a bill needs the hospital's legal name and GSTIN,
and those are exactly what `GET /hospitals/current` stopped serving when it was
narrowed — that one is unauthenticated. A patient reading their own bill is
signed in, so the answer belongs behind a permission rather than in a public
response everyone can read.
"""

import io

from tests.conftest import REQUIRED_CONSENTS


def _seed_seller(tenant):
    tenant.patch("/hospitals/me/settings", json={
        "addressLine1": "42 Health Road", "city": "Pune",
        "state": "Maharashtra", "pincode": "411001",
        "phonePrimary": "9812345678", "email": "billing@example.com",
    })
    tenant.client.put(
        "/hospitals/me/letterhead",
        headers=tenant.headers(),
        files={"file": ("lh.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 64), "image/png")},
    )


def _a_payment(tenant) -> dict:
    appointment = tenant.get("/appointments").json()[0]
    response = tenant.post("/payments", json={
        "appointmentId": appointment["id"],
        "patientId": appointment["patientId"],
        "amount": 500,
        "status": "completed",
        "paymentMethod": "cash",
    })
    assert response.status_code == 201, response.text
    return response.json()


def test_the_bill_carries_the_seller_the_public_endpoint_will_not(hospital_a):
    _seed_seller(hospital_a)
    payment = _a_payment(hospital_a)

    invoice = hospital_a.get(f"/payments/{payment['id']}/invoice")
    assert invoice.status_code == 200, invoice.text
    seller = invoice.json()["seller"]
    assert seller["name"]
    assert "Pune" in seller["address"]
    assert seller["phone"] == "9812345678"
    assert seller["letterheadUrl"], "the letterhead is what gets printed on top"


def test_it_totals_and_describes_the_charge(hospital_a):
    payment = _a_payment(hospital_a)
    body = hospital_a.get(f"/payments/{payment['id']}/invoice").json()
    assert body["total"] == 500
    assert len(body["lines"]) == 1
    assert body["lines"][0]["amount"] == 500
    assert "Consultation" in body["lines"][0]["description"]
    assert body["number"].startswith("INV-")


def test_a_patient_can_read_their_own_bill(client, hospital_a):
    """The whole point — this is a patient-facing document."""
    payment = _a_payment(hospital_a)
    response = client.get(
        f"/payments/{payment['id']}/invoice",
        headers=hospital_a.headers(hospital_a.ids["patient_token"]),
    )
    assert response.status_code == 200, response.text
    assert response.json()["seller"]["gstin"] is not None


def test_a_bill_that_is_not_yours_is_not_found(client, hospital_a):
    """404 rather than 403 — a 403 would confirm the payment exists."""
    payment = _a_payment(hospital_a)
    stranger = client.post(
        "/auth/register",
        headers={"X-Hospital-Id": hospital_a.id},
        json={
            "name": "Someone Else", "email": "stranger@invoice.test",
            "password": "Passw0rd!test", "phone": "9000000111",
            "role": "patient", "dateOfBirth": "1990-01-01",
            "consents": REQUIRED_CONSENTS,
        },
    )
    assert stranger.status_code == 200, stranger.text

    other = client.get(
        f"/payments/{payment['id']}/invoice",
        headers=hospital_a.headers(stranger.json()["token"]),
    )
    assert other.status_code == 404, other.text


def test_another_hospitals_bill_is_not_found(hospital_a, hospital_b):
    payment = _a_payment(hospital_a)
    assert hospital_b.get(f"/payments/{payment['id']}/invoice").status_code == 404

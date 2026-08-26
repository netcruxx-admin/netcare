"""One Razorpay payment can only ever buy one appointment.

A Razorpay signature is a deterministic HMAC over `<order_id>|<payment_id>`, so
it never expires. Verification alone therefore proves the payment was genuine,
not that it has not already been spent — which is the distinction this file
exists to hold.

`/payments/verify` does no network call (the HMAC is computed locally), so the
whole flow is testable offline with a secret we set ourselves.
"""

import hashlib
import hmac

SECRET = "test_secret_key_abc123"
VERIFY = "/payments/verify"


def _signature(order_id: str, payment_id: str, secret: str = SECRET) -> str:
    return hmac.new(
        secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()


def _configure_gateway(tenant):
    response = tenant.put(
        "/hospitals/me/razorpay",
        json={"keyId": "rzp_test_x", "keySecret": SECRET},
    )
    assert response.status_code == 200, response.text


def _booking(tenant, order_id: str, payment_id: str) -> dict:
    return {
        "razorpayOrderId": order_id,
        "razorpayPaymentId": payment_id,
        "razorpaySignature": _signature(order_id, payment_id),
        "doctorId": tenant.get("/doctors").json()[0]["id"],
        "patientId": tenant.get("/patients").json()[0]["id"],
        "departmentId": tenant.get("/departments").json()[0]["id"],
        "date": "2030-06-06",
        "time": "10:00",
        "reason": "Follow-up",
    }


def test_a_forged_signature_is_refused(hospital_a):
    _configure_gateway(hospital_a)
    body = dict(_booking(hospital_a, "order_F", "pay_F"), razorpaySignature="deadbeef")
    assert hospital_a.post(VERIFY, json=body).status_code == 400


def test_a_replay_does_not_buy_a_second_appointment(hospital_a):
    """Three POSTs of one checkout response used to make three bookings."""
    _configure_gateway(hospital_a)
    body = _booking(hospital_a, "order_R1", "pay_R1")

    before = len(hospital_a.get("/appointments").json())
    first = hospital_a.post(VERIFY, json=body)
    assert first.status_code == 201, first.text

    for _ in range(2):
        again = hospital_a.post(VERIFY, json=body)
        assert again.status_code in (200, 201), again.text

    after = len(hospital_a.get("/appointments").json())
    assert after == before + 1, f"one payment produced {after - before} appointments"


def test_a_replay_returns_the_booking_it_already_bought(hospital_a):
    """Not an error: the gateway retries, and users double-click.

    Telling someone their completed payment failed is worse than telling them
    what it bought.
    """
    _configure_gateway(hospital_a)
    body = _booking(hospital_a, "order_R2", "pay_R2")

    first = hospital_a.post(VERIFY, json=body).json()
    repeat = hospital_a.post(VERIFY, json=body).json()

    assert repeat["appointment"]["id"] == first["appointment"]["id"]
    assert repeat["payment"]["id"] == first["payment"]["id"]


def test_only_one_payment_row_is_recorded(hospital_a):
    _configure_gateway(hospital_a)
    body = _booking(hospital_a, "order_R3", "pay_R3")
    hospital_a.post(VERIFY, json=body)
    hospital_a.post(VERIFY, json=body)

    rows = hospital_a.get("/payments").json()
    mine = [p for p in rows if p.get("gatewayPaymentId") == "pay_R3"]
    assert len(mine) == 1, f"{len(mine)} payment rows for one gateway payment"


def test_a_different_payment_still_books(hospital_a):
    """The guard keys on the payment id, not on the patient or the slot."""
    _configure_gateway(hospital_a)
    hospital_a.post(VERIFY, json=_booking(hospital_a, "order_A", "pay_A"))
    second = hospital_a.post(VERIFY, json=_booking(hospital_a, "order_B", "pay_B"))
    assert second.status_code == 201, second.text


def test_one_hospitals_payment_id_does_not_block_anothers(hospital_a, hospital_b):
    """The lookup is tenant-scoped, so two hospitals cannot collide."""
    _configure_gateway(hospital_a)
    _configure_gateway(hospital_b)
    a = hospital_a.post(VERIFY, json=_booking(hospital_a, "order_S", "pay_SHARED_A"))
    b = hospital_b.post(VERIFY, json=_booking(hospital_b, "order_S", "pay_SHARED_B"))
    assert a.status_code == 201, a.text
    assert b.status_code == 201, b.text

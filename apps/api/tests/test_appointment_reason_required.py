"""An appointment has to say why.

Three request bodies create appointments: the direct one, and the two halves of
the online payment flow. A rule enforced on only one of them is not a rule —
the payment path would be a way around it — so this checks all three.
"""

import hashlib
import hmac

SECRET = "test_secret_key_abc123"


def _base(tenant) -> dict:
    return {
        "patientId": tenant.get("/patients").json()[0]["id"],
        "doctorId": tenant.get("/doctors").json()[0]["id"],
        "departmentId": tenant.get("/departments").json()[0]["id"],
        "date": "2030-07-07",
        "time": "09:30",
    }


def test_booking_without_a_reason_is_refused(hospital_a):
    response = hospital_a.post("/appointments", json=_base(hospital_a))
    assert response.status_code == 422, response.text


def test_a_blank_reason_is_refused(hospital_a):
    """Whitespace is not an answer."""
    response = hospital_a.post("/appointments", json=dict(_base(hospital_a), reason="   "))
    assert response.status_code == 422, response.text


def test_a_reason_is_kept_verbatim_minus_surrounding_space(hospital_a):
    response = hospital_a.post(
        "/appointments", json=dict(_base(hospital_a), reason="  Chest pain  ")
    )
    assert response.status_code == 201, response.text
    assert response.json()["reason"] == "Chest pain"


def test_the_payment_path_cannot_skip_it(hospital_a):
    """Both halves of the online flow, since either would be a way round."""
    initiate = hospital_a.post("/payments/initiate", json=_base(hospital_a))
    assert initiate.status_code == 422, initiate.text

    order_id, payment_id = "order_NR", "pay_NR"
    signature = hmac.new(
        SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()
    verify = hospital_a.post("/payments/verify", json=dict(
        _base(hospital_a),
        razorpayOrderId=order_id,
        razorpayPaymentId=payment_id,
        razorpaySignature=signature,
    ))
    assert verify.status_code == 422, verify.text

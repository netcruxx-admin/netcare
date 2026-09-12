"""Booking and billing arrive together when the visit is paid for at the desk.

The bill used to be a second request from the browser: book the appointment,
then POST /payments for the pending amount. That worked only for the front desk.
A doctor scheduling a follow-up and a patient booking their own slot both hold
`appointments.create` and no `payments.create`, so their bookings landed with a
403 where the bill should have been — an appointment on the board that the
day-report had no row for.

So `paymentMode` rides on the booking and the server raises the bill itself, in
the same transaction, priced from the hospital's schedule. These tests hold the
three properties that makes worth having: everyone who may book gets a bill,
the amount is the hospital's rather than the caller's, and naming no mode
raises nothing (the online flow writes its own row at /payments/verify).
"""

from tests.conftest import unique_date

FEES = "/consultation-fees"


def _set_fee(tenant, visit_type: str, amount: int) -> None:
    rows = tenant.get(f"{FEES}?includeInactive=true").json()
    fee = next(row for row in rows if row["visitType"] == visit_type)
    response = tenant.put(f"{FEES}/{fee['id']}", json={"amount": amount})
    assert response.status_code == 200, response.text


def _booking(tenant, **overrides) -> dict:
    body = {
        "patientId": tenant.ids["patient"],
        "doctorId": tenant.ids["doctor"],
        "departmentId": tenant.ids["department"],
        "date": unique_date(),
        "time": "11:00 AM",
        "reason": "counter payment test",
    }
    body.update(overrides)
    return body


def _bills(tenant, appointment_id: str) -> list[dict]:
    response = tenant.get(f"/payments?appointmentId={appointment_id}")
    assert response.status_code == 200, response.text
    return response.json()


def test_booking_at_the_counter_raises_the_pending_bill_with_it(hospital_a):
    _set_fee(hospital_a, "new", 700)

    booked = hospital_a.post("/appointments", _booking(hospital_a, paymentMode="cash"))
    assert booked.status_code == 201, booked.text

    bills = _bills(hospital_a, booked.json()["id"])
    assert len(bills) == 1
    assert bills[0]["amount"] == 700
    assert bills[0]["paymentMethod"] == "cash"
    # Pending, not completed: nobody has handed over the money yet.
    assert bills[0]["status"] == "pending"


def test_card_and_upi_are_counter_modes_too(hospital_a):
    """The desk takes more than notes, and the pharmacy counter already knew it."""
    _set_fee(hospital_a, "new", 700)
    for mode in ("card", "upi"):
        booked = hospital_a.post("/appointments", _booking(hospital_a, paymentMode=mode))
        assert booked.status_code == 201, booked.text
        assert _bills(hospital_a, booked.json()["id"])[0]["paymentMethod"] == mode


def test_a_doctor_booking_a_follow_up_gets_a_bill_without_holding_payments_create(hospital_a):
    """The regression this exists for. A doctor may book into their own diary
    and may not raise bills; the follow-up still has to be billable."""
    _set_fee(hospital_a, "follow_up", 300)

    refused = hospital_a.post(
        "/payments",
        {"patientId": hospital_a.ids["patient"], "amount": 300, "paymentMethod": "cash"},
        token=hospital_a.doctor_token,
    )
    assert refused.status_code == 403, refused.text

    booked = hospital_a.post(
        "/appointments",
        _booking(hospital_a, time="11:30 AM", visitType="follow_up", paymentMode="cash"),
        token=hospital_a.doctor_token,
    )
    assert booked.status_code == 201, booked.text

    bills = _bills(hospital_a, booked.json()["id"])
    assert len(bills) == 1
    assert bills[0]["amount"] == 300


def test_a_patient_may_choose_to_pay_at_the_counter(hospital_a):
    """Booking is not conditional on a card: the patient can settle on arrival."""
    _set_fee(hospital_a, "new", 700)

    booked = hospital_a.post(
        "/appointments",
        _booking(hospital_a, time="12:00 PM", paymentMode="upi"),
        token=hospital_a.ids["patient_token"],
    )
    assert booked.status_code == 201, booked.text

    bills = _bills(hospital_a, booked.json()["id"])
    assert len(bills) == 1
    assert bills[0]["amount"] == 700


def test_the_amount_comes_from_the_schedule_not_the_visit_type_named(hospital_a):
    """A cheaper-sounding visit type buys the cheaper price and nothing else —
    the caller never gets to name an amount at all."""
    _set_fee(hospital_a, "new", 700)
    _set_fee(hospital_a, "follow_up", 300)

    booked = hospital_a.post(
        "/appointments",
        _booking(hospital_a, time="02:00 PM", visitType="follow_up", paymentMode="cash"),
    )
    assert booked.status_code == 201, booked.text
    assert _bills(hospital_a, booked.json()["id"])[0]["amount"] == 300


def test_naming_no_mode_raises_no_bill(hospital_a):
    """An online booking bills itself at /payments/verify, once the gateway
    signature has been checked. A second row raised here would double-charge."""
    _set_fee(hospital_a, "new", 700)

    booked = hospital_a.post("/appointments", _booking(hospital_a, time="02:30 PM"))
    assert booked.status_code == 201, booked.text
    assert _bills(hospital_a, booked.json()["id"]) == []


def test_an_unpriced_visit_type_books_without_a_bill(hospital_a):
    """A hospital that has not set its prices can still take bookings. A
    zero-rupee invoice would be a statement about money nobody made."""
    _set_fee(hospital_a, "emergency", 0)

    booked = hospital_a.post(
        "/appointments",
        _booking(hospital_a, time="03:00 PM", visitType="emergency", paymentMode="cash"),
    )
    assert booked.status_code == 201, booked.text
    assert _bills(hospital_a, booked.json()["id"]) == []


def test_a_mode_the_desk_cannot_take_is_refused(hospital_a):
    refused = hospital_a.post(
        "/appointments", _booking(hospital_a, time="03:30 PM", paymentMode="bitcoin")
    )
    assert refused.status_code == 422, refused.text


def test_razorpay_is_not_a_counter_mode(hospital_a):
    """Online is a different flow, not a value of this field: accepting it here
    would write a completed-looking gateway payment with no gateway behind it."""
    refused = hospital_a.post(
        "/appointments", _booking(hospital_a, time="04:00 PM", paymentMode="razorpay")
    )
    assert refused.status_code == 422, refused.text


def test_the_bill_belongs_to_the_hospital_that_took_the_booking(hospital_a, hospital_b):
    _set_fee(hospital_a, "new", 700)

    booked = hospital_a.post("/appointments", _booking(hospital_a, time="04:30 PM", paymentMode="cash"))
    assert booked.status_code == 201, booked.text

    assert _bills(hospital_a, booked.json()["id"])
    assert _bills(hospital_b, booked.json()["id"]) == []

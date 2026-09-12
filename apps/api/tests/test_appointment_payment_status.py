"""Whether a visit is paid for is a fact about the appointment.

The desk works the appointments board, not the payments ledger, so "has this
patient settled" has to be answerable from the appointment itself — without
handing over the ledger to everyone who can read an appointment, and without a
query per row.

The distinction these tests exist to hold is the three-state one: billed and
paid, billed and not paid, and never billed at all. Collapsing the last two
sends the front desk chasing money nobody ever asked for.
"""

from tests.conftest import unique_date

APPOINTMENTS = "/appointments"
FEES = "/consultation-fees"

#: A visit type owned by this file. The seeded three are left alone so a test
#: elsewhere can still assert that provisioning prices nothing on its own.
BILLED = "billing_status_check"


def _priced_visit_type(tenant, amount: float = 600) -> str:
    """This file's own visit type, priced. Idempotent across tests."""
    rows = tenant.get(f"{FEES}?includeInactive=true").json()
    existing = next((row for row in rows if row["visitType"] == BILLED), None)
    if existing is None:
        created = tenant.post(FEES, json={"label": "Billing Status Check",
                                          "visitType": BILLED, "amount": amount})
        assert created.status_code == 201, created.text
        return BILLED
    updated = tenant.put(f"{FEES}/{existing['id']}", json={"amount": amount})
    assert updated.status_code == 200, updated.text
    return BILLED


def _book(tenant, **overrides) -> dict:
    body = {
        "patientId": tenant.ids["patient"],
        "doctorId": tenant.ids["doctor"],
        "departmentId": tenant.ids["department"],
        "date": unique_date(),
        "time": "10:00",
        "reason": "Billing status check",
    }
    body.update(overrides)
    response = tenant.post(APPOINTMENTS, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def _fetch(tenant, appointment_id: str) -> dict:
    response = tenant.get(f"{APPOINTMENTS}/{appointment_id}")
    assert response.status_code == 200, response.text
    return response.json()


def test_a_booking_paid_at_the_counter_reports_its_bill(hospital_a):
    visit_type = _priced_visit_type(hospital_a)
    appointment = _book(hospital_a, visitType=visit_type, paymentMode="cash")

    detail = _fetch(hospital_a, appointment["id"])
    assert detail["paymentStatus"] == "pending"
    assert detail["paymentAmount"] == 600
    assert detail["paymentId"]


def test_an_unbilled_booking_is_not_reported_as_unpaid(hospital_a):
    """No payment mode, no bill — and an empty status, not "pending". A visit
    nobody billed is not a debt."""
    visit_type = _priced_visit_type(hospital_a)
    appointment = _book(hospital_a, visitType=visit_type, time="10:20")

    detail = _fetch(hospital_a, appointment["id"])
    assert detail["paymentStatus"] == ""
    assert detail["paymentAmount"] == 0
    assert detail["paymentId"] == ""


def test_collecting_at_the_desk_flips_the_appointment_to_paid(hospital_a):
    visit_type = _priced_visit_type(hospital_a)
    appointment = _book(hospital_a, visitType=visit_type, time="10:40", paymentMode="cash")
    payment_id = _fetch(hospital_a, appointment["id"])["paymentId"]

    settled = hospital_a.put(
        f"/payments/{payment_id}", json={"status": "completed", "paymentMethod": "cash"}
    )
    assert settled.status_code == 200, settled.text

    detail = _fetch(hospital_a, appointment["id"])
    assert detail["paymentStatus"] == "completed"
    assert detail["paymentMethod"] == "cash"


def test_the_list_reports_the_same_bill_as_the_detail(hospital_a):
    """A screen must not change its mind about a visit when you open it."""
    visit_type = _priced_visit_type(hospital_a)
    appointment = _book(hospital_a, visitType=visit_type, time="11:00", paymentMode="cash")

    listed = hospital_a.get(APPOINTMENTS).json()
    row = next(r for r in listed if r["id"] == appointment["id"])
    assert row["paymentStatus"] == _fetch(hospital_a, appointment["id"])["paymentStatus"]
    assert row["paymentAmount"] == 600


def test_a_doctor_sees_whether_the_visit_is_paid_without_reading_the_ledger(hospital_a):
    """The doctor holds no `payments.read`; the answer still reaches them,
    because it is a fact about their appointment rather than a payment row."""
    visit_type = _priced_visit_type(hospital_a)
    appointment = _book(hospital_a, visitType=visit_type, time="11:20", paymentMode="cash")

    token = hospital_a.doctor_token
    assert hospital_a.get("/payments", token=token).status_code == 403

    detail = hospital_a.get(f"{APPOINTMENTS}/{appointment['id']}", token=token)
    assert detail.status_code == 200, detail.text
    assert detail.json()["paymentStatus"] == "pending"


def test_one_hospitals_bill_never_lands_on_anothers_appointment(hospital_a, hospital_b):
    a_type = _priced_visit_type(hospital_a, 600)
    b_type = _priced_visit_type(hospital_b, 900)
    a = _book(hospital_a, visitType=a_type, time="11:40", paymentMode="cash")
    b = _book(hospital_b, visitType=b_type, time="11:40", paymentMode="cash")

    assert _fetch(hospital_a, a["id"])["paymentAmount"] == 600
    assert _fetch(hospital_b, b["id"])["paymentAmount"] == 900

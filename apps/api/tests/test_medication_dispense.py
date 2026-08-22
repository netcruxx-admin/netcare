"""Dispensing moves stock by what the order is actually for.

It used to deduct exactly one unit whatever the order said, so a ten-tablet
course moved stock by one and inventory drifted from the first dispense. And
when stock was zero the deduction was skipped entirely while the order still
went to `dispensed` — a discrepancy with no inventory row to explain it.
"""

import pytest

from tests.conftest import _superadmin_token


def _stock(tenant, medicine_id: str) -> int:
    rows = tenant.get("/medicines").json()
    return next(r for r in rows if r["id"] == medicine_id)["stock"]


@pytest.fixture
def pharmacy(client, hospital_a):
    """A medicine, an appointment, and the two callers the flow needs."""
    patient = hospital_a.get("/patients").json()[0]
    doctor = hospital_a.get("/doctors").json()[0]
    department = hospital_a.get("/departments").json()[0]
    appointment = hospital_a.post("/appointments", json={
        "patientId": patient["id"], "doctorId": doctor["id"],
        "departmentId": department["id"], "date": "2030-04-04", "time": "10:00",
    }).json()
    return {
        "client": client,
        "tenant": hospital_a,
        "doctor_headers": hospital_a.headers(hospital_a.doctor_token),
        # The pharmacist grant lives on superadmin too; the fixture hospital has
        # no pharmacist account, and who dispenses is not what this file tests.
        "dispenser_headers": {
            "Authorization": f"Bearer {_superadmin_token(client)}",
            "X-Hospital-Id": hospital_a.id,
        },
        "patient": patient,
        "doctor": doctor,
        "appointment": appointment,
    }


def _medicine(pharmacy, *, stock: int, name: str) -> dict:
    return pharmacy["tenant"].post("/medicines", json={
        "name": name, "category": "Antibiotic", "form": "Tablet",
        "strength": "500mg", "price": 10, "stock": stock,
    }).json()


def _order(pharmacy, medicine: dict, *, quantity: int):
    return pharmacy["client"].post("/medication-orders", json={
        "appointmentId": pharmacy["appointment"]["id"],
        "patientId": pharmacy["patient"]["id"],
        "doctorId": pharmacy["doctor"]["id"],
        "medicineId": medicine["id"], "medicineName": medicine["name"],
        "quantity": quantity, "dosage": "500mg", "route": "oral",
        "frequency": "twice daily", "duration": "5 days",
    }, headers=pharmacy["doctor_headers"])


def _dispense(pharmacy, order_id: str):
    return pharmacy["client"].patch(
        f"/medication-orders/{order_id}/dispense", headers=pharmacy["dispenser_headers"]
    )


def test_stock_moves_by_the_quantity_ordered(pharmacy):
    med = _medicine(pharmacy, stock=30, name="Amoxicillin")
    order = _order(pharmacy, med, quantity=10)
    assert order.status_code == 201, order.text

    assert _dispense(pharmacy, order.json()["id"]).status_code == 200
    assert _stock(pharmacy["tenant"], med["id"]) == 20


def test_the_inventory_movement_records_the_same_quantity(pharmacy):
    """The trail has to agree with the shelf, or neither can be trusted."""
    med = _medicine(pharmacy, stock=50, name="Ibuprofen")
    order_id = _order(pharmacy, med, quantity=14).json()["id"]
    _dispense(pharmacy, order_id)

    movements = pharmacy["client"].get(
        "/inventory/movements", headers=pharmacy["dispenser_headers"]
    ).json()
    mine = [m for m in movements if m["referenceId"] == order_id]
    assert len(mine) == 1, "one dispense, one movement"
    assert mine[0]["quantity"] == -14
    assert mine[0]["movementType"] == "dispense"


def test_dispensing_more_than_is_on_the_shelf_is_refused(pharmacy):
    med = _medicine(pharmacy, stock=4, name="Metformin")
    order_id = _order(pharmacy, med, quantity=10).json()["id"]

    response = _dispense(pharmacy, order_id)
    assert response.status_code == 409, response.text
    assert "Only 4 in stock" in response.json()["detail"]


def test_a_refused_dispense_leaves_the_order_pending_and_the_stock_alone(pharmacy):
    """The refusal must be recoverable: restock, then dispense."""
    med = _medicine(pharmacy, stock=4, name="Ranitidine")
    order_id = _order(pharmacy, med, quantity=10).json()["id"]
    _dispense(pharmacy, order_id)

    assert _stock(pharmacy["tenant"], med["id"]) == 4
    orders = pharmacy["client"].get(
        "/medication-orders", headers=pharmacy["dispenser_headers"]
    ).json()
    assert next(o for o in orders if o["id"] == order_id)["status"] == "pending"

    pharmacy["client"].post("/inventory/restock", json={
        "medicineId": med["id"], "quantity": 20,
    }, headers=pharmacy["dispenser_headers"])
    assert _dispense(pharmacy, order_id).status_code == 200
    assert _stock(pharmacy["tenant"], med["id"]) == 14


def test_zero_stock_no_longer_dispenses_silently(pharmacy):
    """The old guard skipped the deduction and still marked it dispensed."""
    med = _medicine(pharmacy, stock=0, name="OutOfStock")
    order_id = _order(pharmacy, med, quantity=1).json()["id"]

    response = _dispense(pharmacy, order_id)
    assert response.status_code == 409, response.text

    movements = pharmacy["client"].get(
        "/inventory/movements", headers=pharmacy["dispenser_headers"]
    ).json()
    assert not [m for m in movements if m["referenceId"] == order_id]


def test_quantity_must_be_at_least_one(pharmacy):
    med = _medicine(pharmacy, stock=10, name="Paracetamol")
    for bad in (0, -5):
        response = _order(pharmacy, med, quantity=bad)
        assert response.status_code == 422, f"quantity={bad} was accepted"


def test_an_order_with_no_catalogued_medicine_still_dispenses(pharmacy):
    """Free-text medicines carry no stock, so there is nothing to check."""
    order = pharmacy["client"].post("/medication-orders", json={
        "appointmentId": pharmacy["appointment"]["id"],
        "patientId": pharmacy["patient"]["id"],
        "doctorId": pharmacy["doctor"]["id"],
        "medicineName": "Something not in the catalogue",
        "quantity": 3, "dosage": "5ml", "route": "oral",
    }, headers=pharmacy["doctor_headers"])
    assert order.status_code == 201, order.text
    assert _dispense(pharmacy, order.json()["id"]).status_code == 200


def test_quantity_defaults_to_one_for_a_caller_that_omits_it(pharmacy):
    """Old clients keep working, and get the behaviour they used to get."""
    med = _medicine(pharmacy, stock=5, name="Cetirizine")
    order = pharmacy["client"].post("/medication-orders", json={
        "appointmentId": pharmacy["appointment"]["id"],
        "patientId": pharmacy["patient"]["id"],
        "doctorId": pharmacy["doctor"]["id"],
        "medicineId": med["id"], "medicineName": med["name"],
        "dosage": "10mg", "route": "oral",
    }, headers=pharmacy["doctor_headers"])
    assert order.status_code == 201, order.text
    assert order.json()["quantity"] == 1
    _dispense(pharmacy, order.json()["id"])
    assert _stock(pharmacy["tenant"], med["id"]) == 4


# ----- Who may raise an order, and in whose name --------------------------


def test_a_pharmacist_may_raise_an_order_if_they_name_the_prescriber(pharmacy):
    """The grant used to be a lie.

    `medication_orders.manage` is held by pharmacist, but the handler refused
    anyone without a Doctor row — so a granted permission returned 403. The
    permission is the authorization; naming the prescriber is a separate
    question, and the answer is a field.
    """
    med = _medicine(pharmacy, stock=10, name="Azithromycin")
    response = pharmacy["client"].post("/medication-orders", json={
        "appointmentId": pharmacy["appointment"]["id"],
        "patientId": pharmacy["patient"]["id"],
        "doctorId": pharmacy["doctor"]["id"],
        "medicineId": med["id"], "medicineName": med["name"],
        "quantity": 2, "dosage": "500mg", "route": "oral",
    }, headers=pharmacy["dispenser_headers"])
    assert response.status_code == 201, response.text
    assert response.json()["doctorId"] == pharmacy["doctor"]["id"]


def test_a_non_doctor_must_say_who_prescribed_it(pharmacy):
    med = _medicine(pharmacy, stock=10, name="Doxycycline")
    response = pharmacy["client"].post("/medication-orders", json={
        "appointmentId": pharmacy["appointment"]["id"],
        "patientId": pharmacy["patient"]["id"],
        "medicineId": med["id"], "medicineName": med["name"],
        "quantity": 2, "dosage": "100mg", "route": "oral",
    }, headers=pharmacy["dispenser_headers"])
    assert response.status_code == 422, response.text
    assert "prescribing doctor" in response.json()["detail"]


def test_a_doctors_own_id_is_written_not_taken_from_the_body(pharmacy):
    """The prescriber is a fact about what happened, not a client claim."""
    med = _medicine(pharmacy, stock=10, name="Cefixime")
    response = pharmacy["client"].post("/medication-orders", json={
        "appointmentId": pharmacy["appointment"]["id"],
        "patientId": pharmacy["patient"]["id"],
        "medicineId": med["id"], "medicineName": med["name"],
        "quantity": 1, "dosage": "200mg", "route": "oral",
    }, headers=pharmacy["doctor_headers"])
    assert response.status_code == 201, response.text
    assert response.json()["doctorId"] == pharmacy["doctor"]["id"]


def test_a_doctor_id_from_another_tenant_is_refused(pharmacy, hospital_b):
    """The tenant guard sees it before the prescriber logic does."""
    med = _medicine(pharmacy, stock=10, name="Ofloxacin")
    other = hospital_b.get("/doctors").json()[0]
    response = pharmacy["client"].post("/medication-orders", json={
        "appointmentId": pharmacy["appointment"]["id"],
        "patientId": pharmacy["patient"]["id"],
        "doctorId": other["id"],
        "medicineId": med["id"], "medicineName": med["name"],
        "quantity": 1, "dosage": "200mg", "route": "oral",
    }, headers=pharmacy["dispenser_headers"])
    assert response.status_code in (403, 404), response.text


# ----- Prescription -> dispense queue --------------------------------------


def _prescription(pharmacy) -> dict:
    response = pharmacy["client"].post("/prescriptions", json={
        "appointmentId": pharmacy["appointment"]["id"],
        "patientId": pharmacy["patient"]["id"],
        "doctorId": pharmacy["doctor"]["id"],
        "medicineName": "Amoxicillin", "dosage": "500mg",
        "frequency": "twice daily", "duration": "5 days",
    }, headers=pharmacy["doctor_headers"])
    assert response.status_code == 201, response.text
    return response.json()


def test_a_prescription_can_be_sent_to_the_dispense_queue(pharmacy):
    med = _medicine(pharmacy, stock=20, name="Amoxicillin")
    rx = _prescription(pharmacy)

    order = pharmacy["client"].post("/medication-orders", json={
        "appointmentId": rx["appointmentId"], "patientId": rx["patientId"],
        "doctorId": rx["doctorId"], "prescriptionId": rx["id"],
        "medicineId": med["id"], "medicineName": rx["medicineName"],
        "quantity": 10, "dosage": rx["dosage"], "route": "oral",
        "frequency": rx["frequency"], "duration": rx["duration"],
    }, headers=pharmacy["dispenser_headers"])
    assert order.status_code == 201, order.text
    assert order.json()["prescriptionId"] == rx["id"]

    assert _dispense(pharmacy, order.json()["id"]).status_code == 200
    assert _stock(pharmacy["tenant"], med["id"]) == 10


def test_the_same_prescription_cannot_be_queued_twice(pharmacy):
    """Otherwise it dispenses twice and takes the stock twice."""
    med = _medicine(pharmacy, stock=40, name="Amoxicillin")
    rx = _prescription(pharmacy)
    payload = {
        "appointmentId": rx["appointmentId"], "patientId": rx["patientId"],
        "doctorId": rx["doctorId"], "prescriptionId": rx["id"],
        "medicineId": med["id"], "medicineName": rx["medicineName"],
        "quantity": 10, "dosage": rx["dosage"], "route": "oral",
    }
    first = pharmacy["client"].post("/medication-orders", json=payload, headers=pharmacy["dispenser_headers"])
    assert first.status_code == 201, first.text

    second = pharmacy["client"].post("/medication-orders", json=payload, headers=pharmacy["dispenser_headers"])
    assert second.status_code == 409, second.text
    assert "already in the dispense queue" in second.json()["detail"]


def test_a_cancelled_order_frees_the_prescription_to_be_queued_again(pharmacy):
    med = _medicine(pharmacy, stock=40, name="Amoxicillin")
    rx = _prescription(pharmacy)
    payload = {
        "appointmentId": rx["appointmentId"], "patientId": rx["patientId"],
        "doctorId": rx["doctorId"], "prescriptionId": rx["id"],
        "medicineId": med["id"], "medicineName": rx["medicineName"],
        "quantity": 5, "dosage": rx["dosage"], "route": "oral",
    }
    first = pharmacy["client"].post("/medication-orders", json=payload, headers=pharmacy["dispenser_headers"]).json()
    pharmacy["client"].patch(
        f"/medication-orders/{first['id']}/cancel", headers=pharmacy["dispenser_headers"]
    )

    again = pharmacy["client"].post("/medication-orders", json=payload, headers=pharmacy["dispenser_headers"])
    assert again.status_code == 201, again.text


# ----- Expiry ---------------------------------------------------------------


def test_expired_stock_cannot_be_dispensed(pharmacy):
    med = pharmacy["tenant"].post("/medicines", json={
        "name": "OldStock", "category": "Antibiotic", "form": "Tablet",
        "strength": "500mg", "price": 10, "stock": 50,
        "expiryDate": "2020-01-01",
    }).json()
    order_id = _order(pharmacy, med, quantity=2).json()["id"]

    response = _dispense(pharmacy, order_id)
    assert response.status_code == 409, response.text
    assert "expired" in response.json()["detail"]
    assert _stock(pharmacy["tenant"], med["id"]) == 50


def test_stock_with_no_recorded_expiry_still_dispenses(pharmacy):
    """A blank expiry means nobody recorded one, not that it has passed."""
    med = _medicine(pharmacy, stock=10, name="NoExpiryRecorded")
    order_id = _order(pharmacy, med, quantity=2).json()["id"]
    assert _dispense(pharmacy, order_id).status_code == 200


def test_stock_expiring_in_the_future_dispenses(pharmacy):
    med = pharmacy["tenant"].post("/medicines", json={
        "name": "FreshStock", "category": "Antibiotic", "form": "Tablet",
        "strength": "500mg", "price": 10, "stock": 10,
        "expiryDate": "2099-12-31",
    }).json()
    order_id = _order(pharmacy, med, quantity=2).json()["id"]
    assert _dispense(pharmacy, order_id).status_code == 200


# ----- Inventory arithmetic -------------------------------------------------


def test_a_negative_restock_is_refused(pharmacy):
    """It drove stock to -90 and filed it under `restock`.

    Stock below zero makes low-stock lists and valuation meaningless, and a
    movement labelled `restock` that removed stock is a trail saying the
    opposite of what happened. Removing stock is an adjustment.
    """
    med = _medicine(pharmacy, stock=10, name="ProbeDrug")
    response = pharmacy["client"].post("/inventory/restock", json={
        "medicineId": med["id"], "quantity": -100,
    }, headers=pharmacy["dispenser_headers"])
    assert response.status_code == 422, response.text
    assert _stock(pharmacy["tenant"], med["id"]) == 10


def test_a_restock_of_zero_is_refused(pharmacy):
    med = _medicine(pharmacy, stock=10, name="ZeroRestock")
    response = pharmacy["client"].post("/inventory/restock", json={
        "medicineId": med["id"], "quantity": 0,
    }, headers=pharmacy["dispenser_headers"])
    assert response.status_code == 422, response.text


def test_a_write_off_is_an_adjustment_and_floors_at_zero(pharmacy):
    """The supported way to remove stock, and it says which kind."""
    med = _medicine(pharmacy, stock=10, name="Expired")
    response = pharmacy["client"].post("/inventory/adjust", json={
        "medicineId": med["id"], "quantity": -100,
        "movementType": "expired", "notes": "past expiry",
    }, headers=pharmacy["dispenser_headers"])
    assert response.status_code == 201, response.text
    assert _stock(pharmacy["tenant"], med["id"]) == 0


def test_an_adjustment_of_zero_is_refused(pharmacy):
    med = _medicine(pharmacy, stock=10, name="NoOpAdjust")
    response = pharmacy["client"].post("/inventory/adjust", json={
        "medicineId": med["id"], "quantity": 0, "movementType": "adjustment",
    }, headers=pharmacy["dispenser_headers"])
    assert response.status_code == 422, response.text

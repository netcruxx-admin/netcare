"""Injection orders: a doctor orders a shot, a nurse gives it, and the shot
being given is what moves stock.

The injection mirror of the medication-order flow, minus the pharmacist
dispense in the middle — so the guards that used to live on `dispense` (short
stock, expired stock, recoverable refusal) live on `administer` here.
"""

import pytest

from tests.conftest import _superadmin_token, unique_date


@pytest.fixture
def ward(client, hospital_a):
    """A patient, an appointment, and the callers the flow needs."""
    patient = hospital_a.get("/patients").json()[0]
    doctor = hospital_a.get("/doctors").json()[0]
    department = hospital_a.get("/departments").json()[0]
    appointment = hospital_a.post("/appointments", json={
        "patientId": patient["id"], "doctorId": doctor["id"],
        "departmentId": department["id"], "date": unique_date(), "time": "11:00",
        "reason": "Routine consultation",
    }).json()
    return {
        "client": client,
        "tenant": hospital_a,
        "doctor_token": hospital_a.doctor_token,
        "nurse_token": hospital_a.nurse_token,
        # The pharmacist/superadmin grants overlap; the fixture hospital has no
        # pharmacist account and who stocks the shelf is not what this file tests.
        "super_headers": {
            "Authorization": f"Bearer {_superadmin_token(client)}",
            "X-Hospital-Id": hospital_a.id,
        },
        "patient": patient,
        "doctor": doctor,
        "appointment": appointment,
    }


def _injectable(ward, *, stock: int, name: str, expiry: str = "") -> dict:
    body = {
        "name": name, "category": "Vaccine", "form": "vial",
        "strength": "0.5 mL", "route": "IM", "price": 250, "stock": stock,
        "unit": "vial",
    }
    if expiry:
        body["expiryDate"] = expiry
    r = ward["tenant"].post("/injectables", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _order(ward, *, injectable=None, name="Tetanus toxoid", quantity=1, token=None):
    body = {
        "appointmentId": ward["appointment"]["id"],
        "patientId": ward["patient"]["id"],
        "injectableName": name,
        "dose": "0.5 mL", "route": "IM", "quantity": quantity,
    }
    if injectable is not None:
        body["injectableId"] = injectable["id"]
        body["injectableName"] = injectable["name"]
    return ward["client"].post(
        "/injection-orders", json=body,
        headers=ward["tenant"].headers(token or ward["doctor_token"]),
    )


def _administer(ward, order_id, *, site="Left deltoid", token=None, **extra):
    return ward["client"].patch(
        f"/injection-orders/{order_id}/administer",
        json={"site": site, **extra},
        headers=ward["tenant"].headers(token or ward["nurse_token"]),
    )


def _stock(ward, injectable_id) -> int:
    rows = ward["tenant"].get("/injectables").json()
    return next(r for r in rows if r["id"] == injectable_id)["stock"]


# ── Happy path ─────────────────────────────────────────────────────────────

def test_ordering_then_administering_gives_the_shot_and_moves_stock(ward):
    item = _injectable(ward, stock=10, name="HappyPath")
    order = _order(ward, injectable=item, quantity=2)
    assert order.status_code == 201, order.text
    assert order.json()["status"] == "ordered"
    assert order.json()["doctorId"] == ward["doctor"]["id"]

    done = _administer(ward, order.json()["id"], notes="tolerated well")
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["status"] == "administered"
    assert body["site"] == "Left deltoid"
    assert body["administeredAt"]
    assert body["administeredByName"]
    assert _stock(ward, item["id"]) == 8


def test_the_stock_movement_records_the_administration(ward):
    item = _injectable(ward, stock=5, name="LedgerCheck")
    order_id = _order(ward, injectable=item, quantity=1).json()["id"]
    _administer(ward, order_id)

    movements = ward["client"].get(
        "/injectables/stock/movements", headers=ward["super_headers"]
    ).json()
    mine = [m for m in movements if m["referenceId"] == order_id]
    assert len(mine) == 1
    assert mine[0]["quantity"] == -1
    assert mine[0]["movementType"] == "administer"


def test_a_free_text_shot_is_recorded_but_moves_no_stock(ward):
    order = _order(ward, name="Something from the ward fridge", quantity=1)
    assert order.status_code == 201, order.text
    done = _administer(ward, order.json()["id"])
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "administered"


# ── Guards on administration ───────────────────────────────────────────────

def test_the_injection_site_is_required(ward):
    item = _injectable(ward, stock=5, name="NeedsSite")
    order_id = _order(ward, injectable=item).json()["id"]
    r = _administer(ward, order_id, site="   ")
    assert r.status_code == 422, r.text
    assert "site" in r.json()["detail"].lower()


def test_short_stock_is_refused_and_recoverable(ward):
    item = _injectable(ward, stock=1, name="ShortShelf")
    order_id = _order(ward, injectable=item, quantity=3).json()["id"]

    refused = _administer(ward, order_id)
    assert refused.status_code == 409, refused.text
    assert "Only 1 in stock" in refused.json()["detail"]
    assert _stock(ward, item["id"]) == 1
    # Still administerable once restocked.
    orders = ward["client"].get(
        "/injection-orders", headers=ward["super_headers"]
    ).json()
    assert next(o for o in orders if o["id"] == order_id)["status"] == "ordered"

    ward["client"].post("/injectables/stock/restock", json={
        "injectableId": item["id"], "quantity": 10,
    }, headers=ward["super_headers"])
    assert _administer(ward, order_id).status_code == 200
    assert _stock(ward, item["id"]) == 8


def test_expired_stock_cannot_be_given(ward):
    item = _injectable(ward, stock=10, name="OldVial", expiry="2020-01-01")
    order_id = _order(ward, injectable=item, quantity=1).json()["id"]
    r = _administer(ward, order_id)
    assert r.status_code == 409, r.text
    assert "expired" in r.json()["detail"]
    assert _stock(ward, item["id"]) == 10


def test_a_shot_cannot_be_administered_twice(ward):
    item = _injectable(ward, stock=10, name="OnceOnly")
    order_id = _order(ward, injectable=item, quantity=1).json()["id"]
    assert _administer(ward, order_id).status_code == 200
    again = _administer(ward, order_id)
    assert again.status_code == 409, again.text
    assert _stock(ward, item["id"]) == 9


# ── Ordering ──────────────────────────────────────────────────────────────

def test_quantity_must_be_at_least_one(ward):
    item = _injectable(ward, stock=10, name="BadQty")
    for bad in (0, -2):
        r = _order(ward, injectable=item, quantity=bad)
        assert r.status_code == 422, f"quantity={bad} was accepted"


def test_cancel_then_it_cannot_be_given(ward):
    item = _injectable(ward, stock=10, name="Cancelled")
    order_id = _order(ward, injectable=item).json()["id"]
    cancelled = ward["client"].patch(
        f"/injection-orders/{order_id}/cancel", headers=ward["super_headers"]
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    assert _administer(ward, order_id).status_code == 409
    assert _stock(ward, item["id"]) == 10


# ── Authorization ─────────────────────────────────────────────────────────

def test_a_nurse_cannot_order_a_shot(ward):
    item = _injectable(ward, stock=10, name="NurseOrder")
    r = _order(ward, injectable=item, token=ward["nurse_token"])
    assert r.status_code == 403, r.text


def test_a_doctor_cannot_administer(ward):
    item = _injectable(ward, stock=10, name="DoctorAdminister")
    order_id = _order(ward, injectable=item).json()["id"]
    r = _administer(ward, order_id, token=ward["doctor_token"])
    assert r.status_code == 403, r.text


def test_deleting_an_order_is_platform_only(ward):
    item = _injectable(ward, stock=10, name="DeleteMe")
    order_id = _order(ward, injectable=item).json()["id"]
    # Hospital admin holds injection_orders read but not delete.
    denied = ward["tenant"].delete(f"/injection-orders/{order_id}")
    assert denied.status_code == 403, denied.text
    ok = ward["client"].delete(
        f"/injection-orders/{order_id}", headers=ward["super_headers"]
    )
    assert ok.status_code == 204, ok.text


# ── Tenant isolation ─────────────────────────────────────────────────────

def test_an_injectable_from_another_tenant_is_refused(ward, hospital_b):
    other = hospital_b.post("/injectables", json={
        "name": "OtherHospitalVial", "form": "vial", "stock": 10,
    }).json()
    r = ward["client"].post("/injection-orders", json={
        "patientId": ward["patient"]["id"],
        "injectableId": other["id"], "injectableName": other["name"],
        "dose": "1 mL", "route": "IM", "quantity": 1,
    }, headers=ward["tenant"].headers(ward["doctor_token"]))
    assert r.status_code in (403, 404), r.text


def test_orders_do_not_leak_across_tenants(ward, hospital_b):
    item = _injectable(ward, stock=5, name="NoLeak")
    order_id = _order(ward, injectable=item).json()["id"]
    visible = hospital_b.read("/injection-orders").json()
    assert all(o["id"] != order_id for o in visible)

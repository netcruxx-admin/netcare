"""How an IPD stay is paid for: billing_mode, and the advance it collects.

An admission records whether it is settled up front ("advance" — the patient
pays on admission) or later ("credit"). payer_type used to sit alongside it
and was dropped in a6e02f4b8d17: nothing ever read it, so it was a field the
desk filled in that never reached a decision.

The parts worth pinning down are the ones that would be easy to get quietly
wrong:

* **The advance is a real deposit, not a decorative number.** It becomes a
  Payment against the stay (``ipd_payment``, purpose "deposit"), so the bill's
  paidTotal and balanceDue are right from the moment the stay opens. It is
  deliberately *not* a column on Admission: a stored second copy would drift
  from the payments the bill actually adds up.
* **Collecting money is a different capability from admitting.** A doctor
  holds admissions.create but not ipd_billing.manage, so they may admit on
  credit and must not be able to take an advance through this door.
"""

import pytest

from app.utils import new_id


def _bed(tenant, tag: str) -> str:
    bed = tenant.post(
        "/beds", {"wardId": tenant.ids["ward"], "bedNumber": f"bm-{tag}", "dailyRate": 1000}
    )
    assert bed.status_code == 201, bed.text
    return bed.json()["id"]


def _admit(tenant, tag: str, token=None, **extra):
    body = {
        "patientId": tenant.ids["patient"],
        "doctorId": tenant.ids["doctor"],
        "bedId": _bed(tenant, tag),
        "provisionalDiagnosis": f"billing mode {tag}",
    }
    body.update(extra)
    return tenant.post("/admissions", body, token=token)


# ---------------------------------------------------------------------------
# The two modes
# ---------------------------------------------------------------------------


def test_an_advance_admission_records_the_money_as_a_deposit(hospital_c):
    response = _admit(hospital_c, new_id("a"), billingMode="advance", advanceAmount=10000)
    assert response.status_code == 201, response.text
    admission = response.json()
    assert admission["billingMode"] == "advance"

    bill = hospital_c.get(f"/admissions/{admission['id']}/bill")
    assert bill.status_code == 200, bill.text
    body = bill.json()
    # The advance counts as money received the moment the stay opens.
    assert body["paidTotal"] == 10000
    deposits = [line for line in body["lines"] if line["source"] == "payment"]
    assert len(deposits) == 1
    assert deposits[0]["amount"] == 10000
    assert deposits[0]["paid"] is True
    # A deposit is money received, not a new charge, so it must not inflate
    # what is owed — the same rule compute_bill applies to every ipd_payment.
    assert body["grandTotal"] == body["roomTotal"]
    assert body["balanceDue"] == body["grandTotal"] - 10000


def test_a_credit_admission_takes_no_money_and_owes_the_full_bill(hospital_c):
    response = _admit(hospital_c, new_id("c"), billingMode="credit")
    assert response.status_code == 201, response.text
    admission = response.json()
    assert admission["billingMode"] == "credit"

    body = hospital_c.get(f"/admissions/{admission['id']}/bill").json()
    assert body["paidTotal"] == 0
    assert body["balanceDue"] == body["grandTotal"]


def test_omitting_the_mode_gives_credit_and_changes_nothing(hospital_c):
    """Every existing caller keeps working: an admission that says nothing
    about payment is exactly what it has always been — nothing collected."""
    response = _admit(hospital_c, new_id("d"))
    assert response.status_code == 201, response.text
    assert response.json()["billingMode"] == "credit"
    assert hospital_c.get(f"/admissions/{response.json()['id']}/bill").json()["paidTotal"] == 0


def test_payer_type_is_gone_from_the_admission(hospital_c):
    """Dropped in a6e02f4b8d17 — not merely hidden on the form."""
    response = _admit(hospital_c, new_id("np"))
    assert response.status_code == 201, response.text
    assert "payerType" not in response.json()


def test_a_payer_type_sent_by_an_old_client_is_ignored_not_stored(hospital_c):
    """CamelModel ignores unknown fields, so a stale caller still admits
    rather than breaking — the value simply goes nowhere."""
    response = _admit(hospital_c, new_id("op"), payerType="insurance")
    assert response.status_code == 201, response.text
    assert "payerType" not in response.json()


# ---------------------------------------------------------------------------
# The advance amount
# ---------------------------------------------------------------------------


def test_an_advance_needs_an_amount(hospital_c):
    response = _admit(hospital_c, new_id("n"), billingMode="advance")
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("amount", [0, -100])
def test_an_advance_amount_must_be_positive(hospital_c, amount):
    response = _admit(hospital_c, new_id("z"), billingMode="advance", advanceAmount=amount)
    assert response.status_code == 422, response.text


def test_an_amount_on_a_credit_stay_is_refused_not_dropped(hospital_c):
    """Silently discarding money somebody typed in is the worst option."""
    response = _admit(hospital_c, new_id("x"), billingMode="credit", advanceAmount=500)
    assert response.status_code == 422, response.text


def test_an_unknown_billing_mode_is_refused(hospital_c):
    response = _admit(hospital_c, new_id("u"), billingMode="partial")
    assert response.status_code == 422, response.text


def test_a_refused_admission_leaves_no_bed_occupied(hospital_c):
    """The whole request fails together — a rejected advance must not leave a
    bed marked occupied by an admission that was never created."""
    bed_id = _bed(hospital_c, new_id("r"))
    refused = hospital_c.post(
        "/admissions",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "bedId": bed_id,
            "billingMode": "credit",
            "advanceAmount": 500,
        },
    )
    assert refused.status_code == 422, refused.text
    beds = hospital_c.get("/beds", params={"limit": 200}).json()
    assert next(b for b in beds if b["id"] == bed_id)["status"] == "vacant"


# ---------------------------------------------------------------------------
# Collecting money is its own capability
# ---------------------------------------------------------------------------


def test_a_doctor_can_still_admit_on_credit(hospital_c):
    """The split must not cost them the rest of the job."""
    response = _admit(
        hospital_c, new_id("dc"), token=hospital_c.doctor_token, billingMode="credit"
    )
    assert response.status_code == 201, response.text
    assert response.json()["billingMode"] == "credit"


def test_a_doctor_cannot_take_an_advance(hospital_c):
    """A doctor holds admissions.create but not ipd_billing.manage, so the
    money half of this endpoint is closed to them."""
    response = _admit(
        hospital_c,
        new_id("da"),
        token=hospital_c.doctor_token,
        billingMode="advance",
        advanceAmount=5000,
    )
    assert response.status_code == 403, response.text


def test_the_refused_advance_admitted_nobody(hospital_c):
    admissions = hospital_c.read("/admissions", params={"limit": 200}).json()
    assert [a for a in admissions if a["provisionalDiagnosis"].startswith("billing mode da")] == []


# ---------------------------------------------------------------------------
# Edits
# ---------------------------------------------------------------------------


def test_a_stay_can_be_moved_to_credit_afterwards(hospital_c):
    admission = _admit(
        hospital_c, new_id("e3"), billingMode="advance", advanceAmount=1000
    ).json()

    updated = hospital_c.put(f"/admissions/{admission['id']}", {"billingMode": "credit"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["billingMode"] == "credit"
    # The advance already collected is untouched by the edit — money received
    # is not revised by changing the stay's shape.
    assert hospital_c.get(f"/admissions/{admission['id']}/bill").json()["paidTotal"] == 1000


# ---------------------------------------------------------------------------
# Tenancy
# ---------------------------------------------------------------------------


def test_the_deposit_belongs_to_the_admitting_tenant_only(hospital_c, hospital_d):
    admission = _admit(
        hospital_c, new_id("t"), billingMode="advance", advanceAmount=7000
    ).json()

    assert hospital_d.get(f"/admissions/{admission['id']}/bill").status_code == 404
    assert hospital_c.get(f"/admissions/{admission['id']}/bill").json()["paidTotal"] == 7000

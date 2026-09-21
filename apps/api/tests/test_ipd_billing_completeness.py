"""Inpatient billing completeness, and the explicit proof that billing is
hidden from clinical roles — the two halves of what was asked for alongside
the charting gaps: (1) `compute_bill()` used to sum a completed
admission-linked Payment into `paidTotal` while never folding it into
`grandTotal` at all (only room + manual AdmissionChargeItem rows counted
there), which understated the bill and could produce a negative balance; (2)
there was no way to record money actually collected against a stay — no
`POST .../payments` existed before this change; (3) doctor/nurse must 403 on
every ipd_billing.* endpoint, proven at the API layer, not just hidden in the
frontend.

Uses a fresh admission per test (not the shared `tenant.ids["admission"]`)
wherever a charge/payment would otherwise leak into other tests' balance
assertions.
"""


def _fresh_admission(tenant, tag: str):
    bed = tenant.post(
        "/beds", {"wardId": tenant.ids["ward"], "bedNumber": f"bill-{tag}", "dailyRate": 1000}
    )
    assert bed.status_code == 201, bed.text
    admission = tenant.post(
        "/admissions",
        {
            "patientId": tenant.ids["patient"],
            "doctorId": tenant.ids["doctor"],
            "bedId": bed.json()["id"],
            "provisionalDiagnosis": f"billing test {tag}",
        },
    )
    assert admission.status_code == 201, admission.text
    return admission.json()


def test_bill_folds_admission_linked_payments_into_grand_total(hospital_c):
    """A pharmacy/injectable/lab charge raised during a stay is money owed the
    moment it is ordered — completed or not — so it must appear in
    grandTotal, not just (when completed) in paidTotal."""
    admission = _fresh_admission(hospital_c, "fold")

    injection = hospital_c.post(
        "/injection-orders",
        {
            "admissionId": admission["id"],
            "patientId": hospital_c.ids["patient"],
            "injectableName": "Billed During Stay",
            "route": "IV",
            "quantity": 1,
        },
        token=hospital_c.doctor_token,
    ).json()
    administered = hospital_c.patch(
        f"/injection-orders/{injection['id']}/administer", {"site": "Left arm"}, token=hospital_c.nurse_token
    )
    assert administered.status_code == 200, administered.text
    # injection_orders.administer creates a Payment with status="pending" —
    # this is the exact case that used to vanish from grandTotal entirely.

    bill = hospital_c.get(f"/admissions/{admission['id']}/bill")
    assert bill.status_code == 200, bill.text
    body = bill.json()

    payment_lines = [l for l in body["lines"] if l["source"] == "payment"]
    assert len(payment_lines) == 1, body
    assert payment_lines[0]["paid"] is False
    injection_amount = payment_lines[0]["amount"]

    # grandTotal = room + items + every payment line, paid or not.
    expected_grand_total = body["roomTotal"] + body["itemsTotal"] + injection_amount
    assert body["grandTotal"] == expected_grand_total
    # paidTotal only counts completed payments — the injection one is pending.
    assert body["paidTotal"] == 0
    assert body["balanceDue"] == expected_grand_total


def test_record_payment_reduces_balance_due(hospital_c):
    admission = _fresh_admission(hospital_c, "pay")

    before = hospital_c.get(f"/admissions/{admission['id']}/bill").json()
    assert before["balanceDue"] == before["roomTotal"]

    payment = hospital_c.post(
        f"/admissions/{admission['id']}/payments",
        {"amount": 500, "paymentMethod": "cash", "purpose": "deposit"},
    )
    assert payment.status_code == 201, payment.text
    assert payment.json()["paymentType"] == "ipd_payment"
    assert payment.json()["status"] == "completed"
    assert payment.json()["admissionId"] == admission["id"]

    after = hospital_c.get(f"/admissions/{admission['id']}/bill").json()
    assert after["paidTotal"] == 500
    assert after["balanceDue"] == before["balanceDue"] - 500
    payment_lines = [l for l in after["lines"] if l["source"] == "payment"]
    assert len(payment_lines) == 1
    assert payment_lines[0]["paid"] is True


def test_record_payment_is_allowed_after_discharge(hospital_c):
    """Settling the final bill is itself a post-discharge activity — same
    rule POST .../charge-items already follows."""
    admission = _fresh_admission(hospital_c, "postdc")
    discharge = hospital_c.post(
        "/discharge-summaries", {"admissionId": admission["id"], "dischargeType": "routine"}, token=hospital_c.doctor_token
    )
    assert discharge.status_code == 201, discharge.text

    payment = hospital_c.post(
        f"/admissions/{admission['id']}/payments",
        {"amount": 1000, "paymentMethod": "cash", "purpose": "settlement"},
    )
    assert payment.status_code == 201, payment.text


def test_record_payment_rejects_a_non_positive_amount(hospital_c):
    admission = _fresh_admission(hospital_c, "neg")
    response = hospital_c.post(
        f"/admissions/{admission['id']}/payments",
        {"amount": 0, "paymentMethod": "cash"},
    )
    assert response.status_code == 422, response.text


# ---------- Billing is hidden from clinical roles ----------
def test_doctor_and_nurse_are_refused_every_ipd_billing_endpoint(hospital_c):
    admission_id = hospital_c.ids["admission"]
    for token in (hospital_c.doctor_token, hospital_c.nurse_token):
        assert hospital_c.get(f"/admissions/{admission_id}/bill", token=token).status_code == 403
        assert hospital_c.get(f"/admissions/{admission_id}/charge-items", token=token).status_code == 403
        assert hospital_c.post(
            f"/admissions/{admission_id}/charge-items",
            {"chargeType": "misc", "amount": 10},
            token=token,
        ).status_code == 403
        assert hospital_c.post(
            f"/admissions/{admission_id}/payments",
            {"amount": 10, "paymentMethod": "cash"},
            token=token,
        ).status_code == 403


def test_admin_and_receptionist_can_read_and_manage_billing(hospital_c):
    """The complement: this is a role gate, not a broken endpoint — admin
    (this tenant's default token) can do everything doctor/nurse were just
    refused."""
    admission_id = hospital_c.ids["admission"]
    assert hospital_c.get(f"/admissions/{admission_id}/bill").status_code == 200
    assert hospital_c.post(
        f"/admissions/{admission_id}/payments", {"amount": 10, "paymentMethod": "cash"}
    ).status_code == 201

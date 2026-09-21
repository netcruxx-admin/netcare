"""Admission-linked medication/injection/lab orders, medication administration
parity (administered_by/administered_at), and Payment.admission_id
propagation from all three billing-trigger points — the "doctor round: order
medicine/injection/lab" and "medication administration record" halves of
closing docs/IPD_MODULE_CHANGELOG.md's documented cut.

Uses hospital_c (IPD enabled) throughout, reusing the shared
`tenant.ids["admission"]` for every additive test (placing/administering an
order never closes an admission).

`medication_orders.dispense` is pharmacist/superadmin-only and
`lab_orders.process` is lab/superadmin-only — hospital_c has neither a
pharmacist nor a lab account (same as test_medication_dispense.py), so those
steps use the platform superadmin token, same established pattern.
"""

from tests.conftest import PROVISIONED_PASSWORD, _login, _superadmin_token


def _staff_token(tenant, role: str, tag: str) -> str:
    """A one-off staff account for a role hospital_c's fixture has none of
    (lab), same helper test_lab_report_results.py already uses."""
    email = f"{tag}@{tenant.subdomain}.test"
    made = tenant.post("/users", {
        "name": f"{role.title()} {tag}", "email": email,
        "password": PROVISIONED_PASSWORD, "role": role,
    })
    assert made.status_code == 201, made.text
    return _login(tenant.client, tenant.id, email)


def test_medication_order_can_be_raised_against_an_admission(hospital_c):
    response = hospital_c.post(
        "/medication-orders",
        {
            "admissionId": hospital_c.ids["admission"],
            "patientId": hospital_c.ids["patient"],
            "medicineName": "Ward Amoxicillin",
            "dosage": "500mg",
            "route": "Oral",
            "quantity": 6,
        },
        token=hospital_c.doctor_token,
    )
    assert response.status_code == 201, response.text
    order = response.json()
    assert order["admissionId"] == hospital_c.ids["admission"]
    assert order["appointmentId"] is None
    # The prescriber is the caller's own identity, not asserted by the body.
    assert order["doctorId"] == hospital_c.ids["doctor"]


def test_medication_order_list_filters_by_admission_id(hospital_c):
    created = hospital_c.post(
        "/medication-orders",
        {
            "admissionId": hospital_c.ids["admission"],
            "patientId": hospital_c.ids["patient"],
            "medicineName": "Filter Test Drug",
            "dosage": "10mg",
            "route": "IV",
            "quantity": 1,
        },
        token=hospital_c.doctor_token,
    )
    assert created.status_code == 201, created.text

    listed = hospital_c.get(
        f"/medication-orders?admissionId={hospital_c.ids['admission']}", token=hospital_c.nurse_token
    )
    assert listed.status_code == 200, listed.text
    ids = {o["id"] for o in listed.json()}
    assert created.json()["id"] in ids


def test_medication_order_is_refused_on_a_closed_admission(hospital_c):
    bed = hospital_c.post(
        "/beds", {"wardId": hospital_c.ids["ward"], "bedNumber": "med-closed", "dailyRate": 500}
    )
    assert bed.status_code == 201, bed.text
    admission = hospital_c.post(
        "/admissions",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "bedId": bed.json()["id"],
            "provisionalDiagnosis": "closing soon",
        },
    )
    assert admission.status_code == 201, admission.text
    admission_id = admission.json()["id"]

    discharge = hospital_c.post(
        "/discharge-summaries", {"admissionId": admission_id, "dischargeType": "routine"}, token=hospital_c.doctor_token
    )
    assert discharge.status_code == 201, discharge.text

    response = hospital_c.post(
        "/medication-orders",
        {
            "admissionId": admission_id,
            "patientId": hospital_c.ids["patient"],
            "medicineName": "Too Late",
            "dosage": "1",
            "route": "Oral",
            "quantity": 1,
        },
        token=hospital_c.doctor_token,
    )
    assert response.status_code == 409, response.text


def test_dispense_then_administer_writes_administered_by_and_at(hospital_c):
    order = hospital_c.post(
        "/medication-orders",
        {
            "admissionId": hospital_c.ids["admission"],
            "patientId": hospital_c.ids["patient"],
            "medicineName": "MAR Test Drug",
            "dosage": "1 tab",
            "route": "Oral",
            "quantity": 2,
        },
        token=hospital_c.doctor_token,
    ).json()

    dispensed = hospital_c.patch(
        f"/medication-orders/{order['id']}/dispense", token=_superadmin_token(hospital_c.client)
    )
    assert dispensed.status_code == 200, dispensed.text
    assert dispensed.json()["status"] == "dispensed"
    assert dispensed.json()["administeredBy"] is None

    administered = hospital_c.patch(
        f"/medication-orders/{order['id']}/administer",
        {"notes": "given at bedside"},
        token=hospital_c.nurse_token,
    )
    assert administered.status_code == 200, administered.text
    body = administered.json()
    assert body["status"] == "administered"
    # Who administered it and when are server facts, not client-asserted.
    assert body["administeredAt"]
    assert body["administeredByName"]


def test_medication_bill_carries_the_admission_id(hospital_c):
    order = hospital_c.post(
        "/medication-orders",
        {
            "admissionId": hospital_c.ids["admission"],
            "patientId": hospital_c.ids["patient"],
            "medicineName": "Billed Drug",
            "dosage": "1 tab",
            "route": "Oral",
            "quantity": 1,
        },
        token=hospital_c.doctor_token,
    ).json()
    dispensed = hospital_c.patch(
        f"/medication-orders/{order['id']}/dispense", token=_superadmin_token(hospital_c.client)
    )
    assert dispensed.status_code == 200, dispensed.text

    billed = hospital_c.post(
        f"/medication-orders/{order['id']}/bill", {"paymentMethod": "cash"}, token=_superadmin_token(hospital_c.client)
    )
    assert billed.status_code == 200, billed.text
    assert billed.json()["payment"]["admissionId"] == hospital_c.ids["admission"]


def test_injection_order_can_be_raised_and_administered_against_an_admission(hospital_c):
    order = hospital_c.post(
        "/injection-orders",
        {
            "admissionId": hospital_c.ids["admission"],
            "patientId": hospital_c.ids["patient"],
            "injectableName": "Ward Saline",
            "route": "IV",
            "quantity": 1,
        },
        token=hospital_c.doctor_token,
    )
    assert order.status_code == 201, order.text
    assert order.json()["admissionId"] == hospital_c.ids["admission"]

    administered = hospital_c.patch(
        f"/injection-orders/{order.json()['id']}/administer",
        {"site": "Left arm"},
        token=hospital_c.nurse_token,
    )
    assert administered.status_code == 200, administered.text
    assert administered.json()["status"] == "administered"


def test_injection_order_bill_carries_the_admission_id(hospital_c):
    order = hospital_c.post(
        "/injection-orders",
        {
            "admissionId": hospital_c.ids["admission"],
            "patientId": hospital_c.ids["patient"],
            "injectableName": "Billed Injection",
            "route": "IV",
            "quantity": 1,
        },
        token=hospital_c.doctor_token,
    ).json()
    administered = hospital_c.patch(
        f"/injection-orders/{order['id']}/administer", {"site": "Right arm"}, token=hospital_c.nurse_token
    )
    assert administered.status_code == 200, administered.text

    payments = hospital_c.get(f"/payments?patientId={hospital_c.ids['patient']}")
    assert payments.status_code == 200, payments.text
    matching = [p for p in payments.json() if p.get("injectionOrderId") == order["id"]]
    assert len(matching) == 1, payments.text
    assert matching[0]["admissionId"] == hospital_c.ids["admission"]


def test_lab_test_order_can_be_raised_against_an_admission_and_bills_on_completion(hospital_c):
    test = hospital_c.post("/lab-tests", {"name": "IPD CBC", "price": 300})
    assert test.status_code == 201, test.text
    test_id = test.json()["id"]

    order = hospital_c.post(
        "/test-orders",
        {
            "admissionId": hospital_c.ids["admission"],
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "items": [{"testId": test_id, "name": "IPD CBC", "price": 300}],
        },
        token=hospital_c.doctor_token,
    )
    assert order.status_code == 201, order.text
    order_id = order.json()["id"]
    assert order.json()["admissionId"] == hospital_c.ids["admission"]

    completed = hospital_c.put(
        f"/test-orders/{order_id}", {"status": "completed"}, token=_staff_token(hospital_c, "lab", "ipdcbc")
    )
    assert completed.status_code == 200, completed.text

    payments = hospital_c.get(f"/payments?patientId={hospital_c.ids['patient']}")
    assert payments.status_code == 200, payments.text
    matching = [p for p in payments.json() if p.get("testOrderId") == order_id]
    assert len(matching) == 1, payments.text
    assert matching[0]["admissionId"] == hospital_c.ids["admission"]


def test_lab_order_list_filters_by_admission_id(hospital_c):
    test = hospital_c.post("/lab-tests", {"name": "IPD LFT", "price": 400})
    assert test.status_code == 201, test.text
    test_id = test.json()["id"]

    created = hospital_c.post(
        "/test-orders",
        {
            "admissionId": hospital_c.ids["admission"],
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "items": [{"testId": test_id, "name": "IPD LFT", "price": 400}],
        },
        token=hospital_c.doctor_token,
    )
    assert created.status_code == 201, created.text

    listed = hospital_c.get(f"/test-orders?admissionId={hospital_c.ids['admission']}")
    assert listed.status_code == 200, listed.text
    ids = {o["id"] for o in listed.json()}
    assert created.json()["id"] in ids


def test_medication_order_admission_id_from_another_tenant_is_refused(hospital_c, hospital_d):
    response = hospital_c.post(
        "/medication-orders",
        {
            "admissionId": hospital_d.ids["admission"],
            "patientId": hospital_c.ids["patient"],
            "medicineName": "Cross Tenant",
            "dosage": "1",
            "route": "Oral",
            "quantity": 1,
        },
        token=hospital_c.doctor_token,
    )
    assert response.status_code == 404, response.text

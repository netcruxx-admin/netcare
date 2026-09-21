"""Admission-linked vitals and prescriptions — the schema/router half of
closing docs/IPD_MODULE_CHANGELOG.md's documented cut: `admission_id` columns
existed on `vitals`/`prescriptions` with no `*Create` field ever wired to
them, so an inpatient could not have vitals or a prescription recorded at all
unless they also happened to have an open OPD appointment.

Uses hospital_c (IPD enabled) throughout. `tenant.ids["admission"]` is the
shared admission `_enable_ipd` creates — safe to add vitals/prescriptions to
(additive, never closes it), so tests here reuse it rather than admitting a
fresh patient each time.
"""

import itertools

_bed_counter = itertools.count(100)


def _fresh_admission(tenant):
    """A brand-new bed + admission, for a test that needs to close one
    without disturbing the shared `tenant.ids["admission"]` other tests in
    this file (and other files) rely on staying open."""
    bed = tenant.post(
        "/beds",
        {"wardId": tenant.ids["ward"], "bedNumber": f"chart-{next(_bed_counter)}", "dailyRate": 500},
    )
    assert bed.status_code == 201, bed.text
    admission = tenant.post(
        "/admissions",
        {
            "patientId": tenant.ids["patient"],
            "doctorId": tenant.ids["doctor"],
            "bedId": bed.json()["id"],
            "provisionalDiagnosis": "fresh admission for charting test",
        },
    )
    assert admission.status_code == 201, admission.text
    return admission.json()


# ---------- Vitals ----------
def test_vitals_requires_exactly_one_of_appointment_or_admission(hospital_c):
    response = hospital_c.post(
        "/vitals",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "temperature": 37.0,
        },
        token=hospital_c.doctor_token,
    )
    assert response.status_code == 422, response.text

    response = hospital_c.post(
        "/vitals",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "appointmentId": hospital_c.ids["appointment"],
            "admissionId": hospital_c.ids["admission"],
            "temperature": 37.0,
        },
        token=hospital_c.doctor_token,
    )
    assert response.status_code == 422, response.text


def test_nurse_can_chart_vitals_and_intake_output_against_an_admission(hospital_c):
    response = hospital_c.post(
        "/vitals",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "admissionId": hospital_c.ids["admission"],
            "temperature": 38.2,
            "heartRate": 88,
            "intakeMl": 500,
            "outputMl": 300,
        },
        token=hospital_c.nurse_token,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["admissionId"] == hospital_c.ids["admission"]
    assert body["appointmentId"] is None
    assert body["intakeMl"] == 500
    assert body["outputMl"] == 300


def test_vitals_list_filters_by_admission_id(hospital_c):
    created = hospital_c.post(
        "/vitals",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "admissionId": hospital_c.ids["admission"],
            "temperature": 37.5,
        },
        token=hospital_c.nurse_token,
    )
    assert created.status_code == 201, created.text

    listed = hospital_c.get(f"/vitals?admissionId={hospital_c.ids['admission']}")
    assert listed.status_code == 200, listed.text
    ids = {v["id"] for v in listed.json()}
    assert created.json()["id"] in ids
    for v in listed.json():
        assert v["admissionId"] == hospital_c.ids["admission"]


def test_vitals_admission_id_from_another_tenant_is_refused(hospital_c, hospital_d):
    response = hospital_c.post(
        "/vitals",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "admissionId": hospital_d.ids["admission"],
            "temperature": 37.0,
        },
        token=hospital_c.nurse_token,
    )
    assert response.status_code == 404, response.text


def test_vitals_admission_must_belong_to_the_named_patient(hospital_c):
    # A second, real patient in the same tenant — so assert_in_tenant(Patient)
    # passes and the check under test (admission.patient_id != body.patient_id)
    # is what actually produces the 404, not a nonexistent patient id.
    other_patient = hospital_c.client.post(
        "/auth/register",
        headers={"X-Hospital-Id": hospital_c.id},
        json={
            "name": "Second Patient",
            "email": f"second-patient@{hospital_c.subdomain}.test",
            "password": "Passw0rd!test",
            "phone": "9000000001",
            "role": "patient",
            "dateOfBirth": "1990-01-01",
            "consents": ["treatment", "billing", "communications.service"],
        },
    )
    assert other_patient.status_code == 200, other_patient.text

    response = hospital_c.post(
        "/vitals",
        {
            "patientId": other_patient.json()["patient"]["id"],
            "doctorId": hospital_c.ids["doctor"],
            "admissionId": hospital_c.ids["admission"],
            "temperature": 37.0,
        },
        token=hospital_c.nurse_token,
    )
    assert response.status_code == 404, response.text


def test_vitals_are_refused_on_a_closed_admission(hospital_c):
    admission = _fresh_admission(hospital_c)
    discharge = hospital_c.post(
        "/discharge-summaries",
        {"admissionId": admission["id"], "dischargeType": "routine"},
        token=hospital_c.doctor_token,
    )
    assert discharge.status_code == 201, discharge.text

    response = hospital_c.post(
        "/vitals",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "admissionId": admission["id"],
            "temperature": 37.0,
        },
        token=hospital_c.nurse_token,
    )
    assert response.status_code == 409, response.text


# ---------- Prescriptions ----------
def test_prescription_requires_exactly_one_of_appointment_or_admission(hospital_c):
    response = hospital_c.post(
        "/prescriptions",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "medicineName": "Paracetamol",
        },
        token=hospital_c.doctor_token,
    )
    assert response.status_code == 422, response.text


def test_admission_linked_prescription_spawns_an_admission_linked_medication_order(hospital_c):
    response = hospital_c.post(
        "/prescriptions",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "admissionId": hospital_c.ids["admission"],
            "medicineName": "Ward Paracetamol",
            "dosage": "500mg",
        },
        token=hospital_c.doctor_token,
    )
    assert response.status_code == 201, response.text
    rx = response.json()
    assert rx["admissionId"] == hospital_c.ids["admission"]
    assert rx["appointmentId"] is None

    # admin holds no medication_orders.read grant — nurse holds "all", same
    # reasoning Tenant.read() documents.
    orders_response = hospital_c.get(
        f"/medication-orders?admissionId={hospital_c.ids['admission']}", token=hospital_c.nurse_token
    )
    assert orders_response.status_code == 200, orders_response.text
    orders = orders_response.json()
    matching = [o for o in orders if o["prescriptionId"] == rx["id"]]
    assert len(matching) == 1, orders
    assert matching[0]["admissionId"] == hospital_c.ids["admission"]


def test_prescriptions_are_refused_on_a_closed_admission(hospital_c):
    admission = _fresh_admission(hospital_c)
    discharge = hospital_c.post(
        "/discharge-summaries",
        {"admissionId": admission["id"], "dischargeType": "routine"},
        token=hospital_c.doctor_token,
    )
    assert discharge.status_code == 201, discharge.text

    response = hospital_c.post(
        "/prescriptions",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "admissionId": admission["id"],
            "medicineName": "Too late",
        },
        token=hospital_c.doctor_token,
    )
    assert response.status_code == 409, response.text

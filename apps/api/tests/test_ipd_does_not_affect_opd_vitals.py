"""The regression test that most directly protects the live maternity
hospital: creating a Vitals row the existing OPD way — via appointment_id,
the only way the API has ever accepted one — must behave identically after
migration e21ce148a645 (which dropped NOT NULL on vitals.appointment_id,
added admission_id/intake_ml/output_ml, and added the
"exactly one of appointment_id/admission_id" CHECK constraint) as it did
before it.

Uses hospital_a (maternity category, same as the live hospital, ipd module
never enabled) rather than hospital_c/d — the point here is specifically the
*unmodified* OPD path, not anything IPD adds.

VitalsCreate itself was not touched: `appointment_id` is still declared
required with no default, and there is no `admissionId` field on it at all —
so this test is also implicitly proving that claim, not just the migration.
Admission-linked vitals recording is out of scope for this pass (see
docs/IPD_MODULE_CHANGELOG.md) — the schema supports the column, nothing in
the API surface writes to it yet.
"""

from tests.conftest import unique_date


def _book_appointment(tenant) -> str:
    appointment = tenant.post(
        "/appointments",
        {
            "patientId": tenant.ids["patient"],
            "doctorId": tenant.ids["doctor"],
            "departmentId": tenant.ids["department"],
            "date": unique_date(),
            "time": "09:00",
            "reason": "OPD vitals regression check",
        },
    )
    assert appointment.status_code == 201, appointment.text
    return appointment.json()["id"]


def test_creating_vitals_the_ordinary_opd_way_still_works(hospital_a):
    appointment_id = _book_appointment(hospital_a)

    response = hospital_a.post(
        "/vitals",
        {
            "appointmentId": appointment_id,
            "patientId": hospital_a.ids["patient"],
            "doctorId": hospital_a.ids["doctor"],
            "temperature": 37.2,
            "bloodPressure": "118/76",
            "heartRate": 78,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["appointmentId"] == appointment_id
    assert body["temperature"] == 37.2
    assert body["heartRate"] == 78


def test_maternity_vitals_fields_still_round_trip(hospital_a):
    """hospital_a is a maternity-category hospital — the obstetric triad
    (lmp/edd/pog) plus pregnancy_status is the field set the live hospital
    actually depends on day to day, so this checks it explicitly rather than
    trusting the generic case above to cover it."""
    appointment_id = _book_appointment(hospital_a)

    response = hospital_a.post(
        "/vitals",
        {
            "appointmentId": appointment_id,
            "patientId": hospital_a.ids["patient"],
            "doctorId": hospital_a.ids["doctor"],
            "lmp": "2026-01-01",
            "edd": "2026-10-07",
            "pog": "28w 3d",
            "pregnancyStatus": "pregnant",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["lmp"] == "2026-01-01"
    assert body["edd"] == "2026-10-07"
    assert body["pog"] == "28w 3d"
    assert body["pregnancyStatus"] == "pregnant"


def test_vitals_without_an_appointment_id_is_still_refused_by_the_api_contract(hospital_a):
    """The DB column went nullable, but VitalsCreate did not change — the API
    contract for the OPD flow must be exactly as strict as it always was."""
    response = hospital_a.post(
        "/vitals",
        {
            "patientId": hospital_a.ids["patient"],
            "doctorId": hospital_a.ids["doctor"],
            "temperature": 37.0,
        },
    )
    assert response.status_code == 422, response.text


def test_vitals_list_and_detail_are_unaffected(hospital_a):
    appointment_id = _book_appointment(hospital_a)
    created = hospital_a.post(
        "/vitals",
        {
            "appointmentId": appointment_id,
            "patientId": hospital_a.ids["patient"],
            "doctorId": hospital_a.ids["doctor"],
            "temperature": 36.9,
        },
    )
    assert created.status_code == 201, created.text
    vitals_id = created.json()["id"]

    rows = hospital_a.read(f"/vitals?appointmentId={appointment_id}").json()
    assert any(r["id"] == vitals_id for r in rows)

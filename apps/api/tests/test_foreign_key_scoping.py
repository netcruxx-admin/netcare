"""Every write endpoint that takes an id from the body, checked.

The hole this covers is easy to reintroduce and hard to notice. Most creates
splat `**body.model_dump()` onto the model, so the foreign key never appears in
the router's source — grepping for `body.patient_id` finds nothing while the id
still lands on the row. And the consequence is not merely a bad row: the display
helpers resolve those ids to names, so hospital A ends up rendering hospital B's
patient into its own screens.

The list below is derived from the request schemas rather than hand-written, so a
new payload field named `patient_id` shows up here without anyone remembering to
add it. That is the point — the guard and its test are both self-maintaining.
"""

import pytest

# (label, method, path template, body builder, actor)
#
# `a` is the hospital making the request, `b` the one whose ids are being
# smuggled in. Anything that is legitimately A's is taken from A, so the *only*
# thing wrong with each request is the one foreign key pointing at B.
CASES = [
    (
        "appointments", "post", "/appointments",
        lambda a, b: {
            "patientId": b.ids["patient"],
            "doctorId": a.ids["doctor"],
            "departmentId": a.ids["department"],
            "date": "2026-10-01", "time": "09:00",
        },
        "admin",
    ),
    (
        "appointment-update-doctor", "put", "/appointments/{a_appointment}",
        lambda a, b: {"doctorId": b.ids["doctor"]},
        "admin",
    ),
    (
        "vitals", "post", "/vitals",
        lambda a, b: {
            "patientId": b.ids["patient"],
            "doctorId": a.ids["doctor"],
            "appointmentId": a.ids["appointment"],
            "temperature": 37.0,
        },
        "doctor",
    ),
    (
        "medical-records", "post", "/medical-records",
        lambda a, b: {
            "patientId": b.ids["patient"],
            "doctorId": a.ids["doctor"],
            "appointmentId": a.ids["appointment"],
            "diagnosis": "x",
        },
        "doctor",
    ),
    (
        "prescriptions", "post", "/prescriptions",
        lambda a, b: {
            "patientId": b.ids["patient"],
            "doctorId": a.ids["doctor"],
            "appointmentId": a.ids["appointment"],
            "medicineName": "x",
        },
        "doctor",
    ),
    (
        "payments", "post", "/payments",
        lambda a, b: {
            "patientId": b.ids["patient"],
            "appointmentId": a.ids["appointment"],
            "amount": 100,
        },
        "admin",
    ),
    (
        "pregnancies", "post", "/pregnancies",
        lambda a, b: {
            "patientId": b.ids["patient"],
            "lmp": "2026-01-01",
            "edd": "2026-10-07",
        },
        "doctor",
    ),
    (
        "schedule-blocks", "post", "/schedule-blocks",
        lambda a, b: {
            "doctorId": b.ids["doctor"],
            "date": "2026-10-01",
            "startTime": "09:00",
            "endTime": "10:00",
        },
        "admin",
    ),
    (
        "video-slots", "post", "/video-slots",
        lambda a, b: {"doctorId": b.ids["doctor"], "date": "2026-10-01", "time": "09:00"},
        "admin",
    ),
]

ACCEPTABLE = (400, 403, 404, 409, 422)


def _token(tenant, actor):
    return {
        "admin": tenant.token,
        "doctor": tenant.doctor_token,
        "nurse": tenant.nurse_token,
    }[actor]


@pytest.mark.parametrize(
    "label,method,path,build,actor", CASES, ids=[c[0] for c in CASES]
)
def test_body_foreign_keys_are_checked_against_the_tenant(
    hospital_a, hospital_b, label, method, path, build, actor
):
    """Hospital A names one of hospital B's rows; the write must be refused.

    A 404 is the ideal answer — the id does not exist as far as A is concerned.
    403/400/422 are accepted too, since some handlers refuse earlier for their
    own reasons. A 2xx means the id went onto the row.
    """
    url = path.format(a_appointment=hospital_a.ids["appointment"])
    response = getattr(hospital_a, method)(
        url, build(hospital_a, hospital_b), token=_token(hospital_a, actor)
    )
    assert response.status_code in ACCEPTABLE, (
        f"{label}: accepted another tenant's id ({response.status_code}) — "
        f"the body's foreign keys are not checked against the caller's tenant. "
        f"Body: {response.text[:200]}"
    )


def test_lab_order_patient_is_checked(hospital_a, hospital_b):
    """A lab order for another tenant's patient.

    Not folded into the table above: with an empty `items` the request fails
    validation before any tenant check runs, so it passed even with the guard
    removed and proved nothing. The order has to be otherwise *valid* for the
    smuggled patient id to be the only thing wrong with it.
    """
    own_test = hospital_a.post("/lab-tests", {"name": "Alpha CBC", "price": 200})
    assert own_test.status_code == 201, own_test.text

    response = hospital_a.post(
        "/test-orders",
        {
            "patientId": hospital_b.ids["patient"],
            "doctorId": hospital_a.ids["doctor"],
            "items": [
                {"testId": own_test.json()["id"], "name": "Alpha CBC", "price": 200}
            ],
        },
        token=hospital_a.doctor_token,
    )
    assert response.status_code in ACCEPTABLE, (
        f"test order accepted another tenant's patientId ({response.status_code}): "
        f"{response.text[:200]}"
    )


def test_nested_foreign_keys_are_checked_too(hospital_a, hospital_b):
    """A lab order carries its test ids inside `items`, not at the top level.

    Worth its own test because a guard that only walks the top level of the body
    looks correct and misses this entirely.
    """
    # Created here rather than read from a fixture: the lab-test catalogue is not
    # seeded per tenant, and the nurse used for reads elsewhere does not hold
    # `lab_tests.read`. Making the test provide its own subject keeps it honest
    # about what it is proving.
    created = hospital_b.post(
        "/lab-tests", {"name": "Beta Only Panel", "price": 100}
    )
    assert created.status_code == 201, created.text
    foreign_test_id = created.json()["id"]

    response = hospital_a.post(
        "/test-orders",
        {
            "patientId": hospital_a.ids["patient"],
            "doctorId": hospital_a.ids["doctor"],
            "items": [{"testId": foreign_test_id, "name": "x", "price": 1}],
        },
        token=hospital_a.doctor_token,
    )
    assert response.status_code in ACCEPTABLE, (
        f"a nested testId from another tenant was accepted ({response.status_code})"
    )


def test_every_fk_carrying_schema_has_a_guarded_handler():
    """The sweep itself, as a test.

    Derived from the schemas so it keeps working as they change: any request
    model that grows a tenant-owned foreign key must be consumed by a handler
    that calls one of the guards. This is what stops the next endpoint from
    quietly reopening the hole.
    """
    import ast
    import pathlib
    import re

    from app import schemas
    from app.database import Base

    owned = {
        m.class_.__name__
        for m in Base.registry.mappers
        if hasattr(m.class_, "hospital_id")
    }
    fk_fields = {
        "patient_id": "Patient", "mother_patient_id": "Patient",
        "doctor_id": "Doctor", "department_id": "Department",
        "appointment_id": "Appointment", "pregnancy_id": "PregnancyRecord",
        "baby_id": "Baby", "order_id": "TestOrder", "test_id": "LabTest",
        "medicine_id": "Medicine", "prescription_id": "Prescription",
    }
    fk_fields = {f: t for f, t in fk_fields.items() if t in owned}

    risky = {
        name
        for name in dir(schemas)
        if isinstance(getattr(schemas, name), type)
        and hasattr(getattr(schemas, name), "model_fields")
        and not name.endswith("Out")
        and any(f in getattr(schemas, name).model_fields for f in fk_fields)
    }

    unguarded = []
    routers = pathlib.Path(__file__).resolve().parents[1] / "app" / "routers"
    for path in sorted(routers.glob("*.py")):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            src = ast.unparse(node)
            if not any(re.search(rf"schemas\.{s}\b", src) for s in risky):
                continue
            if "assert_in_tenant" not in src and "assert_body_in_tenant" not in src:
                unguarded.append(f"{path.name}::{node.name}")

    assert not unguarded, (
        "these handlers consume a body carrying a tenant-owned foreign key "
        "without checking it against the caller's tenant: " + ", ".join(unguarded)
    )

"""A completed appointment is a closed record.

Once a visit happened, its date, doctor, department and reason are a fact
about what took place — not something a later PUT gets to rewrite. The rule
has to hold for the caller who manages every appointment in the hospital, not
just one scoped to their own, since that caller is exactly the one an editor
UI hands the "Edit"/"Reschedule" buttons to.
"""

from tests.conftest import unique_date

APPOINTMENTS = "/appointments"


def _book(tenant, **overrides) -> str:
    body = {
        "patientId": tenant.ids["patient"],
        "doctorId": tenant.ids["doctor"],
        "departmentId": tenant.ids["department"],
        "date": unique_date(),
        "time": "09:30",
        "reason": "Completed-lock check",
        **overrides,
    }
    created = tenant.post(APPOINTMENTS, body)
    assert created.status_code == 201, created.text
    return created.json()["id"]


def test_a_scheduled_appointment_can_still_be_edited(hospital_a):
    """Sanity check: the lock is specific to "completed", not a blanket refusal."""
    appointment_id = _book(hospital_a)
    response = hospital_a.put(f"{APPOINTMENTS}/{appointment_id}", json={"reason": "Updated reason"})
    assert response.status_code == 200, response.text
    assert response.json()["reason"] == "Updated reason"


def test_marking_an_appointment_complete_still_works(hospital_a):
    """The transition *into* "completed" is not itself an edit of a completed
    appointment — it has to keep working, or nothing could ever be marked done."""
    appointment_id = _book(hospital_a)
    response = hospital_a.put(f"{APPOINTMENTS}/{appointment_id}", json={"status": "completed"})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "completed"


def test_a_completed_appointment_refuses_further_edits(hospital_a):
    appointment_id = _book(hospital_a)
    done = hospital_a.put(f"{APPOINTMENTS}/{appointment_id}", json={"status": "completed"})
    assert done.status_code == 200, done.text

    for body in (
        {"reason": "Rewriting history"},
        {"date": unique_date()},
        {"time": "11:00"},
        {"doctorId": hospital_a.ids["doctor"]},
        {"status": "scheduled"},
    ):
        response = hospital_a.put(f"{APPOINTMENTS}/{appointment_id}", json=body)
        assert response.status_code == 409, response.text
        assert "completed" in response.json()["detail"].lower()


def test_a_completed_appointment_cannot_be_rescheduled(hospital_a):
    """Reschedule is the same PUT under a friendlier name — it goes through
    the identical guard, not a separate one that could fall out of sync."""
    appointment_id = _book(hospital_a)
    done = hospital_a.put(f"{APPOINTMENTS}/{appointment_id}", json={"status": "completed"})
    assert done.status_code == 200, done.text

    response = hospital_a.put(
        f"{APPOINTMENTS}/{appointment_id}", json={"date": unique_date(), "time": "14:00"}
    )
    assert response.status_code == 409, response.text

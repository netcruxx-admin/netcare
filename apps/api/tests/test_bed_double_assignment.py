"""A bed can hold one admission at a time.

Same shape as the duplicate-department-booking rule appointments.py enforces:
the second attempt at the same resource must be refused with 409, not silently
double-booked. Uses a throwaway ward/bed rather than the shared fixture one
(hospital_c.ids['bed']), which other test files depend on staying vacant or
occupied in a predictable state.
"""

from app.utils import new_id


def _fresh_bed(tenant) -> tuple[str, str]:
    ward = tenant.post("/wards", {"name": f"Double-book ward {new_id('w')}", "wardType": "general"})
    assert ward.status_code == 201, ward.text
    bed = tenant.post(
        "/beds", {"wardId": ward.json()["id"], "bedNumber": "DB-1", "dailyRate": 500}
    )
    assert bed.status_code == 201, bed.text
    return ward.json()["id"], bed.json()["id"]


def test_second_admission_into_an_occupied_bed_is_refused(hospital_c):
    _, bed_id = _fresh_bed(hospital_c)

    first = hospital_c.post(
        "/admissions",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "bedId": bed_id,
        },
    )
    assert first.status_code == 201, first.text

    beds = hospital_c.read("/beds").json()
    bed_row = next(b for b in beds if b["id"] == bed_id)
    assert bed_row["status"] == "occupied"

    second = hospital_c.post(
        "/admissions",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "bedId": bed_id,
        },
    )
    assert second.status_code == 409, second.text

    # The refused attempt must not have half-happened — the first admission
    # still holds the bed, undisturbed.
    admission = hospital_c.read(f"/admissions/{first.json()['id']}").json()
    assert admission["bedId"] == bed_id
    assert admission["status"] == "admitted"


def test_transfer_into_an_occupied_bed_is_refused(hospital_c):
    """The same rule, reached through the transfer endpoint rather than create."""
    _, target_bed_id = _fresh_bed(hospital_c)
    occupying = hospital_c.post(
        "/admissions",
        {
            "patientId": hospital_c.ids["patient"],
            "doctorId": hospital_c.ids["doctor"],
            "bedId": target_bed_id,
        },
    )
    assert occupying.status_code == 201, occupying.text

    # hospital_c.ids["admission"] is the fixture's own long-lived admission,
    # already holding a different bed — this only asks it to move, it does not
    # discharge or otherwise disturb it.
    response = hospital_c.post(
        f"/admissions/{hospital_c.ids['admission']}/transfer",
        {"bedId": target_bed_id},
    )
    assert response.status_code == 409, response.text

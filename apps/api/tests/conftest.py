"""Two hospitals, so isolation is testable at all.

Tenant leaks are invisible with one tenant. A query that forgot `hospital_id`,
a `db.query(Model)` that should have been `scoped()`, a filter applied to the
list endpoint but not the detail one — every one of those behaves perfectly
until a second hospital exists, and then presents as one hospital reading
another's patients. That is the worst failure this product has, and it is the
one no amount of manual testing on a single-tenant install will ever surface.

So the fixtures here build two fully-populated hospitals and hand the tests a
signed-in client for each. Everything is created through the real API, never by
inserting rows: the point is to exercise the same provisioning path a live
tenant takes, so a bug in that path fails the suite rather than hiding behind
hand-made fixtures.

Runs against its own database (TEST_DATABASE_URL, default
`carbonhealth_test`), created and migrated per session and dropped afterwards,
so a test run can never touch development data.
"""

import os
import uuid

import pytest
from sqlalchemy import create_engine, text

# Set before any app module is imported — Settings reads the environment at
# import time, so a later assignment would be ignored and the suite would
# quietly run against the development database.
TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://localhost:5432/carbonhealth_test"
)
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["ENVIRONMENT"] = "development"
os.environ.setdefault("JWT_SECRET", "test-secret-not-used-anywhere-real")

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.main import app, run_migrations  # noqa: E402
from app.seed import seed_database  # noqa: E402


def _admin_url() -> str:
    """A connection to `postgres`, for creating and dropping the test database.

    CREATE DATABASE cannot run inside a transaction or from within the database
    being created, so this deliberately points somewhere else.
    """
    base, _, _ = TEST_DB_URL.rpartition("/")
    return f"{base}/postgres"


@pytest.fixture(scope="session", autouse=True)
def database():
    """A migrated database for the session, dropped when it ends."""
    db_name = TEST_DB_URL.rpartition("/")[2]
    admin = create_engine(_admin_url(), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)'))
        conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    admin.dispose()

    run_migrations()
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()

    yield

    admin = create_engine(_admin_url(), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)'))
    admin.dispose()


@pytest.fixture(scope="session")
def client():
    # The lifespan is not run: migrations and seeding already happened above,
    # and letting it run would re-enter them on every session.
    return TestClient(app)


class Tenant:
    """One hospital and the people inside it, as the API sees them.

    Requests go out with this tenant's `X-Hospital-Id` header and its admin's
    token, so a test reads as "hospital A asks for X" rather than as header
    bookkeeping.
    """

    def __init__(self, client: TestClient, hospital: dict, admin_token: str):
        self.client = client
        self.id = hospital["id"]
        self.subdomain = hospital["subdomain"]
        self.hospital = hospital
        self.token = admin_token
        # Filled in by _build_tenant once the staff exist.
        self.nurse_token = ""
        self.doctor_token = ""
        self.ids: dict[str, str] = {}

    def read(self, path, **kw):
        """A read as the tenant's nurse.

        The actor matters. A doctor holds most clinical reads at scope "own", so
        their queries are filtered by ownership *before* tenancy ever comes into
        it — which would hide a tenant leak rather than expose it. The nurse
        holds `all` on every collection here, so the only thing standing between
        them and another hospital's records is `scoped()`. That is precisely
        what these tests exist to check.
        """
        return self.client.get(path, headers=self.headers(self.nurse_token), **kw)

    def headers(self, token: str | None = None) -> dict:
        return {
            "Authorization": f"Bearer {token or self.token}",
            "X-Hospital-Id": self.id,
        }

    def get(self, path, token=None, **kw):
        return self.client.get(path, headers=self.headers(token), **kw)

    def post(self, path, json=None, token=None, **kw):
        return self.client.post(path, json=json, headers=self.headers(token), **kw)

    def patch(self, path, json=None, token=None, **kw):
        return self.client.patch(path, json=json, headers=self.headers(token), **kw)

    def put(self, path, json=None, token=None, **kw):
        return self.client.put(path, json=json, headers=self.headers(token), **kw)

    def delete(self, path, token=None, **kw):
        return self.client.delete(path, headers=self.headers(token), **kw)


def _login(client: TestClient, hospital_id: str, email: str) -> str:
    """Sign in, completing a forced password change if one is pending.

    Every account created by somebody else — the provisioned admin, and every
    staff account — lands with `must_change_password` set and is refused by all
    permission-guarded endpoints until it is cleared. So the fixtures do what a
    real clinician does on their first morning, which has the pleasant side
    effect of exercising that flow on every single test run.
    """
    response = client.post(
        "/auth/login",
        headers={"X-Hospital-Id": hospital_id},
        json={"email": email, "password": PROVISIONED_PASSWORD},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    if not payload.get("mustChangePassword"):
        return payload["token"]

    changed = client.post(
        "/auth/change-password",
        headers={
            "Authorization": f"Bearer {payload['token']}",
            "X-Hospital-Id": hospital_id,
        },
        json={
            "currentPassword": PROVISIONED_PASSWORD,
            "newPassword": SETTLED_PASSWORD,
        },
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["mustChangePassword"] is False
    return changed.json()["token"]


def _superadmin_token(client: TestClient) -> str:
    response = client.post(
        "/auth/login",
        json={
            "email": settings.superadmin_email,
            "password": settings.superadmin_password,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["token"]


# The password an account is provisioned with, and the one its owner chooses on
# first sign-in. Kept distinct so a test that accidentally reuses the first would
# fail rather than pass by coincidence.
PROVISIONED_PASSWORD = "Passw0rd!test"
SETTLED_PASSWORD = "Chosen!byMe2026"

REQUIRED_CONSENTS = ["treatment", "billing", "communications.service"]


def _build_tenant(client: TestClient, name: str, subdomain: str, category: str) -> Tenant:
    """Onboard a hospital and fill it with one of everything.

    Deliberately built through the public API. Inserting rows directly would be
    faster and would also stop the suite from noticing the day provisioning
    breaks — which is exactly the path a new tenant depends on.
    """
    su = _superadmin_token(client)
    response = client.post(
        "/hospitals",
        headers={"Authorization": f"Bearer {su}"},
        json={
            "name": name,
            "subdomain": subdomain,
            "category": category,
            "adminName": f"{name} Admin",
            "adminEmail": f"admin@{subdomain}.test",
            "adminPassword": "Passw0rd!test",
        },
    )
    assert response.status_code == 201, response.text
    # Onboarding returns the tenant plus its registration profile. Unwrapped
    # tolerantly so the suite survives that envelope changing again.
    payload = response.json()
    hospital = payload.get("hospital", payload)

    # Through _login, because the provisioned admin also lands with a forced
    # password change — the platform operator chose that password, so it is a
    # way in and nothing more.
    admin_token = _login(client, hospital["id"], f"admin@{subdomain}.test")
    tenant = Tenant(client, hospital, admin_token)

    # A doctor.
    doctor_user = tenant.post(
        "/users",
        {
            "name": f"Dr {subdomain}",
            "email": f"doctor@{subdomain}.test",
            "password": PROVISIONED_PASSWORD,
            "role": "doctor",
            "specialization": "Obstetrics & Gynecology",
        },
    )
    assert doctor_user.status_code == 201, doctor_user.text
    doctors = tenant.get("/doctors").json()
    tenant.ids["doctor"] = doctors[0]["id"]
    tenant.ids["doctor_email"] = f"doctor@{subdomain}.test"
    tenant.doctor_token = _login(client, hospital["id"], f"doctor@{subdomain}.test")

    # A nurse, because they are the one role holding `all` scope across every
    # clinical collection — see Tenant.read().
    nurse = tenant.post(
        "/users",
        {
            "name": f"Nurse {subdomain}",
            "email": f"nurse@{subdomain}.test",
            "password": PROVISIONED_PASSWORD,
            "role": "nurse",
        },
    )
    assert nurse.status_code == 201, nurse.text
    tenant.nurse_token = _login(client, hospital["id"], f"nurse@{subdomain}.test")

    # A patient, self-registered so the consent path is exercised too.
    registered = client.post(
        "/auth/register",
        headers={"X-Hospital-Id": hospital["id"]},
        json={
            "name": f"Patient {subdomain}",
            "email": f"patient@{subdomain}.test",
            "password": PROVISIONED_PASSWORD,
            "phone": "9000000000",
            "role": "patient",
            "dateOfBirth": "1990-01-01",
            "consents": REQUIRED_CONSENTS,
        },
    )
    assert registered.status_code == 200, registered.text
    tenant.ids["patient"] = registered.json()["patient"]["id"]
    tenant.ids["patient_token"] = registered.json()["token"]
    tenant.ids["patient_email"] = f"patient@{subdomain}.test"

    departments = tenant.get("/departments").json()
    tenant.ids["department"] = departments[0]["id"]

    # An appointment, and the clinical records that hang off it.
    appointment = tenant.post(
        "/appointments",
        {
            "patientId": tenant.ids["patient"],
            "doctorId": tenant.ids["doctor"],
            "departmentId": tenant.ids["department"],
            "date": "2026-09-01",
            "time": "10:00",
            "reason": f"{subdomain} visit",
        },
    )
    assert appointment.status_code == 201, appointment.text
    tenant.ids["appointment"] = appointment.json()["id"]

    common = {
        "patientId": tenant.ids["patient"],
        "doctorId": tenant.ids["doctor"],
        "appointmentId": tenant.ids["appointment"],
    }

    # Written as the doctor: `medical_records.manage` and `prescriptions.manage`
    # are held by the doctor alone, which is the correct clinical boundary — an
    # administrator does not write a diagnosis.
    vitals = tenant.post("/vitals", {**common, "temperature": 37.0, "heartRate": 72})
    assert vitals.status_code == 201, vitals.text
    tenant.ids["vitals"] = vitals.json()["id"]

    record = tenant.post(
        "/medical-records",
        {**common, "diagnosis": f"{subdomain} diagnosis"},
        token=tenant.doctor_token,
    )
    assert record.status_code == 201, record.text
    tenant.ids["medical_record"] = record.json()["id"]

    prescription = tenant.post(
        "/prescriptions",
        {**common, "medicineName": f"{subdomain}-drug", "dosage": "1 tab"},
        token=tenant.doctor_token,
    )
    assert prescription.status_code == 201, prescription.text
    tenant.ids["prescription"] = prescription.json()["id"]

    return tenant


@pytest.fixture(scope="session")
def hospital_a(client, database) -> Tenant:
    return _build_tenant(client, "Alpha Womens Clinic", "alpha", "maternity")


@pytest.fixture(scope="session")
def hospital_b(client, database) -> Tenant:
    # A different category on purpose: the pair doubles as proof that the
    # category is a provisioning template rather than a runtime branch, which is
    # what makes onboarding a multi-specialty hospital a data change.
    return _build_tenant(client, "Beta General Hospital", "beta", "multi-specialty")

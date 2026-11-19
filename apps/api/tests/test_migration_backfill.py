"""The migrations that touch existing data, run against a populated database.

The suite's own database is migrated from empty, so a backfill that updates
rows -- which is what a real hospital has -- never actually runs there. This
builds a throwaway database at the revision *before* the department changes,
fills it the way a live hospital would look, upgrades to head, and checks what
happened to the rows. Then it walks back down and up again, because a migration
that cannot be reversed is a deploy that cannot be undone.

Alembic runs in a subprocess: its env.py reads the database URL from settings at
import time, so pointing it at a second database needs a fresh process.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from tests.conftest import TEST_DB_URL, _admin_url

API_DIR = Path(__file__).resolve().parents[1]
BEFORE = "b9c8d7e6f5a4"  # specialty_encounters: the last revision before departments changed
MIG_DB = TEST_DB_URL.rpartition("/")[2] + "_migration"
MIG_URL = f"{TEST_DB_URL.rpartition('/')[0]}/{MIG_DB}"


def _alembic(*args):
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=API_DIR,
        env={**os.environ, "DATABASE_URL": MIG_URL},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def _insert(conn, table, **given):
    """Insert a row, filling every other NOT NULL column that has no default --
    these tables have dozens, and the test cares about three of them."""
    required = conn.execute(
        text(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_name = :t AND is_nullable = 'NO' AND column_default IS NULL"
        ),
        {"t": table},
    ).fetchall()
    fill = {"integer": 0, "bigint": 0, "double precision": 0.0, "boolean": False, "json": "{}", "jsonb": "{}"}
    values = {name: fill.get(kind, "x") for name, kind in required}
    values.update(given)
    columns = ", ".join(f'"{c}"' for c in values)
    params = ", ".join(f":{c}" for c in values)
    conn.execute(text(f'INSERT INTO "{table}" ({columns}) VALUES ({params})'), values)


@pytest.fixture()
def populated():
    admin = create_engine(_admin_url(), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{MIG_DB}" WITH (FORCE)'))
        conn.execute(text(f'CREATE DATABASE "{MIG_DB}"'))

    _alembic("upgrade", BEFORE)
    engine = create_engine(MIG_URL)
    with engine.begin() as conn:
        _insert(conn, "hospitals", id="h1", name="Live Hospital", subdomain="live", category="multi-specialty")
        for i, name in enumerate(
            [
                "Cardiology", "Labor & Delivery", "Orthodontics", "ENT", "Laboratory",
                "Sample Collection", "Cardiac Rehab",
            ]
        ):
            _insert(conn, "departments", id=f"d{i}", hospital_id="h1", name=name)
        # A vitals row from before pain score / SpO2 / glucose / head size existed.
        _insert(
            conn, "vitals", id="v1", hospital_id="h1", appointment_id="a1", patient_id="p1",
            doctor_id="doc1", heart_rate=72, blood_pressure="120/80", created_at="2026-09-01T00:00:00",
        )
    yield engine
    engine.dispose()
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{MIG_DB}" WITH (FORCE)'))
    admin.dispose()


def _specialties(engine):
    with engine.connect() as conn:
        return dict(conn.execute(text("SELECT name, specialty FROM departments")).fetchall())


def test_existing_departments_are_classified_by_name(populated):
    _alembic("upgrade", "head")
    got = _specialties(populated)
    assert got["Cardiology"] == "cardiology"
    assert got["Labor & Delivery"] == "obstetrics-gynecology"
    assert got["Orthodontics"] == "dentistry"  # not orthopedics
    assert got["ENT"] == "ent"
    # Left blank, not guessed wrong: the word only appears inside "laboratory",
    # and a sample-collection point is not a clinical specialty.
    assert got["Laboratory"] == ""
    assert got["Sample Collection"] == ""
    # The backfill keeps the narrower hint list it shipped with (it is a
    # snapshot), so "Cardiac" is blank here and is set by hand once.
    assert got["Cardiac Rehab"] == ""


def test_existing_vitals_survive_with_the_new_columns_at_zero(populated):
    _alembic("upgrade", "head")
    with populated.connect() as conn:
        row = conn.execute(
            text("SELECT heart_rate, blood_pressure, spo2, pain_score, blood_glucose, head_circumference FROM vitals")
        ).one()
    assert (row.heart_rate, row.blood_pressure) == (72, "120/80")
    # Zero reads as "not recorded" everywhere, so an old row shows nothing new.
    assert (row.spo2, row.pain_score, row.blood_glucose, row.head_circumference) == (0, 0, 0, 0)


def test_unclassified_departments_keep_every_field_after_the_upgrade(populated):
    """The upgrade must not take a field away from a department it could not
    classify: overrides are NULL, and no specialty means everything is on."""
    _alembic("upgrade", "head")
    with populated.connect() as conn:
        rows = conn.execute(text("SELECT name, vitals_override, notes_override FROM departments")).fetchall()
    assert all(r.vitals_override is None and r.notes_override is None for r in rows)


def test_only_the_maternity_permissions_are_restricted(populated):
    _alembic("upgrade", "head")
    with populated.connect() as conn:
        gated = dict(conn.execute(text("SELECT code, requires_specialties FROM permissions WHERE requires_specialties IS NOT NULL")).fetchall())
    assert set(gated) == {"pregnancies.read", "pregnancies.manage", "babies.read", "babies.manage"}
    assert gated["pregnancies.read"] == ["obstetrics-gynecology"]
    assert set(gated["babies.read"]) == {"neonatology", "pediatrics"}


def test_the_upgrade_can_be_undone_and_redone(populated):
    _alembic("upgrade", "head")
    _alembic("downgrade", BEFORE)
    with populated.connect() as conn:
        # Back to what it was: the data is intact and the new columns are gone.
        assert conn.execute(text("SELECT count(*) FROM departments")).scalar() == 7
        assert conn.execute(text("SELECT heart_rate FROM vitals")).scalar() == 72
        columns = {r[0] for r in conn.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'departments'"))}
        assert "specialty" not in columns
    _alembic("upgrade", "head")
    assert _specialties(populated)["Cardiology"] == "cardiology"

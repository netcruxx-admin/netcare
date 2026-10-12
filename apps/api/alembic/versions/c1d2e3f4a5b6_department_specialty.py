"""Departments carry a specialty

departments.specialty is an id from the specialty catalog (app/specialties.py),
or '' when not set. It replaces the doctor's typed-in specialization as the thing
specialty screens key off; doctors.specialization stays as an optional
free-text sub-specialty.

Existing departments are backfilled by name -- the same hints as
specialties.infer_specialty, copied here so this migration keeps meaning what it
meant when it ran. A department that matches nothing stays '' and is set from
the departments screen; until then its doctors simply are not offered
specialty-only screens, which is the safe direction.

Revision ID: c1d2e3f4a5b6
Revises: b9c8d7e6f5a4
Create Date: 2026-10-08 01:00:00.000000

"""
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b9c8d7e6f5a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Dental terms first: "orthodontics" contains "ortho".
HINTS = [
    (("dental", "dentist", "orthodont", "endodont", "periodont", "oral surgery"), "dentistry"),
    (("cardio", "heart"), "cardiology"),
    (("orthop", "musculo"), "orthopedics"),
    (("dermat", "skin"), "dermatology"),
    (("neonat", "nicu"), "neonatology"),
    (("pediatric", "paediatric", "child"), "pediatrics"),
    (("obstetric", "gynec", "gynaec", "maternal", "labor &", "labor and", "labour"), "obstetrics-gynecology"),
    (("ophthalm", "optom", "retina", "cornea", "glaucoma", "eye"), "ophthalmology"),
    (("neuro",), "neurology"),
    (("nephro", "renal", "dialysis"), "nephrology"),
    (("urolog",), "urology"),
    (("oncolog", "cancer"), "oncology"),
    (("psychiat", "mental"), "psychiatry"),
    (("pulmon", "respirat", "chest"), "pulmonology"),
    (("gastro",), "gastroenterology"),
    (("endocrin", "diabet"), "endocrinology"),
    (("surgery", "surgical"), "general-surgery"),
    (("emergency", "casualty"), "emergency"),
    (("radiolog", "imaging"), "radiology"),
    (("patholog",), "pathology"),
    (("general medicine", "internal medicine", "general physician"), "general-medicine"),
]


def _guess(name: str) -> str:
    name = (name or "").lower()
    if re.search(r"\bent\b", name) or "otolaryng" in name:
        return "ent"
    for fragments, specialty in HINTS:
        if any(f in name for f in fragments):
            return specialty
    return ""


def upgrade() -> None:
    op.add_column(
        'departments',
        sa.Column('specialty', sa.String(), nullable=False, server_default=''),
    )
    conn = op.get_bind()
    for dept_id, name in conn.execute(sa.text("SELECT id, name FROM departments")).fetchall():
        guess = _guess(name)
        if guess:
            conn.execute(
                sa.text("UPDATE departments SET specialty = :s WHERE id = :i"),
                {'s': guess, 'i': dept_id},
            )


def downgrade() -> None:
    op.drop_column('departments', 'specialty')

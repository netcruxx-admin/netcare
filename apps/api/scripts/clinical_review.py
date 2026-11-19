"""Write docs/CLINICAL_REVIEW.md from the code, for a clinician to review.

The vitals profiles, history fields and visit forms are clinical content written
by engineers. This renders exactly what the app does -- not a description of it
-- so a reviewer signs off on the real thing, and re-running it after a change
gives them the new version.

    cd apps/api && venv/bin/python scripts/clinical_review.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import clinical_fields as cf  # noqa: E402
from app.specialties import SPECIALTY_CATALOG, SPECIALTY_TEMPLATES  # noqa: E402

OUT = ROOT.parent.parent / "docs" / "CLINICAL_REVIEW.md"

VITAL_LABEL = {k: label for k, label, _ in cf.VITAL_FIELDS}
NOTE_LABEL = {k: label for k, label, _ in cf.NOTE_FIELDS}
UNIT = {"temperature": "°F", "weight": "kg", "height": "cm", "heart_rate": "bpm", "spo2": "%",
        "respiratory_rate": "/min", "blood_glucose": "mg/dL", "pain_score": "/10", "head_circumference": "cm",
        "blood_pressure": "mmHg"}


def field_line(f: dict) -> str:
    bits = [f["type"]]
    if f.get("required"):
        bits.append("required")
    if f.get("unit"):
        bits.append(f["unit"])
    if "min" in f or "max" in f:
        bits.append(f"{f.get('min', '')}–{f.get('max', '')}")
    if f.get("options"):
        bits.append("one of: " + ", ".join(f["options"]) if f["type"] == "select"
                    else "any of: " + ", ".join(f["options"]))
    return f"- {f['label']} _({'; '.join(bits)})_"


def main() -> None:
    lines = [
        "# Clinical review sheet",
        "",
        "_Generated from the code by `apps/api/scripts/clinical_review.py` — it shows what the "
        "software actually does. Re-run it after any change._",
        "",
        "## What to review",
        "",
        "When a patient is seen in a department, the software decides **which measurements and "
        "history questions to ask** and, for some specialties, shows a **specialty visit form**. "
        "Engineers chose these starting points. Please check each specialty and tick it off, or "
        "write what to change.",
        "",
        "- **Vitals** — measurements the nurse or doctor records at the visit.",
        "- **History & examination notes** — the general notes box every visit has.",
        "- **Visit form** — extra structured questions for the specialty (only where one exists).",
        "",
        "A hospital's administrator can still tick or untick individual fields per department, "
        "so none of this is a hard rule — but these are the defaults every new hospital gets.",
        "",
        "Fields marked _required_ cannot be left blank. Ranges (for example 3–15) reject typing "
        "mistakes such as a heart rate of 5000.",
        "",
        "Where a department has not been given a specialty yet, it shows **every** field.",
        "",
        "## Specific questions",
        "",
        "1. **Temperature** is recorded in °F with a default of 98.4. Is °F right for your hospitals?",
        "2. **BMI** is hidden for newborns, eye, ENT, dental and skin visits. Agree?",
        "3. **Blood glucose** is a vital for general medicine, endocrinology, neurology, nephrology, "
        "emergency, eye and dental. Missing anywhere (for example pre-surgery)?",
        "4. **Pain score (0–10)** is on for orthopedics, general surgery, oncology, gastroenterology "
        "and emergency. Missing anywhere?",
        "5. Antenatal **LMP / EDD / POG** are recorded once, in vitals, for obstetrics only. "
        "Should gynecology-only visits record LMP too?",
        "6. Are the **ranges** (heart rate 20–300, fetal heart rate 60–220, hemoglobin 2–25 g/dL, "
        "IOP 0–80 mmHg, GCS 3–15) sensible limits for catching a typing error?",
        "",
        "---",
        "",
    ]

    for spec in SPECIALTY_CATALOG:
        sid, label = spec["id"], spec["label"]
        lines += [f"## {label}", "", "- [ ] Reviewed by: ______________  Date: __________", ""]
        vitals = cf.default_vitals(sid)
        lines.append("**Vitals recorded:** " + ", ".join(
            f"{VITAL_LABEL[k]}" + (f" ({UNIT[k]})" if k in UNIT else "") for k in vitals))
        notes = [k for k in cf.default_notes(sid) if k not in cf.ALWAYS_NOTES]
        lines.append("")
        lines.append("**History & examination notes:** " + ", ".join(NOTE_LABEL[k] for k in notes)
                     + " — plus Diagnosis, Treatment advice, Follow-up advice (always).")
        lines.append("")
        template = SPECIALTY_TEMPLATES.get(sid)
        if template is None:
            lines += ["**Visit form:** none yet — uses the general notes only.", ""]
        else:
            lines += [f"**Visit form** (version {template['version']}):", ""]
            for section in template["sections"]:
                lines += [f"_{section['label']}_", ""]
                lines += [field_line(f) for f in section["fields"]]
                lines.append("")
        lines += ["**Changes needed:** ", "", "---", ""]

    OUT.write_text("\n".join(lines).rstrip() + "\n")
    print(f"wrote {OUT} ({len(lines)} lines)")


if __name__ == "__main__":
    main()

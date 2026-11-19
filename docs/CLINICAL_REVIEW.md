# Clinical review sheet

_Generated from the code by `apps/api/scripts/clinical_review.py` — it shows what the software actually does. Re-run it after any change._

## What to review

When a patient is seen in a department, the software decides **which measurements and history questions to ask** and, for some specialties, shows a **specialty visit form**. Engineers chose these starting points. Please check each specialty and tick it off, or write what to change.

- **Vitals** — measurements the nurse or doctor records at the visit.
- **History & examination notes** — the general notes box every visit has.
- **Visit form** — extra structured questions for the specialty (only where one exists).

A hospital's administrator can still tick or untick individual fields per department, so none of this is a hard rule — but these are the defaults every new hospital gets.

Fields marked _required_ cannot be left blank. Ranges (for example 3–15) reject typing mistakes such as a heart rate of 5000.

Where a department has not been given a specialty yet, it shows **every** field.

## Specific questions

1. **Temperature** is recorded in °F with a default of 98.4. Is °F right for your hospitals?
2. **BMI** is hidden for newborns, eye, ENT, dental and skin visits. Agree?
3. **Blood glucose** is a vital for general medicine, endocrinology, neurology, nephrology, emergency, eye and dental. Missing anywhere (for example pre-surgery)?
4. **Pain score (0–10)** is on for orthopedics, general surgery, oncology, gastroenterology and emergency. Missing anywhere?
5. Antenatal **LMP / EDD / POG** are recorded once, in vitals, for obstetrics only. Should gynecology-only visits record LMP too?
6. Are the **ranges** (heart rate 20–300, fetal heart rate 60–220, hemoglobin 2–25 g/dL, IOP 0–80 mmHg, GCS 3–15) sensible limits for catching a typing error?

---

## General Medicine

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI, SpO₂ (%), Respiratory rate (/min), Blood glucose (mg/dL)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form** (version 1):

_Presentation_

- Duration _(text)_
- Symptoms _(multiselect; any of: Fever, Cough, Breathlessness, Chest pain, Abdominal pain, Headache, Vomiting, Diarrhoea, Fatigue, Weight loss)_

_Examination_

- General condition _(select; one of: Good, Fair, Poor)_
- Pallor _(boolean)_
- Icterus _(boolean)_
- Edema _(boolean)_
- Lymphadenopathy _(boolean)_
- Systemic findings _(textarea)_

_Investigations_

- Advised _(textarea)_
- Results _(textarea)_

**Changes needed:** 

---

## Cardiology

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI, SpO₂ (%), Respiratory rate (/min)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form** (version 1):

_Presentation_

- Symptoms _(multiselect; any of: Chest pain, Breathlessness, Palpitations, Syncope, Edema, Fatigue)_
- NYHA class _(select; one of: I, II, III, IV)_
- Risk factors _(multiselect; any of: Hypertension, Diabetes, Smoking, Dyslipidemia, Family history, Obesity)_

_Examination_

- Heart rate _(number; bpm; 20–300)_
- Systolic BP _(number; mmHg; 40–300)_
- Diastolic BP _(number; mmHg; 20–200)_
- SpO2 _(number; %; 0–100)_
- Heart sounds _(text)_
- Murmur _(text)_

_Investigations_

- ECG rhythm _(select; one of: Normal sinus, Atrial fibrillation, Flutter, Bradycardia, Tachycardia, Other)_
- ECG findings _(textarea)_
- Ejection fraction (echo) _(number; %; 0–100)_
- Echo findings _(textarea)_
- Troponin _(text)_

**Changes needed:** 

---

## Orthopedics

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI, Pain score (/10)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form** (version 1):

_Presentation_

- Affected site _(text; required)_
- Side _(select; one of: Left, Right, Both)_
- Mechanism _(select; one of: Fall, Road accident, Sports, Degenerative, Overuse, Other)_
- Onset date _(date)_
- Pain score _(number; /10; 0–10)_

_Examination_

- Range of motion _(textarea)_
- Muscle power _(select; one of: 0, 1, 2, 3, 4, 5)_
- Swelling _(boolean)_
- Deformity _(boolean)_
- Neurovascular status _(text)_

_Imaging_

- Imaging done _(multiselect; any of: X-ray, MRI, CT, Ultrasound, DEXA)_
- Imaging findings _(textarea)_
- Fracture type _(select; one of: None, Closed, Open, Stress, Pathological)_

**Changes needed:** 

---

## Dermatology

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form** (version 1):

_Presentation_

- Duration _(text)_
- Itching _(select; one of: None, Mild, Moderate, Severe)_
- Previous treatment _(textarea)_
- Known allergies _(text)_

_Lesion_

- Site _(text; required)_
- Distribution _(select; one of: Localized, Generalized, Symmetrical, Dermatomal)_
- Morphology _(multiselect; any of: Macule, Papule, Plaque, Vesicle, Pustule, Nodule, Scale, Ulcer)_
- Colour _(text)_
- Size _(number; cm; 0–200)_

_Investigations_

- Dermoscopy findings _(textarea)_
- Biopsy done _(boolean)_
- Patch test _(text)_

**Changes needed:** 

---

## Pediatrics

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI, Head circumference (cm), SpO₂ (%), Respiratory rate (/min)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form** (version 1):

_Presentation_

- Duration _(text)_
- Feeding _(select; one of: Breast, Formula, Mixed, Complementary foods, Family diet)_
- Immunization _(select; one of: Up to date, Delayed, Not started)_

_Growth & development_

- Growth _(select; one of: Normal, Underweight, Stunted, Overweight)_
- Developmental milestones _(textarea)_
- Developmental concern raised _(boolean)_

_Examination_

- Hydration _(select; one of: Well hydrated, Mild dehydration, Moderate dehydration, Severe dehydration)_
- General examination _(textarea)_
- Systemic findings _(textarea)_

**Changes needed:** 

---

## Neonatology

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), Head circumference (cm), SpO₂ (%), Respiratory rate (/min)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form:** none yet — uses the general notes only.

**Changes needed:** 

---

## Obstetrics & Gynecology

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI, Pregnancy status, LMP, EDD, POG

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history, Menstrual history, Marital status, Obstetric history, POG by scan/USG, P/A (per abdomen), P/S (per speculum), P/V (per vaginum) — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form** (version 1):

_Presentation_

- Visit for _(select; required; one of: Antenatal, Postnatal, Gynecological, Infertility, Family planning)_
- Duration _(text)_

_Obstetric history_

- Gravida _(number; 0–30)_
- Para _(number; 0–30)_
- Living children _(number; 0–30)_
- Abortions _(number; 0–30)_
- Previous cesarean _(boolean)_
- Risk factors _(multiselect; any of: Advanced maternal age, Hypertension, Diabetes, Anemia, Previous cesarean, Multiple pregnancy, Previous preterm birth, Rh negative, Thyroid disease)_

_Examination_

- Fundal height _(number; cm; 0–60)_
- Fetal presentation _(select; one of: Cephalic, Breech, Transverse, Not applicable)_
- Fetal heart rate _(number; bpm; 60–220)_
- Fetal movements _(select; one of: Present, Reduced, Absent)_
- Pedal edema _(boolean)_
- Pelvic / per-vaginal findings _(textarea)_

_Gynecology_

- Menstrual pattern _(select; one of: Regular, Irregular, Amenorrhea, Heavy bleeding, Postmenopausal)_
- Contraception _(text)_
- Pap smear _(select; one of: Not done, Normal, Abnormal)_

_Investigations_

- Ultrasound findings _(textarea)_
- Hemoglobin _(number; g/dL; 2–25)_
- Urine albumin _(select; one of: Nil, Trace, +, ++, +++)_
- Glucose test (OGTT / random) _(text)_

**Changes needed:** 

---

## ENT

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), SpO₂ (%)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form** (version 1):

_Presentation_

- Symptoms _(multiselect; any of: Ear pain, Hearing loss, Ear discharge, Tinnitus, Vertigo, Nasal block, Sore throat, Hoarseness, Epistaxis)_
- Duration _(text)_
- Side _(select; one of: Left, Right, Both)_

_Examination_

- Ear _(textarea)_
- Nose _(textarea)_
- Throat & neck _(textarea)_
- Tuning fork tests _(text)_

_Investigations_

- Audiometry _(textarea)_
- Endoscopy _(textarea)_

**Changes needed:** 

---

## Ophthalmology

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Blood glucose (mg/dL)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form** (version 1):

_Presentation_

- Symptoms _(multiselect; any of: Blurred vision, Eye pain, Redness, Watering, Floaters, Flashes, Photophobia, Discharge)_
- Side _(select; one of: Left, Right, Both)_
- Duration _(text)_

_Vision & pressure_

- Visual acuity, right _(text)_
- Visual acuity, left _(text)_
- IOP, right _(number; mmHg; 0–80)_
- IOP, left _(number; mmHg; 0–80)_
- Refraction _(textarea)_

_Examination_

- Anterior segment _(textarea)_
- Fundus _(textarea)_

**Changes needed:** 

---

## Dentistry

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Blood glucose (mg/dL)

**History & examination notes:** Chief complaint, Medical history, Surgical history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form** (version 1):

_Presentation_

- Tooth / site _(text)_
- Pain _(number; /10; 0–10)_

_Examination_

- Oral hygiene _(select; one of: Good, Fair, Poor)_
- Caries _(boolean)_
- Gingivitis _(boolean)_
- Tooth mobility _(boolean)_
- Findings _(textarea)_

_Procedure_

- Procedure done _(text)_
- Anaesthesia _(select; one of: None, Topical, Local)_
- Materials used _(text)_

**Changes needed:** 

---

## Neurology

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI, Blood glucose (mg/dL)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form** (version 1):

_Presentation_

- Onset _(select; one of: Sudden, Gradual)_
- Duration _(text)_
- Symptoms _(multiselect; any of: Headache, Seizure, Weakness, Numbness, Dizziness, Speech difficulty, Memory loss, Tremor)_

_Examination_

- GCS _(number; 3–15)_
- Higher functions _(text)_
- Cranial nerves _(textarea)_
- Motor power _(textarea)_
- Reflexes _(textarea)_
- Sensory _(textarea)_
- Gait & coordination _(text)_

_Investigations_

- Imaging (CT / MRI) _(textarea)_
- EEG / EMG / NCS _(textarea)_

**Changes needed:** 

---

## Nephrology

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI, Blood glucose (mg/dL)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form:** none yet — uses the general notes only.

**Changes needed:** 

---

## Urology

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form:** none yet — uses the general notes only.

**Changes needed:** 

---

## Oncology

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI, SpO₂ (%), Pain score (/10)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form:** none yet — uses the general notes only.

**Changes needed:** 

---

## Psychiatry

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Weight (kg), Height (cm), BMI

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form:** none yet — uses the general notes only.

**Changes needed:** 

---

## Pulmonology

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI, SpO₂ (%), Respiratory rate (/min)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form:** none yet — uses the general notes only.

**Changes needed:** 

---

## Gastroenterology

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI, Pain score (/10)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form:** none yet — uses the general notes only.

**Changes needed:** 

---

## Endocrinology

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI, Blood glucose (mg/dL)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form:** none yet — uses the general notes only.

**Changes needed:** 

---

## General Surgery

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI, SpO₂ (%), Pain score (/10)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form:** none yet — uses the general notes only.

**Changes needed:** 

---

## Emergency

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI, SpO₂ (%), Respiratory rate (/min), Blood glucose (mg/dL), Pain score (/10)

**History & examination notes:** Chief complaint, Medical history, Surgical history, Family history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form:** none yet — uses the general notes only.

**Changes needed:** 

---

## Radiology

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI

**History & examination notes:** Chief complaint, Medical history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form:** none yet — uses the general notes only.

**Changes needed:** 

---

## Pathology

- [ ] Reviewed by: ______________  Date: __________

**Vitals recorded:** BP (mmHg), Pulse (bpm), Temperature (°F), Weight (kg), Height (cm), BMI

**History & examination notes:** Chief complaint, Medical history — plus Diagnosis, Treatment advice, Follow-up advice (always).

**Visit form:** none yet — uses the general notes only.

**Changes needed:** 

---

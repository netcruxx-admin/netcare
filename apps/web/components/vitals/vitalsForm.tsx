'use client';

// Shared shape + fields for the counter's vitals form, used by RecordVitalsModal,
// EditVitalsModal and NurseVitals so the three stay identical.
//
// Ten fields: BP, Height, Pulse, Weight, Temperature, BMI, Pregnancy Status,
// LMP, EDD, POG. Respiratory rate and clinical notes are still stored on the
// record (old data, API contract) but are no longer entered here — the
// payload builder simply omits them, which POST defaults and PUT leaves
// untouched.
//
// BMI is auto-filled from height+weight but remains editable: it recomputes
// only when height/weight change, so a value the recorder then adjusts by
// hand survives until the next source edit.
//
// EDD and POG are auto-filled from LMP, but ONLY when pregnancyStatus is
// "pregnant" — LMP alone does not mean the patient is pregnant (a routine
// gynae visit records LMP too), so computing a due date from it regardless
// used to be wrong. A blank LMP does not mean menopause either; that is now
// its own explicit status rather than something inferred from an empty
// field. Picking "Menopause" clears LMP/EDD/POG, since none apply.

import { useEffect, useRef } from 'react';
import { useFormikContext } from 'formik';
import * as Yup from 'yup';
import { FormField } from '@/components/form/FormField';
import type { Vitals } from '@/lib/types';

export interface VitalsFormValues {
  bloodPressure: string;
  height: string;
  heartRate: string;
  weight: string;
  temperature: string;
  bmi: string;
  pregnancyStatus: string;
  lmp: string;
  edd: string;
  pog: string;
}

export const emptyVitals: VitalsFormValues = {
  bloodPressure: '',
  height: '',
  heartRate: '',
  weight: '',
  // Normal body temperature by default — most visits don't have a fever, so
  // the recorder overrides this rather than typing it out every time.
  temperature: '98.4',
  bmi: '',
  pregnancyStatus: '',
  lmp: '',
  edd: '',
  pog: '',
};

const asStr = (n: number | null | undefined) => (n ? String(n) : '');

export const vitalsToForm = (v: Vitals): VitalsFormValues => ({
  bloodPressure: v.bloodPressure ?? '',
  height: asStr(v.height),
  heartRate: asStr(v.heartRate),
  weight: asStr(v.weight),
  temperature: asStr(v.temperature),
  bmi: asStr(v.bmi),
  pregnancyStatus: v.pregnancyStatus ?? '',
  lmp: v.lmp ?? '',
  edd: v.edd ?? '',
  pog: v.pog ?? '',
});

const asNum = (s: string) => Number(s) || 0;

/** The slice of the API body these fields own. Respiratory rate and notes are
 *  deliberately absent. */
export const vitalsToPayload = (v: VitalsFormValues) => ({
  bloodPressure: v.bloodPressure,
  height: asNum(v.height),
  heartRate: asNum(v.heartRate),
  weight: asNum(v.weight),
  temperature: asNum(v.temperature),
  bmi: asNum(v.bmi),
  pregnancyStatus: v.pregnancyStatus,
  lmp: v.lmp,
  edd: v.edd,
  pog: v.pog,
});

export const pregnancyStatusOptions = [
  { value: 'pregnant', label: 'Pregnant' },
  { value: 'not_pregnant', label: 'Not Pregnant' },
  { value: 'menopause', label: 'Menopause' },
];

const numOpt = Yup.number()
  .transform((v, orig) => (orig === '' ? undefined : v))
  .typeError('Enter a number')
  .min(0, 'Cannot be negative')
  .notRequired();

export const vitalsSchema = Yup.object({
  bloodPressure: Yup.string().max(15, 'Too long'),
  height: numOpt,
  heartRate: numOpt,
  weight: numOpt,
  temperature: numOpt,
  bmi: numOpt,
  pregnancyStatus: Yup.string().oneOf(['', 'pregnant', 'not_pregnant', 'menopause']),
  lmp: Yup.string(),
  edd: Yup.string(),
  pog: Yup.string().max(20, 'Too long'),
});

// --- derivations -----------------------------------------------------------

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Weeks + days since LMP as of today, e.g. "28w 3d". Empty for a nonsense or
 *  out-of-range date. */
function gestationFromLmp(iso: string): string {
  const lmp = new Date(iso);
  if (Number.isNaN(lmp.getTime())) return '';
  const days = Math.floor((Date.now() - lmp.getTime()) / 86_400_000);
  if (days < 0 || days > 320) return '';
  return `${Math.floor(days / 7)}w ${days % 7}d`;
}

function bmiFrom(heightCm: string, weightKg: string): string {
  const h = Number(heightCm) / 100;
  const w = Number(weightKg);
  if (!h || !w) return '';
  return (w / (h * h)).toFixed(1);
}

/** Watches the source fields and refreshes the derived ones on change only —
 *  the initial values (a saved record's own BMI/EDD/POG) are left as they are.
 *  Exported so a compact table-row layout can reuse the derivation without a
 *  labeled `VitalsFormFields` block. */
export function Autofill() {
  const { values, setFieldValue } = useFormikContext<VitalsFormValues>();
  const seen = useRef({
    hw: `${values.height}|${values.weight}`,
    lmp: values.lmp,
    pregnancyStatus: values.pregnancyStatus,
  });

  useEffect(() => {
    const key = `${values.height}|${values.weight}`;
    if (key === seen.current.hw) return;
    seen.current.hw = key;
    setFieldValue('bmi', bmiFrom(values.height, values.weight));
  }, [values.height, values.weight, setFieldValue]);

  useEffect(() => {
    const lmpChanged = values.lmp !== seen.current.lmp;
    const statusChanged = values.pregnancyStatus !== seen.current.pregnancyStatus;
    if (!lmpChanged && !statusChanged) return;
    seen.current.lmp = values.lmp;
    seen.current.pregnancyStatus = values.pregnancyStatus;

    // Menopause rules out LMP/EDD/POG entirely — clear all three rather than
    // leave a contradictory "menopause + dated LMP" on the record.
    if (statusChanged && values.pregnancyStatus === 'menopause') {
      setFieldValue('lmp', '');
      setFieldValue('edd', '');
      setFieldValue('pog', '');
      return;
    }

    // EDD/POG are only meaningful for an actual pregnancy — LMP being filled
    // in (routine menstrual history) is not enough on its own.
    if (values.pregnancyStatus === 'pregnant' && values.lmp) {
      setFieldValue('edd', addDays(values.lmp, 280));
      setFieldValue('pog', gestationFromLmp(values.lmp));
    } else {
      setFieldValue('edd', '');
      setFieldValue('pog', '');
    }
  }, [values.lmp, values.pregnancyStatus, setFieldValue]);

  return null;
}

/** The ten fields, in the agreed order. Drop straight into a two-column grid
 *  `<Form>`. */
export function VitalsFormFields() {
  return (
    <>
      <Autofill />
      <FormField name="bloodPressure" label="BP" placeholder="120/80" />
      <FormField name="height" label="Height (cm)" type="number" placeholder="165" />
      <FormField name="heartRate" label="Pulse (bpm)" type="number" placeholder="78" />
      <FormField name="weight" label="Weight (kg)" type="number" placeholder="68" />
      <FormField name="temperature" label="Temperature (°F)" type="number" placeholder="98.4" />
      <FormField name="bmi" label="BMI (kg/m²)" type="number" placeholder="from height & weight" />
      <FormField name="pregnancyStatus" label="Pregnancy Status" as="select" placeholder="Not recorded" options={pregnancyStatusOptions} />
      <FormField name="lmp" label="LMP" type="date" />
      <FormField name="edd" label="EDD" type="date" />
      <FormField name="pog" label="POG" placeholder="e.g. 28w 3d" />
    </>
  );
}

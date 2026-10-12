'use client';

import { useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { FileText } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/form/FormField';
import { useCreateMedicalRecordMutation, useUpdateMedicalRecordMutation } from '@/store/api';
import type { MedicalRecord } from '@/lib/types';

const schema = Yup.object({
  diagnosis: Yup.string().trim(),
  treatmentAdvice: Yup.string().trim(),
  followUpAdvice: Yup.string().trim(),
  chiefComplaint: Yup.string().trim(),
  medicalHistory: Yup.string().trim(),
  surgicalHistory: Yup.string().trim(),
  familyHistory: Yup.string().trim(),
  menstrualHistory: Yup.string().trim(),
  maritalStatus: Yup.string().trim(),
  obstetricHistory: Yup.string().trim(),
  pogByScan: Yup.string().trim(),
  perAbdomen: Yup.string().trim(),
  perSpeculum: Yup.string().trim(),
  perVaginum: Yup.string().trim(),
}).test('at-least-one', 'Fill in at least one of these', (values) =>
  Object.values(values).some((v) => (v ?? '').trim()),
);

interface Props {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  record: MedicalRecord | null;
  canManage: boolean;
  /** The first encounter collects history a follow-up doesn't re-ask. */
  isNewVisit: boolean;
  /** The department's `noteFields`; omitted, every field shows. */
  fields?: string[];
}

type NoteKey = keyof typeof NOTE_KEY;

/** The form field -> the department catalog key (app/clinical_fields.py). */
const NOTE_KEY = {
  chiefComplaint: 'chief_complaint',
  medicalHistory: 'medical_history',
  surgicalHistory: 'surgical_history',
  familyHistory: 'family_history',
  menstrualHistory: 'menstrual_history',
  maritalStatus: 'marital_status',
  obstetricHistory: 'obstetric_history',
  pogByScan: 'pog_by_scan',
  perAbdomen: 'per_abdomen',
  perSpeculum: 'per_speculum',
  perVaginum: 'per_vaginum',
  diagnosis: 'diagnosis',
  treatmentAdvice: 'treatment_advice',
  followUpAdvice: 'follow_up_advice',
} as const;

const LABEL: Record<NoteKey, string> = {
  chiefComplaint: 'Chief Complaint',
  medicalHistory: 'Medical History',
  surgicalHistory: 'Surgical History',
  familyHistory: 'Family History',
  menstrualHistory: 'Menstrual History',
  maritalStatus: 'Marital Status',
  obstetricHistory: 'Obstetric History',
  pogByScan: 'POG by Scan/USG',
  perAbdomen: 'P/A (Per Abdomen)',
  perSpeculum: 'P/S (Per Speculum)',
  perVaginum: 'P/V (Per Vaginum)',
  diagnosis: 'Diagnosis',
  treatmentAdvice: 'Treatment Advice',
  followUpAdvice: 'Follow-up Advice',
};

// History-taking at a first visit, split the way the form lays it out.
const HISTORY_LEFT: NoteKey[] = ['menstrualHistory', 'maritalStatus', 'obstetricHistory', 'pogByScan'];
const HISTORY_RIGHT: NoteKey[] = ['chiefComplaint', 'medicalHistory', 'surgicalHistory', 'familyHistory'];
const EXAM: NoteKey[] = ['perAbdomen', 'perSpeculum', 'perVaginum'];

// No view/edit toggle: whoever can write notes sees the form, pre-filled with
// whatever is already on file, ready to add to or correct in place.
//
// Which fields appear is the visit's department's call (`fields`): a cardiology
// visit has no menstrual history or per-vaginum examination. LMP itself is not
// a field here -- it lives only on Vitals, which already derives EDD/POG from
// it. A second copy here would let the two disagree.
export function ClinicalNotesSection({ appointmentId, patientId, doctorId, record, canManage, isNewVisit, fields }: Props) {
  const [createMedicalRecord] = useCreateMedicalRecordMutation();
  const [updateMedicalRecord] = useUpdateMedicalRecordMutation();
  const [error, setError] = useState('');

  const on = (key: NoteKey) => !fields || fields.includes(NOTE_KEY[key]);
  // Read-only view also shows a field the department no longer records if the
  // visit already has something in it -- history stays readable.
  const seen = (key: NoteKey) => on(key) || !!record?.[key];
  const input = (key: NoteKey) => {
    switch (key) {
      case 'maritalStatus':
        return <FormField key={key} name={key} label={LABEL[key]} placeholder="e.g. Married" />;
      case 'pogByScan':
        return <FormField key={key} name={key} label={LABEL[key]} placeholder="e.g. 12w 4d (dating scan)" />;
      case 'obstetricHistory':
        return <FormField key={key} name={key} label={LABEL[key]} as="textarea" rows={2} placeholder="e.g. G2P1L1, previous LSCS" dictation />;
      case 'chiefComplaint':
        return <FormField key={key} name={key} label={LABEL[key]} as="textarea" rows={2} placeholder="What brought the patient in" dictation />;
      default:
        return <FormField key={key} name={key} label={LABEL[key]} as="textarea" rows={2} dictation />;
    }
  };
  const value = (key: NoteKey) => {
    const v = record?.[key];
    return typeof v === 'string' && v.trim() ? v : '—';
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-5 h-5 text-slate-500" />
        <h2 className="text-base font-semibold text-slate-900">Clinical Notes</h2>
      </div>

      {canManage ? (
        <Formik
          enableReinitialize
          initialValues={{
            diagnosis: record?.diagnosis ?? '',
            treatmentAdvice: record?.treatmentAdvice ?? '',
            followUpAdvice: record?.followUpAdvice ?? '',
            chiefComplaint: record?.chiefComplaint ?? '',
            medicalHistory: record?.medicalHistory ?? '',
            surgicalHistory: record?.surgicalHistory ?? '',
            familyHistory: record?.familyHistory ?? '',
            menstrualHistory: record?.menstrualHistory ?? '',
            maritalStatus: record?.maritalStatus ?? '',
            obstetricHistory: record?.obstetricHistory ?? '',
            pogByScan: record?.pogByScan ?? '',
            perAbdomen: record?.perAbdomen ?? '',
            perSpeculum: record?.perSpeculum ?? '',
            perVaginum: record?.perVaginum ?? '',
          }}
          validationSchema={schema}
          onSubmit={async (values, { setSubmitting }) => {
            setError('');
            // Only what this department records is sent: the API refuses the
            // rest, and an edit must not touch what it has stored there.
            const body = Object.fromEntries(
              (Object.keys(NOTE_KEY) as NoteKey[])
                .filter(on)
                .map((key) => [key, values[key].trim()]),
            );
            try {
              if (record) {
                await updateMedicalRecord({ id: record.id, ...body }).unwrap();
              } else {
                await createMedicalRecord({ appointmentId, patientId, doctorId, ...body }).unwrap();
              }
            } catch (err) {
              setError(apiError(err, 'Could not save clinical notes'));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ isSubmitting, dirty }) => (
            <Form className="space-y-4">
              {isNewVisit && [...HISTORY_LEFT, ...HISTORY_RIGHT].some(on) && (
                <div className="grid sm:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                  <div className="space-y-4">{HISTORY_LEFT.filter(on).map(input)}</div>
                  <div className="space-y-4">{HISTORY_RIGHT.filter(on).map(input)}</div>
                </div>
              )}
              {/* Examination findings -- every visit, not just the first. */}
              {EXAM.some(on) && (
                <div className="grid sm:grid-cols-3 gap-4 pb-4 border-b border-slate-100">
                  {EXAM.filter(on).map(input)}
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField name="diagnosis" label="Diagnosis" as="textarea" rows={4} placeholder="e.g. Acute pharyngitis, viral etiology" dictation />
                <FormField name="treatmentAdvice" label="Treatment Advice" as="textarea" rows={4} placeholder="e.g. Warm saline gargles, paracetamol for fever, rest and fluids" dictation />
              </div>
              <FormField name="followUpAdvice" label="Follow-up Advice" as="textarea" rows={2} placeholder="e.g. Review in 5 days, or sooner if fever crosses 102°F" dictation />
              {record?.labReports && record.labReports.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Lab Reports</p>
                  <p className="text-sm text-slate-500">{record.labReports.join(', ')}</p>
                </div>
              )}
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}
              <Button
                type="submit"
                disabled={isSubmitting || !dirty}
                variant="brand"
              >
                {isSubmitting ? <Spinner size="sm" label="Saving…" /> : record ? 'Update Notes' : 'Save Notes'}
              </Button>
            </Form>
          )}
        </Formik>
      ) : record ? (
        <div className="space-y-3">
          {isNewVisit && [...HISTORY_LEFT, ...HISTORY_RIGHT].some(seen) && (
            <div className="grid sm:grid-cols-2 gap-4 pb-3 border-b border-slate-100">
              {[HISTORY_LEFT, HISTORY_RIGHT].map((column, i) => (
                <div key={i} className="space-y-3">
                  {column.filter(seen).map((key) => (
                    <div key={key}>
                      <p className="text-sm text-slate-600">{LABEL[key]}</p>
                      <p className="text-slate-900 whitespace-pre-line">{value(key)}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {EXAM.some(seen) && (
            <div className="grid sm:grid-cols-3 gap-4 pb-3 border-b border-slate-100">
              {EXAM.filter(seen).map((key) => (
                <div key={key}>
                  <p className="text-sm text-slate-600">{LABEL[key]}</p>
                  <p className="text-slate-900 whitespace-pre-line">{value(key)}</p>
                </div>
              ))}
            </div>
          )}
          {(['diagnosis', 'treatmentAdvice', 'followUpAdvice'] as NoteKey[]).map((key) => (
            <div key={key}>
              <p className="text-sm text-slate-600">{LABEL[key]}</p>
              <p className="text-slate-900 whitespace-pre-line">{value(key)}</p>
            </div>
          ))}
          {record.labReports && record.labReports.length > 0 && (
            <div>
              <p className="text-sm text-slate-600">Lab Reports</p>
              <p className="text-slate-500">{record.labReports.join(', ')}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No clinical notes recorded yet.</p>
      )}
    </div>
  );
}

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
}

// No view/edit toggle: whoever can write notes sees the form, pre-filled with
// whatever is already on file, ready to add to or correct in place.
//
// LMP itself is not a field here — it lives only on Vitals, which already
// derives EDD/POG from it. A second copy here would let the two disagree.
export function ClinicalNotesSection({ appointmentId, patientId, doctorId, record, canManage, isNewVisit }: Props) {
  const [createMedicalRecord] = useCreateMedicalRecordMutation();
  const [updateMedicalRecord] = useUpdateMedicalRecordMutation();
  const [error, setError] = useState('');

  if (!canManage && !record) return null;

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
            const body = {
              diagnosis: values.diagnosis.trim(),
              treatmentAdvice: values.treatmentAdvice.trim(),
              followUpAdvice: values.followUpAdvice.trim(),
              chiefComplaint: values.chiefComplaint.trim(),
              medicalHistory: values.medicalHistory.trim(),
              surgicalHistory: values.surgicalHistory.trim(),
              familyHistory: values.familyHistory.trim(),
              menstrualHistory: values.menstrualHistory.trim(),
              maritalStatus: values.maritalStatus.trim(),
              obstetricHistory: values.obstetricHistory.trim(),
              pogByScan: values.pogByScan.trim(),
              perAbdomen: values.perAbdomen.trim(),
              perSpeculum: values.perSpeculum.trim(),
              perVaginum: values.perVaginum.trim(),
            };
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
              {isNewVisit && (
                <div className="grid sm:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                  <div className="space-y-4">
                    <FormField name="menstrualHistory" label="Menstrual History" as="textarea" rows={2} dictation />
                    <FormField name="maritalStatus" label="Marital Status" placeholder="e.g. Married" />
                    <FormField name="obstetricHistory" label="Obstetric History" as="textarea" rows={2} placeholder="e.g. G2P1L1, previous LSCS" dictation />
                    <FormField name="pogByScan" label="POG by Scan/USG" placeholder="e.g. 12w 4d (dating scan)" />
                  </div>
                  <div className="space-y-4">
                    <FormField name="chiefComplaint" label="Chief Complaint" as="textarea" rows={2} placeholder="What brought the patient in" dictation />
                    <FormField name="medicalHistory" label="Medical History" as="textarea" rows={2} dictation />
                    <FormField name="surgicalHistory" label="Surgical History" as="textarea" rows={2} dictation />
                    <FormField name="familyHistory" label="Family History" as="textarea" rows={2} dictation />
                  </div>
                </div>
              )}
              {/* Examination findings — every antenatal visit, not just the first. */}
              <div className="grid sm:grid-cols-3 gap-4 pb-4 border-b border-slate-100">
                <FormField name="perAbdomen" label="P/A (Per Abdomen)" as="textarea" rows={2} dictation />
                <FormField name="perSpeculum" label="P/S (Per Speculum)" as="textarea" rows={2} dictation />
                <FormField name="perVaginum" label="P/V (Per Vaginum)" as="textarea" rows={2} dictation />
              </div>
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
          {isNewVisit && (
            <div className="grid sm:grid-cols-2 gap-4 pb-3 border-b border-slate-100">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-slate-600">Menstrual History</p>
                  <p className="text-slate-900 whitespace-pre-line">{record.menstrualHistory || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Marital Status</p>
                  <p className="text-slate-900">{record.maritalStatus || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Obstetric History</p>
                  <p className="text-slate-900 whitespace-pre-line">{record.obstetricHistory || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">POG by Scan/USG</p>
                  <p className="text-slate-900">{record.pogByScan || '—'}</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-slate-600">Chief Complaint</p>
                  <p className="text-slate-900 whitespace-pre-line">{record.chiefComplaint || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Medical History</p>
                  <p className="text-slate-900 whitespace-pre-line">{record.medicalHistory || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Surgical History</p>
                  <p className="text-slate-900 whitespace-pre-line">{record.surgicalHistory || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Family History</p>
                  <p className="text-slate-900 whitespace-pre-line">{record.familyHistory || '—'}</p>
                </div>
              </div>
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-4 pb-3 border-b border-slate-100">
            <div>
              <p className="text-sm text-slate-600">P/A (Per Abdomen)</p>
              <p className="text-slate-900 whitespace-pre-line">{record.perAbdomen || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">P/S (Per Speculum)</p>
              <p className="text-slate-900 whitespace-pre-line">{record.perSpeculum || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">P/V (Per Vaginum)</p>
              <p className="text-slate-900 whitespace-pre-line">{record.perVaginum || '—'}</p>
            </div>
          </div>
          <div>
            <p className="text-sm text-slate-600">Diagnosis</p>
            <p className="text-slate-900 whitespace-pre-line">{record.diagnosis || '—'}</p>
          </div>
          <div>
            <p className="text-sm text-slate-600">Treatment Advice</p>
            <p className="text-slate-900 whitespace-pre-line">{record.treatmentAdvice || '—'}</p>
          </div>
          <div>
            <p className="text-sm text-slate-600">Follow-up Advice</p>
            <p className="text-slate-900 whitespace-pre-line">{record.followUpAdvice || '—'}</p>
          </div>
          {record.labReports && record.labReports.length > 0 && (
            <div>
              <p className="text-sm text-slate-600">Lab Reports</p>
              <p className="text-slate-500">{record.labReports.join(', ')}</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

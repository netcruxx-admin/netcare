'use client';

import { X } from 'lucide-react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { toast } from 'sonner';
import { apiError } from '@/lib/apiError';
import { useUpdatePatientMutation } from '@/store/api';
import type { Patient } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  PatientProfileFields,
  patientProfilePayload,
  patientProfileSchemaFields,
  patientProfileValues,
} from './patientProfile';

/**
 * Correcting a patient record.
 *
 * Shows every field the two registration forms collect, because a detail
 * gathered at one door has to be fixable from here — insurance was collected
 * at sign-up and then unreachable, since this modal's schema had no field for
 * it and the API's PatientUpdate did not either.
 */

const editSchema = Yup.object(patientProfileSchemaFields);

interface Props {
  /** Patient to edit. Pass null to close the modal. */
  patient: Patient | null;
  onClose: () => void;
  onSuccess: () => void;
  /** Superadmin-only: routes the request to the correct tenant. */
  hospitalId?: string;
}

export function EditPatientModal({ patient, onClose, onSuccess, hospitalId }: Props) {
  const [updatePatient] = useUpdatePatientMutation();

  if (!patient) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <DialogTitle className="text-lg font-bold text-slate-900">Edit Patient</DialogTitle>
            <p className="text-xs text-slate-400">{patient.user?.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            <X className="w-5 h-5" />
          </button>
        </div>
        <Formik
          initialValues={patientProfileValues(patient)}
          validationSchema={editSchema}
          onSubmit={async (values, { setSubmitting, setStatus }) => {
            setStatus('');
            try {
              await updatePatient({
                id: patient.id,
                body: patientProfilePayload(values),
                hospitalId,
              }).unwrap();
              toast.success('Patient updated');
              onSuccess();
              onClose();
            } catch (err) {
              setStatus(apiError(err, 'Failed to save patient'));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ isSubmitting, status, dirty }) => (
            <Form className="flex flex-col flex-1 min-h-0">
              <div className="px-6 py-5 space-y-6 overflow-y-auto flex-1">
                <PatientProfileFields />
                {status && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {status}
                  </p>
                )}
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !dirty}
                  variant="brand"
                  className="flex-1"
                >
                  {isSubmitting ? <Spinner size="sm" label="Saving…" /> : 'Save Changes'}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  );
}

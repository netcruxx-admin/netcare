'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Formik, Form, type FormikProps } from 'formik';
import * as Yup from 'yup';
import { superadminPost, superadminGet } from '@/lib/superadminFetch';
import type { HospitalInfo } from '@/store/api';
import type { Patient, Doctor, Department, ConsultationFee } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/form/FormField';
import { PaymentModeField, type CounterPaymentMode } from '@/components/payments/PaymentModeField';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedHospitalId: string;
  hospitals: HospitalInfo[];
}

interface AppointmentFormValues {
  patientId: string;
  doctorId: string;
  departmentId: string;
  date: string;
  time: string;
  reason: string;
  mode: string;
  visitType: string;
}

const EMPTY_FORM: AppointmentFormValues = {
  patientId: '', doctorId: '', departmentId: '',
  date: '', time: '', reason: '', mode: 'in-person', visitType: 'new',
};

const schema = Yup.object({
  patientId: Yup.string().required('Patient is required'),
  doctorId: Yup.string().required('Doctor is required'),
  departmentId: Yup.string().required('Department is required'),
  date: Yup.string().required('Date is required'),
  time: Yup.string().required('Time is required'),
});

export function AddAppointmentModal({ open, onClose, onSuccess, preselectedHospitalId, hospitals }: Props) {
  const [hospitalId, setHospitalId] = useState(preselectedHospitalId);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [fees, setFees] = useState<ConsultationFee[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  // Counter modes only — same reason as the superadmin booking page: a Razorpay
  // checkout here would be the platform paying on the hospital's account.
  const [paymentMode, setPaymentMode] = useState<CounterPaymentMode>('cash');
  const [error, setError] = useState('');
  const formikRef = useRef<FormikProps<AppointmentFormValues>>(null);

  // Load patients / doctors / departments whenever the hospital changes
  useEffect(() => {
    if (!hospitalId || !open) return;
    setLoadingOptions(true);
    setPatients([]); setDoctors([]); setDepartments([]); setFees([]);
    formikRef.current?.setFieldValue('patientId', '');
    formikRef.current?.setFieldValue('doctorId', '');
    formikRef.current?.setFieldValue('departmentId', '');

    Promise.all([
      superadminGet<Patient[]>('/patients', hospitalId),
      superadminGet<Doctor[]>('/doctors', hospitalId),
      superadminGet<Department[]>('/departments', hospitalId),
      // That hospital's price list — what the visit is billed at is theirs, not ours.
      superadminGet<ConsultationFee[]>('/consultation-fees', hospitalId),
    ])
      .then(([p, d, dep, f]) => { setPatients(p); setDoctors(d); setDepartments(dep); setFees(f); })
      .catch(() => {/* silent — dropdowns stay empty */})
      .finally(() => setLoadingOptions(false));
  }, [hospitalId, open]);

  const handleClose = () => {
    formikRef.current?.resetForm({ values: EMPTY_FORM });
    setError(''); setHospitalId(preselectedHospitalId); setPaymentMode('cash');
    setPatients([]); setDoctors([]); setDepartments([]); setFees([]);
    onClose();
  };

  // Helper to get patient display name (needs user lookup — use userId as fallback)
  const patientLabel = (p: Patient) => p.user?.name ?? p.userId;
  const doctorLabel = (d: Doctor) => d.user?.name ?? d.userId;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent showCloseButton={false} className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
          <DialogTitle className="text-lg font-bold text-slate-900">Add Appointment</DialogTitle>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-900 p-1"><X className="w-5 h-5" /></button>
        </div>
        <Formik
          innerRef={formikRef}
          initialValues={EMPTY_FORM}
          validationSchema={schema}
          onSubmit={async (values, { setSubmitting }) => {
            if (!hospitalId) { setError('Please select a hospital'); setSubmitting(false); return; }
            setError('');
            try {
              await superadminPost('/appointments', hospitalId, {
                patientId: values.patientId, doctorId: values.doctorId,
                departmentId: values.departmentId, date: values.date,
                time: values.time, reason: values.reason.trim(),
                mode: values.mode, status: 'scheduled',
                visitType: values.visitType, paymentMode,
              });
              onSuccess(); handleClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to create appointment');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ isSubmitting, dirty }) => (
            <Form className="flex flex-col flex-1 min-h-0 px-6 py-5 space-y-4 overflow-y-auto">
              {/* Hospital picker */}
              {!preselectedHospitalId ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Hospital <span className="text-red-500">*</span></label>
                  <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500">
                    <option value="">Select a hospital…</option>
                    {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600">
                  Hospital: <span className="font-medium text-slate-900">{hospitals.find(h => h.id === preselectedHospitalId)?.name}</span>
                </div>
              )}

              {/* Patient / Doctor / Dept — disabled until hospital is chosen */}
              <fieldset disabled={!hospitalId} className="space-y-4">
                {loadingOptions && (
                  <p className="text-xs text-slate-400 text-center">Loading options…</p>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    name="patientId"
                    label="Patient"
                    as="select"
                    required
                    placeholder={patients.length ? 'Select patient…' : 'No patients yet'}
                    options={patients.map((p) => ({ value: p.id, label: patientLabel(p) }))}
                  />
                  <FormField
                    name="doctorId"
                    label="Doctor"
                    as="select"
                    required
                    placeholder={doctors.length ? 'Select doctor…' : 'No doctors yet'}
                    options={doctors.map((d) => ({ value: d.id, label: doctorLabel(d) }))}
                  />
                  <FormField
                    name="departmentId"
                    label="Department"
                    as="select"
                    required
                    placeholder={departments.length ? 'Select dept…' : 'No departments yet'}
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                  />
                  <FormField
                    name="mode"
                    label="Mode"
                    as="select"
                    options={[
                      { value: 'in-person', label: 'In-Person' },
                      { value: 'video', label: 'Video' },
                    ]}
                  />
                  <FormField name="date" label="Date" type="date" required />
                  <FormField name="time" label="Time" type="time" required />
                  <FormField
                    name="visitType"
                    label="Visit Type"
                    as="select"
                    options={
                      fees.length === 0
                        ? [{ value: 'new', label: 'New Patient' }]
                        : fees.map((f) => ({
                            value: f.visitType,
                            label: f.amount > 0 ? `${f.label} — ₹${f.amount}` : f.label,
                          }))
                    }
                  />
                  <div className="col-span-2">
                    <FormField name="reason" label="Reason" placeholder="e.g. Routine checkup" />
                  </div>
                  <div className="col-span-2">
                    <PaymentModeField value={paymentMode} onChange={setPaymentMode} allowOnline={false} />
                  </div>
                </div>
              </fieldset>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={handleClose} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition">Cancel</button>
                <Button type="submit" disabled={isSubmitting || !dirty || !hospitalId} variant="brand" className="flex-1">{isSubmitting ? <Spinner size="sm" label="Booking…" /> : 'Book Appointment'}</Button>
              </div>
            </Form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  );
}

'use client';

/**
 * The admission-creation flow — one component shared by admin, doctor and
 * receptionist, the same multi-role reuse AdminBook already has for booking.
 * A doctor holds admissions.create at "own" scope, so their doctor field is
 * locked to their own record rather than offered as a picker, mirroring how
 * a patient's own id is locked (not offered) in the booking flow's own-scope
 * case.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { AlertCircle, Hospital } from 'lucide-react';
import { toast } from 'sonner';
import { apiError } from '@/lib/apiError';
import { doctorRole, permissionScope } from '@/lib/roles';
import type { RoleViewProps } from '@/components/RoleView';
import { DashboardShell } from '@/components/DashboardShell';
import { FormField } from '@/components/form/FormField';
import { Spinner } from '@/components/ui/spinner';
import {
  useCreateAdmissionMutation,
  useGetDoctorByUserQuery,
  useListBedsPagedQuery,
  useListDoctorsQuery,
  useListPatientsQuery,
  useListWardsPagedQuery,
} from '@/store/api';

const admitSchema = Yup.object({
  patientId: Yup.string().required('Select a patient'),
  doctorId: Yup.string().required('Select the admitting doctor'),
  // Ward is a picker-level filter only — the API takes bed_id alone and
  // derives the ward from it, so the two can never be sent disagreeing.
  wardId: Yup.string().required('Select a ward'),
  bedId: Yup.string().required('Select a bed'),
  admissionType: Yup.string().required(),
  provisionalDiagnosis: Yup.string(),
  billingMode: Yup.string().oneOf(['advance', 'credit']).required(),
  // Required and positive on an advance, and refused outright on a credit
  // admission — the API rejects a stray amount rather than dropping it, so the
  // form must not be able to send one.
  advanceAmount: Yup.number()
    .transform((v, original) => (original === '' ? undefined : v))
    .when('billingMode', {
      is: 'advance',
      then: (schema) =>
        schema
          .typeError('Enter the advance amount')
          .required('Enter the advance amount')
          .moreThan(0, 'The advance must be greater than zero'),
      otherwise: (schema) => schema.strip(),
    }),
});

export function AdmitPatientForm({ session }: RoleViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPatientId = searchParams.get('patient') ?? '';

  const isOwnScope = permissionScope(session.permissions, 'admissions.create') === 'own';
  const { data: ownDoctor } = useGetDoctorByUserQuery(session.user.id, {
    skip: session.user.role !== doctorRole,
  });

  const { data: patients = [], isLoading: loadingPatients } = useListPatientsQuery();
  const { data: doctors = [], isLoading: loadingDoctors } = useListDoctorsQuery();
  const { data: wardPage } = useListWardsPagedQuery({ limit: 100 });
  const wards = wardPage?.items ?? [];
  const { data: bedPage, isLoading: loadingBeds } = useListBedsPagedQuery({
    limit: 200,
    status: 'vacant',
  });
  const vacantBeds = bedPage?.items ?? [];
  const [createAdmission] = useCreateAdmissionMutation();

  const patientOptions = patients.map((p) => ({
    value: p.id,
    label: p.user ? `${p.user.name} (${p.user.email})` : p.id,
  }));
  const doctorOptions = doctors.map((d) => ({
    value: d.id,
    label: `Dr. ${d.user?.name ?? 'Doctor'}`,
  }));
  // Only wards that actually have a free bed: offering one with none would
  // lead straight to an empty bed picker with nothing to explain it.
  const wardOptions = wards
    .filter((w) => vacantBeds.some((b) => b.wardId === w.id))
    .map((w) => ({ value: w.id, label: w.name }));
  const bedOptionsFor = (wardId: string) =>
    vacantBeds
      .filter((b) => b.wardId === wardId)
      .map((b) => ({
        value: b.id,
        label: `Bed ${b.bedNumber} (₹${b.dailyRate.toLocaleString('en-IN')}/night)`,
      }));

  const loading = loadingPatients || loadingDoctors || loadingBeds;

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Admit Patient"
      subtitle="Open a new in-patient stay"
    >
      <div className="max-w-2xl">
        {loading ? (
          <Spinner variant="block" />
        ) : vacantBeds.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <Hospital className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No vacant beds right now.</p>
            <p className="text-sm text-slate-400 mt-1">
              Free up a bed or add one from Wards &amp; Beds before admitting a patient.
            </p>
          </div>
        ) : (
          <Formik
            initialValues={{
              patientId: preselectedPatientId,
              doctorId: isOwnScope ? ownDoctor?.id ?? '' : '',
              wardId: '',
              bedId: '',
              admissionType: 'planned',
              provisionalDiagnosis: '',
              billingMode: 'credit' as 'advance' | 'credit',
              advanceAmount: '',
            }}
            enableReinitialize
            validationSchema={admitSchema}
            onSubmit={async (values, { setSubmitting, setStatus }) => {
              // wardId is deliberately not sent: AdmissionCreate takes bed_id
              // and reads the ward off the bed.
              const { advanceAmount, wardId: _wardId, ...rest } = values;
              try {
                const admission = await createAdmission({
                  ...rest,
                  // Only ever sent on an advance stay: the API refuses a stray
                  // amount on a credit one rather than ignoring it.
                  ...(values.billingMode === 'advance'
                    ? { advanceAmount: Number(advanceAmount) }
                    : {}),
                }).unwrap();
                toast.success(
                  values.billingMode === 'advance'
                    ? `Patient admitted — ₹${Number(advanceAmount).toLocaleString('en-IN')} advance recorded`
                    : 'Patient admitted',
                );
                router.push(`/dashboard/ipd/${admission.id}`);
              } catch (err) {
                setStatus(apiError(err, 'Could not admit the patient'));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {({ isSubmitting, status, errors, touched, values, setFieldValue }) => (
              <Form className="bg-white rounded-xl shadow p-6 space-y-5">
                {status && (
                  <p className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {status}
                  </p>
                )}

                <FormField
                  name="patientId"
                  label="Patient"
                  as="select"
                  placeholder="Select a patient"
                  options={patientOptions}
                  required
                />

                {isOwnScope ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Admitting doctor</label>
                    <p className="text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      Dr. {session.user.name} (you)
                    </p>
                    {!ownDoctor && (
                      <p className="text-xs text-red-500 mt-1">
                        Your doctor profile could not be found — you cannot admit under your own
                        name until it is.
                      </p>
                    )}
                  </div>
                ) : (
                  <FormField
                    name="doctorId"
                    label="Admitting Doctor"
                    as="select"
                    placeholder="Select a doctor"
                    options={doctorOptions}
                    required
                  />
                )}

                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField
                    name="wardId"
                    label="Ward"
                    as="select"
                    placeholder="Select a ward"
                    options={wardOptions}
                    onValueChange={() => {
                      // A bed from the previous ward would no longer be in the
                      // list the picker is showing.
                      if (values.bedId) setFieldValue('bedId', '');
                    }}
                    required
                  />
                  <FormField
                    name="bedId"
                    label="Bed"
                    as="select"
                    placeholder={values.wardId ? 'Select a vacant bed' : 'Pick a ward first'}
                    options={bedOptionsFor(values.wardId)}
                    required
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField
                    name="admissionType"
                    label="Admission Type"
                    as="select"
                    options={[
                      { value: 'planned', label: 'Planned' },
                      { value: 'emergency', label: 'Emergency' },
                    ]}
                    required
                  />
                  <FormField
                    name="billingMode"
                    label="Billing"
                    as="select"
                    options={[
                      { value: 'credit', label: 'Credit (settled later)' },
                      { value: 'advance', label: 'Advance (paid now)' },
                    ]}
                    onValueChange={(mode) => {
                      // A stale amount left behind by switching to credit
                      // would be refused by the API, which rejects a stray
                      // advance rather than ignoring it.
                      if (mode !== 'advance') setFieldValue('advanceAmount', '');
                    }}
                    required
                  />
                </div>

                {values.billingMode === 'advance' && (
                  <div>
                    <FormField
                      name="advanceAmount"
                      label="Advance Amount (₹)"
                      type="number"
                      min="0"
                      placeholder="e.g. 10000"
                      required
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Recorded as a deposit against the stay, so it counts toward the bill
                      straight away.
                    </p>
                  </div>
                )}

                <FormField
                  name="provisionalDiagnosis"
                  label="Provisional Diagnosis"
                  as="textarea"
                  placeholder="Reason for admission"
                />

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || (isOwnScope && !ownDoctor)}
                    className="bg-cyan-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-cyan-700 transition disabled:opacity-60"
                  >
                    {isSubmitting ? <Spinner size="sm" label="Admitting…" /> : 'Admit Patient'}
                  </button>
                </div>
              </Form>
            )}
          </Formik>
        )}
      </div>
    </DashboardShell>
  );
}

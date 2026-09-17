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
  bedId: Yup.string().required('Select a bed'),
  admissionType: Yup.string().required(),
  provisionalDiagnosis: Yup.string(),
  payerType: Yup.string().required(),
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
  const wardName = (id: string) => wards.find((w) => w.id === id)?.name ?? '';
  const bedOptions = vacantBeds.map((b) => ({
    value: b.id,
    label: `${wardName(b.wardId) || 'Ward'} — Bed ${b.bedNumber} (₹${b.dailyRate.toLocaleString('en-IN')}/night)`,
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
              bedId: '',
              admissionType: 'planned',
              provisionalDiagnosis: '',
              payerType: 'cash',
            }}
            enableReinitialize
            validationSchema={admitSchema}
            onSubmit={async (values, { setSubmitting, setStatus }) => {
              try {
                const admission = await createAdmission(values).unwrap();
                toast.success('Patient admitted');
                router.push(`/dashboard/ipd/${admission.id}`);
              } catch (err) {
                setStatus(apiError(err, 'Could not admit the patient'));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {({ isSubmitting, status, errors, touched }) => (
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

                <FormField
                  name="bedId"
                  label="Bed"
                  as="select"
                  placeholder="Select a vacant bed"
                  options={bedOptions}
                  required
                />

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
                    name="payerType"
                    label="Payer"
                    as="select"
                    options={[
                      { value: 'cash', label: 'Cash' },
                      { value: 'insurance', label: 'Insurance' },
                      { value: 'corporate', label: 'Corporate' },
                    ]}
                    required
                  />
                </div>

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

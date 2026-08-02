'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { UserRound, Plus, X, AlertTriangle, Search, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { FormField } from '@/components/form/FormField';
import { AddPatientModal } from '@/components/superadmin/AddPatientModal';
import { HospitalBadge } from '@/components/superadmin/HospitalBadge';
import { ActionIcon } from '@/components/ActionIcon';
import { apiError } from '@/lib/apiError';
import { hasPermission } from '@/lib/auth';
import type { Patient } from '@/lib/types';
import {
  useGetSuperadminPatientsQuery,
  useGetSuperadminAppointmentsQuery,
  useListHospitalsQuery,
  useUpdatePatientMutation,
  useDeletePatientMutation,
} from '@/store/api';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const editSchema = Yup.object({
  gender: Yup.string(),
  bloodGroup: Yup.string().max(10, 'Too long'),
  dateOfBirth: Yup.string(),
  emergencyContact: Yup.string().max(100, 'Too long'),
  emergencyPhone: Yup.string().max(20, 'Too long'),
  allergies: Yup.string().max(300, 'Too long'),
  chronicDiseases: Yup.string().max(300, 'Too long'),
});

export function PlatformPatients({ session }: RoleViewProps) {
  const searchParams = useSearchParams();
  const selectedHospitalId = searchParams.get('h') ?? '';

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState<Patient | null>(null);
  const [saveError, setSaveError] = useState('');
  const [query, setQuery] = useState('');

  const { data: allPatients = [], isLoading, refetch } = useGetSuperadminPatientsQuery();
  const { data: allAppointments = [] } = useGetSuperadminAppointmentsQuery();
  const { data: hospitals = [] } = useListHospitalsQuery();
  const [updatePatient] = useUpdatePatientMutation();
  const [deletePatient] = useDeletePatientMutation();

  const patients = allPatients
    .filter((p) => !selectedHospitalId || p.hospitalId === selectedHospitalId)
    .filter((p) => {
      const q = query.trim().toLowerCase();
      return !q
        || (p.user?.name ?? '').toLowerCase().includes(q)
        || (p.user?.email ?? '').toLowerCase().includes(q)
        || (p.gender ?? '').toLowerCase().includes(q)
        || (p.bloodGroup ?? '').toLowerCase().includes(q);
    });

  const apptCount = new Map<string, number>();
  allAppointments.forEach((a) => apptCount.set(a.patientId, (apptCount.get(a.patientId) ?? 0) + 1));

  const showHospital = !selectedHospitalId;

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaveError('');
    try {
      await deletePatient({ id: deleting.id, hospitalId: deleting.hospitalId }).unwrap();
      refetch();
      setDeleting(null);
      toast.success('Patient deleted');
    } catch (err) {
      setSaveError(apiError(err, 'Failed to delete patient'));
      setDeleting(null);
    }
  };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="All Patients"
      subtitle={selectedHospitalId ? 'Filtered by selected hospital' : 'Across every hospital on the platform'}
    >
      {saveError && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>
      )}

      {/* Search toolbar */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, gender or blood group…"
            className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {patients.length} patient{patients.length !== 1 ? 's' : ''}
            {(selectedHospitalId || query) && <span className="text-slate-400"> (filtered)</span>}
          </p>
          {hasPermission(session, 'patients.manage') && (
            <button
              onClick={() => setAddModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-medium hover:shadow-lg transition"
            >
              <Plus className="w-4 h-4" /> Add Patient
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : patients.length === 0 ? (
          <div className="py-16 text-center">
            <UserRound className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No patients found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {showHospital && <th className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hospital</th>}
                  {['Name', 'Email', 'Gender', 'Blood Group', 'Phone', 'Appointments'].map((h) => (
                    <th key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                  <th className="text-right py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    {showHospital && (
                      <td className="py-3 px-6">
                        <HospitalBadge hospitalId={p.hospitalId} hospitals={hospitals} />
                      </td>
                    )}
                    <td className="py-3 px-6 font-medium text-slate-900">{p.user?.name ?? '—'}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{p.user?.email ?? '—'}</td>
                    <td className="py-3 px-6 text-slate-600 capitalize">{p.gender || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{p.bloodGroup || '—'}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{p.user?.phone || '—'}</td>
                    <td className="py-3 px-6 font-semibold text-slate-900">{apptCount.get(p.id) ?? 0}</td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {hasPermission(session, 'patients.manage') && <ActionIcon icon={Pencil} label="Edit" onClick={() => setEditing(p)} />}
                        {hasPermission(session, 'patients.manage') && <ActionIcon icon={Trash2} label="Delete" tone="danger" onClick={() => setDeleting(p)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add modal */}
      <AddPatientModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => { refetch(); setAddModalOpen(false); }}
        preselectedHospitalId={selectedHospitalId}
        hospitals={hospitals}
      />

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Edit Patient</h3>
                <p className="text-xs text-slate-400">{editing.user?.name}</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Formik
              initialValues={{
                gender: (editing.gender ?? '').toLowerCase(),
                bloodGroup: editing.bloodGroup ?? '',
                dateOfBirth: editing.dateOfBirth ?? '',
                emergencyContact: editing.emergencyContact ?? '',
                emergencyPhone: editing.emergencyPhone ?? '',
                allergies: editing.allergies ?? '',
                chronicDiseases: editing.chronicDiseases ?? '',
              }}
              validationSchema={editSchema}
              onSubmit={async (values, { setSubmitting }) => {
                setSaveError('');
                try {
                  await updatePatient({ id: editing.id, body: values, hospitalId: editing.hospitalId }).unwrap();
                  refetch();
                  setEditing(null);
                  toast.success('Patient updated');
                } catch (err) {
                  setSaveError(apiError(err, 'Failed to save patient'));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {({ isSubmitting }) => (
                <Form className="flex flex-col flex-1 min-h-0">
                  <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField name="gender" label="Gender" as="select" options={GENDER_OPTIONS} placeholder="Select gender" />
                      <FormField name="bloodGroup" label="Blood Group" placeholder="e.g. O+" />
                    </div>
                    <FormField name="dateOfBirth" label="Date of Birth" type="date" />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField name="emergencyContact" label="Emergency Contact" placeholder="Contact name" />
                      <FormField name="emergencyPhone" label="Emergency Phone" placeholder="+91 98765 43210" />
                    </div>
                    <FormField name="allergies" label="Allergies" as="textarea" placeholder="Known allergies" />
                    <FormField name="chronicDiseases" label="Chronic Diseases" as="textarea" placeholder="Chronic conditions" />
                  </div>
                  <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                    <button type="button" onClick={() => setEditing(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                      Cancel
                    </button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded hover:shadow-lg font-semibold transition disabled:opacity-50">
                      {isSubmitting ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">Delete Patient</h3>
                <p className="text-slate-600 mt-1 text-sm">
                  Are you sure you want to delete{' '}
                  <span className="font-semibold text-slate-900">{deleting.user?.name ?? 'this patient'}</span>?
                  Their account, medical records, and appointments will be permanently removed. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDeleting(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                Cancel
              </button>
              <button onClick={confirmDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold transition">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Stethoscope, Plus, X, AlertTriangle, Search, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { FormField } from '@/components/form/FormField';
import { AddDoctorModal } from '@/components/superadmin/AddDoctorModal';
import { HospitalBadge } from '@/components/superadmin/HospitalBadge';
import { ActionIcon } from '@/components/ActionIcon';
import { apiError } from '@/lib/apiError';
import { hasPermission } from '@/lib/auth';
import type { Doctor } from '@/lib/types';
import {
  useGetSuperadminDoctorsQuery,
  useListHospitalsQuery,
  useUpdateDoctorMutation,
  useDeleteDoctorMutation,
} from '@/store/api';

const editSchema = Yup.object({
  name: Yup.string().trim().required('Name is required').max(100, 'Too long'),
  email: Yup.string().trim().email('Enter a valid email').required('Email is required'),
  phone: Yup.string().trim().max(20, 'Too long'),
  specialization: Yup.string().trim().max(100, 'Too long'),
  qualification: Yup.string().trim().max(100, 'Too long'),
  experienceYears: Yup.number().min(0, 'Cannot be negative').integer('Must be a whole number'),
  consultationFee: Yup.number().min(0, 'Cannot be negative'),
});

export function PlatformDoctors({ session }: RoleViewProps) {
  const searchParams = useSearchParams();
  const selectedHospitalId = searchParams.get('h') ?? '';

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [deleting, setDeleting] = useState<Doctor | null>(null);
  const [saveError, setSaveError] = useState('');
  const [query, setQuery] = useState('');

  const { data: allDoctors = [], isLoading, refetch } = useGetSuperadminDoctorsQuery();
  const { data: hospitals = [] } = useListHospitalsQuery();
  const [updateDoctor] = useUpdateDoctorMutation();
  const [deleteDoctor] = useDeleteDoctorMutation();

  const doctors = allDoctors
    .filter((d) => !selectedHospitalId || d.hospitalId === selectedHospitalId)
    .filter((d) => {
      const q = query.trim().toLowerCase();
      return !q
        || (d.user?.name ?? '').toLowerCase().includes(q)
        || (d.user?.email ?? '').toLowerCase().includes(q)
        || (d.specialization ?? '').toLowerCase().includes(q);
    });

  const showHospital = !selectedHospitalId;

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaveError('');
    try {
      await deleteDoctor({ id: deleting.id, hospitalId: deleting.hospitalId }).unwrap();
      refetch();
      setDeleting(null);
      toast.success('Doctor deleted');
    } catch (err) {
      setSaveError(apiError(err, 'Failed to delete doctor'));
      setDeleting(null);
    }
  };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="All Doctors"
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
            placeholder="Search by name, email or specialization…"
            className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {doctors.length} doctor{doctors.length !== 1 ? 's' : ''}
            {(selectedHospitalId || query) && <span className="text-slate-400"> (filtered)</span>}
          </p>
          {hasPermission(session, 'doctors.manage') && (
            <button
              onClick={() => setAddModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition"
            >
              <Plus className="w-4 h-4" /> Add Doctor
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : doctors.length === 0 ? (
          <div className="py-16 text-center">
            <Stethoscope className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No doctors found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {showHospital && <th className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hospital</th>}
                  {['Name', 'Email', 'Specialization', 'Qualification', 'Experience'].map((h) => (
                    <th key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                  <th className="text-right py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    {showHospital && (
                      <td className="py-3 px-6">
                        <HospitalBadge hospitalId={d.hospitalId} hospitals={hospitals} />
                      </td>
                    )}
                    <td className="py-3 px-6 font-medium text-slate-900">{d.user?.name ?? '—'}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{d.user?.email ?? '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{d.specialization || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{d.qualification || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{d.experienceYears != null ? `${d.experienceYears} yrs` : '—'}</td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {hasPermission(session, 'doctors.manage') && <ActionIcon icon={Pencil} label="Edit" onClick={() => setEditing(d)} />}
                        {hasPermission(session, 'doctors.manage') && <ActionIcon icon={Trash2} label="Delete" tone="danger" onClick={() => setDeleting(d)} />}
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
      <AddDoctorModal
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
                <h3 className="text-lg font-bold text-slate-900">Edit Doctor</h3>
                <p className="text-xs text-slate-400">{editing.user?.email}</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Formik
              initialValues={{
                name: editing.user?.name ?? '',
                email: editing.user?.email ?? '',
                phone: editing.user?.phone ?? '',
                specialization: editing.specialization ?? '',
                qualification: editing.qualification ?? '',
                experienceYears: editing.experienceYears ?? 0,
                consultationFee: editing.consultationFee ?? 0,
              }}
              validationSchema={editSchema}
              onSubmit={async (values, { setSubmitting }) => {
                setSaveError('');
                try {
                  await updateDoctor({
                    id: editing.id,
                    hospitalId: editing.hospitalId,
                    body: {
                      name: values.name.trim(),
                      email: values.email.trim(),
                      phone: values.phone.trim(),
                      specialization: values.specialization.trim(),
                      qualification: values.qualification.trim(),
                      experienceYears: Number(values.experienceYears),
                      consultationFee: Number(values.consultationFee),
                    },
                  }).unwrap();
                  refetch();
                  setEditing(null);
                  toast.success('Doctor updated');
                } catch (err) {
                  setSaveError(apiError(err, 'Failed to save doctor'));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {({ isSubmitting }) => (
                <Form className="flex flex-col flex-1 min-h-0">
                  <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField name="name" label="Full Name" placeholder="Dr. Jane Smith" required />
                      <FormField name="email" label="Email" type="email" placeholder="doctor@hospital.com" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField name="phone" label="Phone" type="tel" placeholder="+91 98765 43210" />
                      <FormField name="specialization" label="Specialization" placeholder="e.g. Cardiology" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField name="qualification" label="Qualification" placeholder="e.g. MBBS, MD" />
                      <FormField name="experienceYears" label="Experience (years)" type="number" placeholder="5" />
                    </div>
                    <FormField name="consultationFee" label="Consultation Fee (₹)" type="number" placeholder="500" />
                  </div>
                  <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                    <button type="button" onClick={() => setEditing(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                      Cancel
                    </button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded hover:shadow-lg font-semibold transition disabled:opacity-50">
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
                <h3 className="text-lg font-bold text-slate-900">Delete Doctor</h3>
                <p className="text-slate-600 mt-1 text-sm">
                  Are you sure you want to delete{' '}
                  <span className="font-semibold text-slate-900">{deleting.user?.name ?? 'this doctor'}</span>?
                  Their account, appointments, and records will be permanently removed. This cannot be undone.
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

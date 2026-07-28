'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Plus, X, Stethoscope, AlertTriangle, Search } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { dbOperations, Doctor, Department } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';
import { FormField } from '@/components/form/FormField';
import { ExportButton } from '@/components/ExportButton';

export default function AdminDoctorsPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [editing, setEditing] = useState<Doctor | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Doctor pending deletion (null = no delete modal open)
  const [deleting, setDeleting] = useState<Doctor | null>(null);
  const [query, setQuery] = useState('');
  const [specFilter, setSpecFilter] = useState('all');

  const refresh = () => setDoctors([...dbOperations.getAllDoctors()]);

  useEffect(() => {
    const session = authStorage.getSession();
    if (!session || session.user.role !== 'admin') {
      router.push('/login');
    } else {
      setSession(session);
      refresh();
      setDepartments(dbOperations.getAllDepartments());
    }
  }, [router]);

  const doctorName = (userId: string) => {
    const user = dbOperations.getUserById(userId);
    return user ? `Dr. ${user.name}` : 'Doctor';
  };

  const editingUser = editing ? dbOperations.getUserById(editing.userId) : null;

  // Department names for the specialization dropdown. Include the doctor's
  // current specialization if it's a legacy value not in the department list.
  const specializationOptions = useMemo(() => {
    const names = departments.map((d) => d.name);
    if (editing && editing.specialization && !names.includes(editing.specialization)) {
      names.unshift(editing.specialization);
    }
    return names.map((n) => ({ value: n, label: n }));
  }, [departments, editing]);

  const doctorSchema = useMemo(
    () =>
      Yup.object({
        name: Yup.string().trim().required('Name is required').max(100, 'Too long'),
        email: Yup.string()
          .trim()
          .email('Enter a valid email')
          .required('Email is required')
          .test('unique-email', 'Email already in use', (value) => {
            if (!value) return true;
            const existing = dbOperations.getUserByEmail(value.trim());
            // Allow the doctor's own email while editing.
            return !existing || existing.id === editing?.userId;
          }),
        phone: Yup.string()
          .trim()
          .required('Phone is required')
          .matches(/^[+]?[\d\s().-]{7,20}$/, 'Enter a valid phone number'),
        specialization: Yup.string().required('Select a specialization'),
        qualification: Yup.string().trim().required('Qualification is required'),
        experienceYears: Yup.number()
          .transform((v, o) => (o === '' ? undefined : v))
          .typeError('Must be a number')
          .min(0, 'Cannot be negative')
          .required('Experience is required'),
        consultationFee: Yup.number()
          .transform((v, o) => (o === '' ? undefined : v))
          .typeError('Must be a number')
          .min(0, 'Cannot be negative')
          .required('Fee is required'),
      }),
    [editing]
  );

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (doctor: Doctor) => {
    setEditing(doctor);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    dbOperations.deleteDoctor(deleting.id);
    refresh();
    setDeleting(null);
  };

  if (!session) {
    return null;
  }

  const specializations = [...new Set(doctors.map((d) => d.specialization))].sort();
  const filtered = doctors
    .filter((d) => specFilter === 'all' || d.specialization === specFilter)
    .filter((d) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const u = dbOperations.getUserById(d.userId);
      return (u?.name ?? '').toLowerCase().includes(q) || d.specialization.toLowerCase().includes(q) || (u?.phone ?? '').toLowerCase().includes(q);
    });

  return (
    <DashboardShell
      role="admin"
      userName={session.user.name}
      title="Doctors"
      subtitle="Manage doctor profiles"
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search doctor, specialization or phone…"
            className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <select
          value={specFilter}
          onChange={(e) => setSpecFilter(e.target.value)}
          className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="all">All Specializations</option>
          {specializations.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <ExportButton
          filename="doctors"
          headers={['Name', 'Phone', 'Specialization', 'Qualification', 'Experience (yrs)', 'Fee']}
          rows={filtered.map((d) => {
            const u = dbOperations.getUserById(d.userId);
            return [u?.name ?? '', u?.phone ?? '', d.specialization, d.qualification, d.experienceYears, d.consultationFee];
          })}
        />
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-slate-900">Doctors ({filtered.length})</h3>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg hover:shadow-lg transition"
          >
            <Plus className="w-4 h-4" />
            Add Doctor
          </button>
        </div>

        {doctors.length === 0 ? (
          <div className="text-center py-16">
            <Stethoscope className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-6">No doctors yet</p>
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg hover:shadow-lg transition"
            >
              <Plus className="w-4 h-4" />
              Add Doctor
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Name</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Phone</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Specialization</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Experience</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Fee</th>
                  <th className="text-right py-3 px-6 font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doctor) => (
                  <tr key={doctor.id} className="border-b hover:bg-slate-50">
                    <td className="py-3 px-6 font-medium">{doctorName(doctor.userId)}</td>
                    <td className="py-3 px-6 text-slate-600">{dbOperations.getUserById(doctor.userId)?.phone || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{doctor.specialization}</td>
                    <td className="py-3 px-6 text-slate-600">{doctor.experienceYears} years</td>
                    <td className="py-3 px-6 text-slate-600">₹{doctor.consultationFee}</td>
                    <td className="py-3 px-6 text-right">
                      <button
                        onClick={() => openEdit(doctor)}
                        className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm mr-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleting(doctor)}
                        className="text-red-600 hover:text-red-700 font-semibold text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {editing ? 'Edit Doctor' : 'Add Doctor'}
              </h3>
              <button onClick={closeModal} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Formik
              initialValues={{
                name: editingUser?.name ?? '',
                email: editingUser?.email ?? '',
                phone: editingUser?.phone ?? '',
                specialization: editing?.specialization ?? '',
                qualification: editing?.qualification ?? '',
                experienceYears: editing ? String(editing.experienceYears) : '',
                consultationFee: editing ? String(editing.consultationFee) : '',
              }}
              validationSchema={doctorSchema}
              onSubmit={(values) => {
                const payload = {
                  name: values.name.trim(),
                  email: values.email.trim(),
                  phone: values.phone.trim(),
                  specialization: values.specialization,
                  qualification: values.qualification.trim(),
                  experienceYears: Number(values.experienceYears),
                  consultationFee: Number(values.consultationFee),
                };
                if (editing) {
                  dbOperations.updateDoctor(editing.id, payload);
                } else {
                  dbOperations.createDoctor(payload);
                }
                refresh();
                closeModal();
              }}
            >
              <Form className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <FormField name="name" label="Full Name" placeholder="e.g. Sarah Smith" autoFocus required />
                </div>
                <div className="sm:col-span-2">
                  <FormField name="email" label="Email" placeholder="doctor@example.com" required />
                </div>
                <div className="sm:col-span-2">
                  <FormField name="phone" label="Phone Number" type="tel" placeholder="+91 98765 43210" required />
                </div>
                <div className="sm:col-span-2">
                  <FormField
                    name="specialization"
                    label="Specialization"
                    as="select"
                    placeholder="Select a department"
                    options={specializationOptions}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <FormField name="qualification" label="Qualification" placeholder="e.g. MBBS, MD" required />
                </div>
                <FormField
                  name="experienceYears"
                  label="Experience (years)"
                  type="number"
                  min="0"
                  placeholder="0"
                  required
                />
                <FormField
                  name="consultationFee"
                  label="Consultation Fee (₹)"
                  type="number"
                  min="0"
                  placeholder="0"
                  required
                />
                <div className="sm:col-span-2 flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded hover:shadow-lg font-semibold transition"
                  >
                    {editing ? 'Save Changes' : 'Add Doctor'}
                  </button>
                </div>
              </Form>
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
                <h3 className="text-lg font-bold text-slate-900">Remove Doctor</h3>
                <p className="text-slate-600 mt-1 text-sm">
                  Are you sure you want to remove{' '}
                  <span className="font-semibold text-slate-900">{doctorName(deleting.userId)}</span>?
                  This also deletes their account and cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDeleting(null)}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold transition"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

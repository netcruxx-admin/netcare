'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Plus, X, AlertTriangle, Search } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { dbOperations, User } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';
import { FormField } from '@/components/form/FormField';
import { ExportButton } from '@/components/ExportButton';

const roleStyle: Record<User['role'], string> = {
  patient: 'bg-cyan-100 text-cyan-700',
  doctor: 'bg-green-100 text-green-700',
  admin: 'bg-purple-100 text-purple-700',
  lab: 'bg-amber-100 text-amber-700',
  nurse: 'bg-pink-100 text-pink-700',
};

const roleOptions = [
  { value: 'patient', label: 'Patient' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'admin', label: 'Admin' },
  { value: 'lab', label: 'Lab Technician' },
];

export default function AdminUsersPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [users, setUsers] = useState<User[]>([]);

  const [editing, setEditing] = useState<User | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | User['role']>('all');

  const refresh = () => setUsers([...dbOperations.getAllUsers()]);

  const filtered = users
    .filter((u) => roleFilter === 'all' || u.role === roleFilter)
    .filter((u) => {
      const q = query.trim().toLowerCase();
      return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone ?? '').toLowerCase().includes(q);
    });

  useEffect(() => {
    const session = authStorage.getSession();
    if (!session || session.user.role !== 'admin') {
      router.push('/login');
    } else {
      setSession(session);
      refresh();
    }
  }, [router]);

  const userSchema = useMemo(
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
            return !existing || existing.id === editing?.id;
          }),
        phone: Yup.string()
          .trim()
          .required('Phone is required')
          .matches(/^[+]?[\d\s().-]{7,20}$/, 'Enter a valid phone number'),
        role: Yup.string()
          .oneOf(['patient', 'doctor', 'admin', 'lab'], 'Select a role')
          .required('Role is required'),
        // Password only required when creating a new user.
        password: editing
          ? Yup.string()
          : Yup.string().min(6, 'At least 6 characters').required('Password is required'),
      }),
    [editing]
  );

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    dbOperations.deleteUser(deleting.id);
    refresh();
    setDeleting(null);
  };

  if (!session) {
    return null;
  }

  return (
    <DashboardShell
      role="admin"
      userName={session.user.name}
      title="System Users"
      subtitle="Monitor users and their roles"
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or phone…"
            className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
          className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="all">All Roles</option>
          <option value="patient">Patient</option>
          <option value="doctor">Doctor</option>
          <option value="admin">Admin</option>
          <option value="lab">Lab Technician</option>
        </select>
        <ExportButton
          filename="users"
          headers={['Name', 'Email', 'Phone', 'Role']}
          rows={filtered.map((u) => [u.name, u.email, u.phone ?? '', u.role])}
        />
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-slate-900">Users ({filtered.length})</h3>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg hover:shadow-lg transition"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left py-3 px-6 font-semibold text-slate-900">Name</th>
                <th className="text-left py-3 px-6 font-semibold text-slate-900">Email</th>
                <th className="text-left py-3 px-6 font-semibold text-slate-900">Phone</th>
                <th className="text-left py-3 px-6 font-semibold text-slate-900">Role</th>
                <th className="text-right py-3 px-6 font-semibold text-slate-900">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => {
                const isSelf = user.id === session.user.id;
                return (
                  <tr key={user.id} className="border-b hover:bg-slate-50">
                    <td className="py-3 px-6 font-medium">
                      {user.name}
                      {isSelf && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                    </td>
                    <td className="py-3 px-6 text-slate-600">{user.email}</td>
                    <td className="py-3 px-6 text-slate-600">{user.phone || '—'}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm capitalize ${roleStyle[user.role]}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <button
                        onClick={() => openEdit(user)}
                        className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm mr-4"
                      >
                        Edit
                      </button>
                      {isSelf ? (
                        <button className="text-slate-400 cursor-not-allowed font-semibold text-sm" disabled>
                          Delete
                        </button>
                      ) : (
                        <button
                          onClick={() => setDeleting(user)}
                          className="text-red-600 hover:text-red-700 font-semibold text-sm"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">{editing ? 'Edit User' : 'Add User'}</h3>
              <button onClick={closeModal} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Formik
              initialValues={{
                name: editing?.name ?? '',
                email: editing?.email ?? '',
                phone: editing?.phone ?? '',
                role: editing?.role ?? '',
                password: '',
              }}
              validationSchema={userSchema}
              onSubmit={(values) => {
                if (editing) {
                  dbOperations.updateUser(editing.id, {
                    name: values.name.trim(),
                    email: values.email.trim(),
                    phone: values.phone.trim(),
                    role: values.role as User['role'],
                  });
                } else {
                  dbOperations.createUser({
                    id: `user-${Date.now()}`,
                    name: values.name.trim(),
                    email: values.email.trim(),
                    phone: values.phone.trim(),
                    role: values.role as User['role'],
                    password: values.password,
                    createdAt: new Date().toISOString(),
                  });
                }
                refresh();
                closeModal();
              }}
            >
              <Form className="space-y-4">
                <FormField name="name" label="Full Name" placeholder="e.g. John Doe" autoFocus required />
                <FormField name="email" label="Email" type="email" placeholder="user@example.com" required />
                <FormField name="phone" label="Phone Number" type="tel" placeholder="+91 98765 43210" required />
                <FormField
                  name="role"
                  label="Role"
                  as="select"
                  placeholder="Select a role"
                  options={roleOptions}
                  required
                />
                {!editing && (
                  <FormField
                    name="password"
                    label="Password"
                    type="password"
                    placeholder="Minimum 6 characters"
                    required
                  />
                )}
                <div className="flex gap-3 pt-2">
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
                    {editing ? 'Save Changes' : 'Add User'}
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
                <h3 className="text-lg font-bold text-slate-900">Delete User</h3>
                <p className="text-slate-600 mt-1 text-sm">
                  Are you sure you want to delete{' '}
                  <span className="font-semibold text-slate-900">{deleting.name}</span>? Any linked
                  doctor or patient profile is removed too. This cannot be undone.
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
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { FormField } from '@/components/form/FormField';
import { PhoneField, toPhoneDigits, withPrefix } from '@/components/form/PhoneField';
import { superadminPost } from '@/lib/superadminFetch';
import { apiError } from '@/lib/apiError';
import {
  useCreateUserMutation,
  useUpdateUserMutation,
  useListAssignableRolesQuery,
} from '@/store/api';
import type { HospitalInfo, RoleOption } from '@/store/api';
import type { User } from '@/lib/types';

const EMPTY_ROLES: RoleOption[] = [];

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editing?: User | null;
  // Superadmin-only: pass hospitals to enable hospital selector
  hospitals?: HospitalInfo[];
  preselectedHospitalId?: string;
}

export function AddUserModal({
  open,
  onClose,
  onSuccess,
  editing = null,
  hospitals,
  preselectedHospitalId = '',
}: Props) {
  const isSuperadmin = hospitals !== undefined;
  const isEditing = editing !== null;

  const [hospitalId, setHospitalId] = useState(preselectedHospitalId);

  const { data: assignableRoles = EMPTY_ROLES } = useListAssignableRolesQuery();
  const roleOptions = useMemo(
    () => assignableRoles.map((r) => ({ value: r.code, label: r.label })),
    [assignableRoles],
  );

  const [createUser] = useCreateUserMutation();
  const [updateUser] = useUpdateUserMutation();

  const schema = useMemo(
    () =>
      Yup.object({
        name: Yup.string().trim().required('Name is required').max(100, 'Too long'),
        email: Yup.string().trim().email('Enter a valid email').required('Email is required'),
        phone: Yup.string()
          .matches(/^\d{10}$/, 'Enter a valid 10-digit mobile number')
          .required('Phone is required'),
        role: Yup.string()
          .oneOf(roleOptions.map((r) => r.value), 'Select a role')
          .required('Role is required'),
        password: isEditing
          ? Yup.string()
          : Yup.string().min(6, 'At least 6 characters').required('Password is required'),
      }),
    [isEditing, roleOptions],
  );

  if (!open) return null;

  const handleClose = () => {
    setHospitalId(preselectedHospitalId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">{isEditing ? 'Edit User' : 'Add User'}</h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-900 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <Formik
          initialValues={{
            name: editing?.name ?? '',
            email: editing?.email ?? '',
            phone: toPhoneDigits(editing?.phone ?? ''),
            role: editing?.role ?? (roleOptions[0]?.value ?? ''),
            password: '',
          }}
          enableReinitialize
          validationSchema={schema}
          onSubmit={async (values, { setSubmitting, setStatus }) => {
            setStatus('');
            const body = {
              name: values.name.trim(),
              email: values.email.trim(),
              phone: withPrefix(values.phone),
              role: values.role,
            };

            try {
              if (isEditing) {
                // Both admin and superadmin edit use the same mutation;
                // superadmin passes hospitalId so the request targets the right tenant.
                await updateUser({
                  id: editing!.id,
                  hospitalId: isSuperadmin ? editing!.hospitalId : undefined,
                  body,
                }).unwrap();
                toast.success('User updated');
              } else {
                if (isSuperadmin) {
                  if (!hospitalId) {
                    setStatus('Please select a hospital');
                    return;
                  }
                  await superadminPost('/users', hospitalId, { ...body, password: values.password });
                } else {
                  await createUser({ ...body, password: values.password }).unwrap();
                }
                toast.success('User created');
              }

              onSuccess();
              handleClose();
            } catch (err) {
              setStatus(apiError(err, 'Failed to save user'));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ isSubmitting, status }) => (
            <Form className="px-6 py-5 space-y-4" autoComplete="off">
              {/* Hospital selector — superadmin only, create only */}
              {isSuperadmin && !isEditing && (
                preselectedHospitalId ? (
                  <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600">
                    Hospital:{' '}
                    <span className="font-medium text-slate-900">
                      {hospitals.find((h) => h.id === preselectedHospitalId)?.name}
                    </span>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Hospital <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={hospitalId}
                      onChange={(e) => setHospitalId(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">Select a hospital…</option>
                      {hospitals.map((h) => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                  </div>
                )
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <FormField name="name" label="Full Name" placeholder="e.g. John Doe" autoFocus required />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <FormField name="role" label="Role" as="select" placeholder="Select a role" options={roleOptions} required />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <FormField name="email" label="Email" type="email" placeholder="user@example.com" required />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <PhoneField name="phone" label="Phone Number" required />
                </div>
                {!isEditing && (
                  <div className="col-span-2">
                    <FormField name="password" label="Password" type="password" placeholder="Minimum 6 characters" autoComplete="new-password" required />
                  </div>
                )}
              </div>

              {status && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{status}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-semibold hover:shadow-lg transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Add User'}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
}

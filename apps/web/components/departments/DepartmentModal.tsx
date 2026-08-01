'use client';

import { useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { FormField } from '@/components/form/FormField';
import { superadminPost } from '@/lib/superadminFetch';
import {
  useCreateDepartmentMutation,
  useUpdateDepartmentMutation,
} from '@/store/api';
import type { HospitalInfo } from '@/store/api';
import type { Department } from '@/lib/types';

const departmentSchema = Yup.object({
  name: Yup.string().trim().required('Name is required').max(100, 'Keep it under 100 characters'),
  description: Yup.string().trim().max(200, 'Keep it under 200 characters'),
});

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editing?: Department | null;
  // Superadmin-only: pass hospitals to enable hospital selector
  hospitals?: HospitalInfo[];
  preselectedHospitalId?: string;
}

export function DepartmentModal({
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

  const [createDepartment] = useCreateDepartmentMutation();
  const [updateDepartment] = useUpdateDepartmentMutation();

  if (!open) return null;

  const handleClose = () => {
    setHospitalId(preselectedHospitalId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-900">
            {isEditing ? 'Edit Department' : 'Add Department'}
          </h3>
          <button onClick={handleClose} className="text-slate-500 hover:text-slate-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hospital selector — superadmin only */}
        {isSuperadmin && !isEditing && (
          preselectedHospitalId ? (
            <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 mb-4">
              Hospital:{' '}
              <span className="font-medium text-slate-900">
                {hospitals.find((h) => h.id === preselectedHospitalId)?.name}
              </span>
            </div>
          ) : (
            <div className="mb-4">
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

        <Formik
          initialValues={{
            name: editing?.name ?? '',
            description: editing?.description ?? '',
          }}
          validationSchema={departmentSchema}
          onSubmit={async (values, { setSubmitting }) => {
            try {
              const body = {
                name: values.name.trim(),
                description: values.description.trim(),
              };

              if (isEditing) {
                // Edit: both admin and superadmin use the same mutation
                // (superadmin passes hospitalId in the arg, admin ignores it)
                if (isSuperadmin) {
                  await updateDepartment({
                    id: editing!.id,
                    hospitalId: editing!.hospitalId,
                    body,
                  }).unwrap();
                } else {
                  await updateDepartment({ id: editing!.id, body }).unwrap();
                }
                toast.success('Department updated');
              } else {
                // Add: superadmin uses superadminPost; admin uses the tenant-scoped mutation
                if (isSuperadmin) {
                  if (!hospitalId) {
                    // Can't call setFieldError from here — surface via thrown error
                    throw new Error('Please select a hospital');
                  }
                  await superadminPost('/departments', hospitalId, body);
                } else {
                  await createDepartment(body).unwrap();
                }
                toast.success('Department created');
              }

              onSuccess();
              handleClose();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Failed to save department');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ isSubmitting }) => (
            <Form className="space-y-4">
              <FormField name="name" label="Name" placeholder="e.g. Cardiology" autoFocus required />
              <FormField
                name="description"
                label="Description"
                as="textarea"
                placeholder="Short description of the department"
              />
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded hover:shadow-lg font-semibold transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Department'}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
}

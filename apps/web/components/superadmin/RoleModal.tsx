'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useCreateRoleMutation, useListPermissionsQuery, useUpdateRoleMutation } from '@/store/api';
import type { PermissionGrant, RoleInfo } from '@/store/api';
import { PermissionMatrix } from '@/components/roles/PermissionMatrix';
import { FormField } from '@/components/form/FormField';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Present when editing; the code is then fixed (it is the PK users.role points at). */
  role: RoleInfo | null;
}

interface RoleFormValues {
  code: string;
  label: string;
  description: string;
  isPlatform: boolean;
  sortOrder: string;
  homePath: string;
  permissions: PermissionGrant[];
}

const schema = Yup.object({
  label: Yup.string().trim().required('Display name is required'),
});

export function RoleModal({ open, onClose, onSuccess, role }: Props) {
  const isEdit = role !== null;
  const [error, setError] = useState('');

  // The grantable catalog is backend-owned, so the matrix always reflects what
  // the platform actually supports.
  const { data: catalog = [] } = useListPermissionsQuery();

  const [createRole] = useCreateRoleMutation();
  const [updateRole] = useUpdateRoleMutation();

  useEffect(() => {
    setError('');
  }, [role, open]);

  const initialValues: RoleFormValues = {
    code: role?.code ?? '',
    label: role?.label ?? '',
    description: role?.description ?? '',
    isPlatform: role?.isPlatform ?? false,
    sortOrder: String(role?.sortOrder ?? 0),
    homePath: role?.homePath ?? '',
    permissions: role?.permissions ?? [],
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-2xl flex flex-col max-h-[90vh] p-0 gap-0">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
          <DialogTitle className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Role' : 'Add Role'}</DialogTitle>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 p-1"><X className="w-5 h-5" /></button>
        </div>
        <Formik
          enableReinitialize
          initialValues={initialValues}
          validationSchema={schema}
          onSubmit={async (values, { setSubmitting }) => {
            if (!isEdit && !values.code.trim()) { setError('Role code is required'); setSubmitting(false); return; }
            setError('');
            const body = {
              label: values.label.trim(),
              description: values.description.trim(),
              isPlatform: values.isPlatform,
              sortOrder: Number(values.sortOrder) || 0,
              homePath: values.homePath.trim(),
              // Sent with the role itself: creating a role and deciding what it can do
              // is one decision, so it is one request.
              permissions: values.permissions,
            };
            try {
              if (isEdit) {
                await updateRole({ code: role.code, body }).unwrap();
              } else {
                await createRole({ code: values.code.trim().toLowerCase(), ...body }).unwrap();
              }
              onSuccess();
            } catch (err) {
              const detail = (err as { data?: { detail?: string } }).data?.detail;
              setError(detail ?? 'Failed to save role');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ values, handleChange, handleBlur, setFieldValue, isSubmitting, dirty }) => (
            <Form className="flex flex-col flex-1 min-h-0">
              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                {/* Row 1: Role Code + Display Name */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Role Code <span className="text-red-500">*</span></label>
                    <input
                      name="code"
                      value={values.code}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      disabled={isEdit}
                      placeholder="e.g. pharmacist"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 disabled:bg-slate-50 disabled:text-slate-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      {isEdit
                        ? 'The code is permanent — user accounts reference it.'
                        : 'Lowercase letters, digits, - or _. Stored on every user with this role.'}
                    </p>
                  </div>
                  <FormField name="label" label="Display Name" placeholder="e.g. Pharmacist" required />
                </div>

                {/* Row 2: Description */}
                <FormField name="description" label="Description" as="textarea" rows={2} placeholder="What this role can do" />

                {/* Row 3: Dashboard Path + Sort Order + Platform checkbox */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FormField name="homePath" label="Dashboard Path" placeholder="/dashboard" />
                    <p className="text-xs text-slate-400 mt-1">
                      Where users land after login. Leave blank for the generic dashboard.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-28">
                      <FormField name="sortOrder" label="Sort Order" type="number" />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700 mt-7">
                      <input type="checkbox" name="isPlatform" checked={values.isPlatform} onChange={handleChange} className="w-4 h-4" />
                      Platform-level role
                    </label>
                  </div>
                </div>

                {/* Permissions */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Permissions <span className="text-slate-400 font-normal">({values.permissions.length} selected)</span>
                  </label>
                  <p className="text-xs text-slate-400 mb-2">
                    Everything this role may do. Nothing is implied by the role name — a
                    role with no permissions can sign in and see nothing.
                  </p>
                  <div className="border border-slate-200 rounded-lg p-3">
                    <PermissionMatrix
                      permissions={catalog}
                      granted={values.permissions}
                      onChange={(next) => setFieldValue('permissions', next)}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              </div>

              {/* Sticky footer buttons */}
              <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition">Cancel</button>
                <Button type="submit" disabled={isSubmitting || !dirty} variant="brand" className="flex-1">
                  {isSubmitting ? <Spinner size="sm" label="Saving…" /> : isEdit ? 'Save Changes' : 'Add Role'}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  );
}

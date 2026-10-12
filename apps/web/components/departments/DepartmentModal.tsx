'use client';

import { useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { FormField } from '@/components/form/FormField';
import { apiError } from '@/lib/apiError';
import { superadminPost } from '@/lib/superadminFetch';
import {
  useCreateDepartmentMutation,
  useListFieldCatalogQuery,
  useListSpecialtyOptionsQuery,
  useUpdateDepartmentMutation,
} from '@/store/api';
import type { HospitalInfo } from '@/store/api';
import type { Department } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const departmentSchema = Yup.object({
  name: Yup.string().trim().required('Name is required').max(100, 'Keep it under 100 characters'),
  description: Yup.string().trim().max(200, 'Keep it under 200 characters'),
  specialty: Yup.string(),
  // null = the specialty's default; a list = this department's own choice.
  vitalsOverride: Yup.array().of(Yup.string()).nullable(),
  notesOverride: Yup.array().of(Yup.string()).nullable(),
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
  // The catalog comes from the server, so the form never offers a value the
  // API would refuse.
  const { data: specialties = [] } = useListSpecialtyOptionsQuery(undefined, { skip: !open });
  const { data: catalog } = useListFieldCatalogQuery(undefined, { skip: !open });

  const handleClose = () => {
    setHospitalId(preselectedHospitalId);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent showCloseButton={false} className="max-w-md">
        <div className="flex justify-between items-center mb-4">
          <DialogTitle className="text-lg font-bold text-slate-900">
            {isEditing ? 'Edit Department' : 'Add Department'}
          </DialogTitle>
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
            specialty: editing?.specialty ?? '',
            vitalsOverride: (editing?.vitalsOverride ?? null) as string[] | null,
            notesOverride: (editing?.notesOverride ?? null) as string[] | null,
          }}
          validationSchema={departmentSchema}
          onSubmit={async (values, { setSubmitting }) => {
            try {
              const body = {
                name: values.name.trim(),
                description: values.description.trim(),
                // Blank on create means "guess from the name" server-side.
                specialty: values.specialty,
                vitalsOverride: values.vitalsOverride,
                notesOverride: values.notesOverride,
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
              toast.error(apiError(err, 'Failed to save department'));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ isSubmitting, dirty, values, handleChange, setFieldValue }) => (
            <Form className="space-y-4">
              <FormField name="name" label="Name" placeholder="e.g. Cardiology" autoFocus required />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Specialty</label>
                <select
                  name="specialty"
                  value={values.specialty}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                >
                  <option value="">{isEditing ? 'Not set' : 'Detect from the name'}</option>
                  {specialties.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Decides which specialty screens this department&apos;s doctors are offered.
                </p>
              </div>
              {/* Edit only: the starting point is what the department records today,
                  which does not exist until it has been created. */}
              {isEditing && catalog && (
                <>
                  <FieldChecklist
                    title="Vitals recorded"
                    options={catalog.vitals}
                    value={values.vitalsOverride}
                    defaults={editing?.vitalsFields}
                    onChange={(next) => setFieldValue('vitalsOverride', next)}
                  />
                  <FieldChecklist
                    title="Clinical notes recorded"
                    options={catalog.notes}
                    value={values.notesOverride}
                    defaults={editing?.noteFields}
                    onChange={(next) => setFieldValue('notesOverride', next)}
                  />
                </>
              )}
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
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !dirty}
                  variant="brand"
                  className="flex-1"
                >
                  {isSubmitting ? <Spinner size="sm" label="Saving…" /> : isEditing ? 'Save Changes' : 'Add Department'}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Which fields a visit in this department records. Unticked-and-untouched means
 * "the specialty's default" (value null); the first change makes it this
 * department's own list, and "Use default" goes back.
 */
function FieldChecklist({
  title,
  options,
  value,
  defaults,
  onChange,
}: {
  title: string;
  options: { key: string; label: string }[];
  value: string[] | null;
  /** What the department records today, to start a custom list from. */
  defaults?: string[];
  onChange: (next: string[] | null) => void;
}) {
  const custom = value !== null;
  const ticked = new Set(value ?? defaults ?? options.map((o) => o.key));
  return (
    <fieldset className="rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">{title}</legend>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">
          {custom ? 'Chosen for this department' : "Following the specialty's default"}
        </span>
        {custom && (
          <button type="button" onClick={() => onChange(null)} className="text-xs font-medium text-cyan-700 hover:text-cyan-800">
            Use default
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {options.map((o) => (
          <label key={o.key} className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={ticked.has(o.key)}
              onChange={(e) => {
                const next = new Set(ticked);
                if (e.target.checked) next.add(o.key);
                else next.delete(o.key);
                onChange(options.map((x) => x.key).filter((k) => next.has(k)));
              }}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import { Check, Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCreateWardMutation,
  useDeleteWardMutation,
  useListWardsPagedQuery,
  useUpdateWardMutation,
} from '@/store/api';
import { apiError } from '@/lib/apiError';
import { hasPermission } from '@/lib/auth';
import type { AuthSession } from '@/lib/types';
import type { Ward, WardType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const WARD_TYPES: { value: WardType; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'icu', label: 'ICU' },
  { value: 'nicu', label: 'NICU' },
  { value: 'maternity', label: 'Maternity' },
  { value: 'private', label: 'Private' },
  { value: 'semi_private', label: 'Semi-Private' },
];

const wardTypeLabel = (t: string) => WARD_TYPES.find((w) => w.value === t)?.label ?? t;

/** One ward row, editable in place — same shape as ConsultationFeesContent's
 *  FeeRow, since a hospital has few enough wards that a modal per edit would
 *  only slow the job down. */
function WardRow({ ward, canManage }: { ward: Ward; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [updateWard] = useUpdateWardMutation();
  const [deleteWard] = useDeleteWardMutation();

  const formik = useFormik({
    initialValues: { name: ward.name, wardType: ward.wardType, floor: ward.floor, description: ward.description },
    enableReinitialize: true,
    onSubmit: async (values, { setSubmitting }) => {
      const name = values.name.trim();
      if (!name) {
        toast.error('Give the ward a name');
        setSubmitting(false);
        return;
      }
      try {
        await updateWard({ id: ward.id, body: { ...values, name } }).unwrap();
        toast.success('Ward updated');
        setEditing(false);
      } catch (err) {
        toast.error(apiError(err, 'Could not update the ward'));
      } finally {
        setSubmitting(false);
      }
    },
  });

  async function remove() {
    if (!window.confirm(`Delete ${ward.name}? This cannot be undone.`)) return;
    try {
      await deleteWard({ id: ward.id }).unwrap();
      toast.success('Ward deleted');
    } catch (err) {
      toast.error(apiError(err, 'Could not delete the ward — it may still have an occupied bed'));
    }
  }

  return (
    <TableRow className="border-b hover:bg-slate-50 transition">
      <TableCell className="py-3 px-4 whitespace-normal">
        {editing ? (
          <input
            name="name"
            value={formik.values.name}
            onChange={formik.handleChange}
            className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-48 focus:outline-none focus:border-cyan-500"
          />
        ) : (
          <p className="text-sm font-medium text-slate-900">{ward.name}</p>
        )}
      </TableCell>
      <TableCell className="py-3 px-4 whitespace-normal">
        {editing ? (
          <select
            name="wardType"
            value={formik.values.wardType}
            onChange={formik.handleChange}
            className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-cyan-500"
          >
            {WARD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-slate-600">{wardTypeLabel(ward.wardType)}</span>
        )}
      </TableCell>
      <TableCell className="py-3 px-4 whitespace-normal">
        {editing ? (
          <input
            name="floor"
            value={formik.values.floor}
            onChange={formik.handleChange}
            placeholder="e.g. 2nd Floor"
            className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-32 focus:outline-none focus:border-cyan-500"
          />
        ) : (
          <span className="text-sm text-slate-600">{ward.floor || '—'}</span>
        )}
      </TableCell>
      {canManage && (
        <TableCell className="py-3 px-4 text-right whitespace-normal">
          <div className="flex items-center justify-end gap-1">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => formik.submitForm()}
                  disabled={formik.isSubmitting || !formik.dirty}
                  title="Save"
                  className="p-1.5 rounded text-green-600 hover:bg-green-50 transition"
                >
                  {formik.isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditing(false); formik.resetForm(); }}
                  title="Cancel"
                  className="p-1.5 rounded text-slate-400 hover:bg-slate-100 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs font-medium text-cyan-600 hover:text-cyan-700 px-2 py-1"
                >
                  Edit
                </button>
                <button
                  onClick={remove}
                  title="Delete"
                  className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

export function WardsPanel({ session }: { session: AuthSession }) {
  const canManage = hasPermission(session, 'wards.manage');
  const { data: wardPage, isLoading } = useListWardsPagedQuery({ limit: 100 });
  const wards = wardPage?.items ?? [];
  const [createWard] = useCreateWardMutation();
  const [adding, setAdding] = useState(false);

  const addFormik = useFormik({
    initialValues: { name: '', wardType: 'general' as WardType, floor: '', description: '' },
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      const name = values.name.trim();
      if (!name) {
        toast.error('Give the ward a name');
        setSubmitting(false);
        return;
      }
      try {
        await createWard({ ...values, name }).unwrap();
        toast.success('Ward added');
        setAdding(false);
        resetForm();
      } catch (err) {
        toast.error(apiError(err, 'Could not add the ward'));
      } finally {
        setSubmitting(false);
      }
    },
  });

  if (isLoading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow">
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Wards</h3>
        {canManage && !adding && (
          <Button onClick={() => setAdding(true)} variant="brand" size="sm">
            <Plus className="w-4 h-4" /> Add Ward
          </Button>
        )}
      </div>

      {adding && (
        <div className="px-6 py-4 border-b bg-slate-50 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Name<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              name="name"
              value={addFormik.values.name}
              onChange={addFormik.handleChange}
              placeholder="e.g. Male General Ward"
              autoFocus
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select
              name="wardType"
              value={addFormik.values.wardType}
              onChange={addFormik.handleChange}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500"
            >
              {WARD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Floor</label>
            <input
              name="floor"
              value={addFormik.values.floor}
              onChange={addFormik.handleChange}
              placeholder="e.g. 2nd Floor"
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <button
            type="button"
            onClick={() => addFormik.submitForm()}
            disabled={addFormik.isSubmitting || !addFormik.dirty}
            className="bg-cyan-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-cyan-700 transition disabled:opacity-60"
          >
            {addFormik.isSubmitting ? 'Adding…' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); addFormik.resetForm(); }}
            className="text-sm text-slate-500 px-3 py-1.5 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      )}

      {wards.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-slate-500">No wards yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <TableHead className="py-3 px-4">Name</TableHead>
                <TableHead className="py-3 px-4">Type</TableHead>
                <TableHead className="py-3 px-4">Floor</TableHead>
                {canManage && <TableHead className="py-3 px-4 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {wards.map((w) => (
                <WardRow key={w.id} ward={w} canManage={canManage} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import { Check, Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCreateBedMutation,
  useDeleteBedMutation,
  useListBedsPagedQuery,
  useListWardsPagedQuery,
  useUpdateBedMutation,
} from '@/store/api';
import { apiError } from '@/lib/apiError';
import { hasPermission } from '@/lib/auth';
import type { AuthSession, Bed, BedStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const STATUS_STYLES: Record<BedStatus, string> = {
  vacant: 'bg-green-100 text-green-700',
  occupied: 'bg-red-100 text-red-700',
  maintenance: 'bg-amber-100 text-amber-700',
  reserved: 'bg-slate-100 text-slate-600',
};

const STATUS_LABELS: Record<BedStatus, string> = {
  vacant: 'Vacant',
  occupied: 'Occupied',
  maintenance: 'Maintenance',
  reserved: 'Reserved',
};

function StatusBadge({ status }: { status: BedStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function BedRow({
  bed,
  wardName,
  canManage,
}: {
  bed: Bed;
  wardName: string;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [updateBed] = useUpdateBedMutation();
  const [deleteBed] = useDeleteBedMutation();
  // A bed holding a patient is off-limits here — routers/admissions.py owns
  // its status/fields until the stay ends.
  const locked = bed.status === 'occupied' || bed.status === 'reserved';

  const formik = useFormik({
    initialValues: { bedNumber: bed.bedNumber, bedType: bed.bedType, dailyRate: String(bed.dailyRate) },
    enableReinitialize: true,
    onSubmit: async (values, { setSubmitting }) => {
      const rate = Number(values.dailyRate);
      if (Number.isNaN(rate) || rate < 0) {
        toast.error('Enter a valid daily rate');
        setSubmitting(false);
        return;
      }
      try {
        await updateBed({
          id: bed.id,
          body: { bedNumber: values.bedNumber.trim(), bedType: values.bedType, dailyRate: rate },
        }).unwrap();
        toast.success('Bed updated');
        setEditing(false);
      } catch (err) {
        toast.error(apiError(err, 'Could not update the bed'));
      } finally {
        setSubmitting(false);
      }
    },
  });

  async function toggleMaintenance() {
    try {
      await updateBed({
        id: bed.id,
        body: { status: bed.status === 'maintenance' ? 'vacant' : 'maintenance' },
      }).unwrap();
    } catch (err) {
      toast.error(apiError(err, 'Could not update the bed'));
    }
  }

  async function remove() {
    if (!window.confirm(`Delete bed ${bed.bedNumber}? This cannot be undone.`)) return;
    try {
      await deleteBed({ id: bed.id }).unwrap();
      toast.success('Bed deleted');
    } catch (err) {
      toast.error(apiError(err, 'Could not delete the bed'));
    }
  }

  return (
    <TableRow className="border-b hover:bg-slate-50 transition">
      <TableCell className="py-3 px-4 whitespace-normal">
        {editing ? (
          <input
            name="bedNumber"
            value={formik.values.bedNumber}
            onChange={formik.handleChange}
            className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-24 focus:outline-none focus:border-cyan-500"
          />
        ) : (
          <p className="text-sm font-medium text-slate-900">{bed.bedNumber}</p>
        )}
      </TableCell>
      <TableCell className="py-3 px-4 text-sm text-slate-600 whitespace-normal">{wardName || '—'}</TableCell>
      <TableCell className="py-3 px-4 whitespace-normal">
        {editing ? (
          <input
            name="bedType"
            value={formik.values.bedType}
            onChange={formik.handleChange}
            className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-28 focus:outline-none focus:border-cyan-500"
          />
        ) : (
          <span className="text-sm text-slate-600">{bed.bedType}</span>
        )}
      </TableCell>
      <TableCell className="py-3 px-4 text-right whitespace-normal">
        {editing ? (
          <input
            type="number"
            min="0"
            name="dailyRate"
            value={formik.values.dailyRate}
            onChange={formik.handleChange}
            className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-24 text-right focus:outline-none focus:border-cyan-500"
          />
        ) : (
          <span className="text-sm tabular-nums text-slate-900">₹{bed.dailyRate.toLocaleString('en-IN')}/night</span>
        )}
      </TableCell>
      <TableCell className="py-3 px-4 whitespace-normal">
        {canManage && !locked ? (
          <button onClick={toggleMaintenance} className="inline-block">
            <StatusBadge status={bed.status} />
          </button>
        ) : (
          <StatusBadge status={bed.status} />
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
                  disabled={locked}
                  title={locked ? 'Occupied beds cannot be edited' : undefined}
                  className="text-xs font-medium text-cyan-600 hover:text-cyan-700 px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Edit
                </button>
                <button
                  onClick={remove}
                  disabled={locked}
                  title={locked ? 'Occupied beds cannot be deleted' : 'Delete'}
                  className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
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

export function BedsPanel({ session }: { session: AuthSession }) {
  const canManage = hasPermission(session, 'beds.manage');
  const [wardFilter, setWardFilter] = useState('');
  const { data: wardPage } = useListWardsPagedQuery({ limit: 100 });
  const wards = wardPage?.items ?? [];
  const wardName = (id: string) => wards.find((w) => w.id === id)?.name ?? '';

  const { data: bedPage, isLoading } = useListBedsPagedQuery({
    limit: 200,
    wardId: wardFilter || undefined,
  });
  const beds = bedPage?.items ?? [];
  const [createBed] = useCreateBedMutation();
  const [adding, setAdding] = useState(false);

  const addFormik = useFormik({
    initialValues: { wardId: '', bedNumber: '', bedType: 'general', dailyRate: '' },
    enableReinitialize: true,
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      const bedNumber = values.bedNumber.trim();
      if (!values.wardId) {
        toast.error('Pick a ward');
        setSubmitting(false);
        return;
      }
      if (!bedNumber) {
        toast.error('Give the bed a number');
        setSubmitting(false);
        return;
      }
      const rate = Number(values.dailyRate || 0);
      if (Number.isNaN(rate) || rate < 0) {
        toast.error('Enter a valid daily rate');
        setSubmitting(false);
        return;
      }
      try {
        await createBed({ wardId: values.wardId, bedNumber, bedType: values.bedType, dailyRate: rate }).unwrap();
        toast.success('Bed added');
        setAdding(false);
        resetForm({ values: { ...values, bedNumber: '', dailyRate: '' } });
      } catch (err) {
        toast.error(apiError(err, 'Could not add the bed'));
      } finally {
        setSubmitting(false);
      }
    },
  });

  if (wards.length === 0 && !isLoading) {
    return (
      <div className="bg-white rounded-xl shadow py-16 text-center">
        <p className="text-sm text-slate-500">Add a ward first — beds belong to one.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow">
      <div className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-slate-900">Beds</h3>
          <select
            value={wardFilter}
            onChange={(e) => setWardFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-cyan-500"
          >
            <option value="">All wards</option>
            {wards.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        {canManage && !adding && (
          <Button onClick={() => setAdding(true)} variant="brand" size="sm">
            <Plus className="w-4 h-4" /> Add Bed
          </Button>
        )}
      </div>

      {adding && (
        <div className="px-6 py-4 border-b bg-slate-50 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Ward<span className="text-red-500 ml-0.5">*</span>
            </label>
            <select
              name="wardId"
              value={addFormik.values.wardId}
              onChange={addFormik.handleChange}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select…</option>
              {wards.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Bed number<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              name="bedNumber"
              value={addFormik.values.bedNumber}
              onChange={addFormik.handleChange}
              placeholder="e.g. 12A"
              autoFocus
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <input
              name="bedType"
              value={addFormik.values.bedType}
              onChange={addFormik.handleChange}
              placeholder="general"
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Daily rate (₹)</label>
            <input
              type="number"
              min="0"
              name="dailyRate"
              value={addFormik.values.dailyRate}
              onChange={addFormik.handleChange}
              placeholder="0"
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <button
            type="button"
            onClick={() => addFormik.submitForm()}
            disabled={addFormik.isSubmitting}
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

      {isLoading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : beds.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-slate-500">No beds yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <TableHead className="py-3 px-4">Bed</TableHead>
                <TableHead className="py-3 px-4">Ward</TableHead>
                <TableHead className="py-3 px-4">Type</TableHead>
                <TableHead className="py-3 px-4 text-right">Rate</TableHead>
                <TableHead className="py-3 px-4">Status</TableHead>
                {canManage && <TableHead className="py-3 px-4 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {beds.map((b) => (
                <BedRow key={b.id} bed={b} wardName={wardName(b.wardId)} canManage={canManage} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

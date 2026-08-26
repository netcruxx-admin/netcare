'use client';

import { useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Plus, X, Pill, AlertTriangle, Search, Pencil, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import type { Medicine } from '@/lib/types';
import { DashboardShell } from '@/components/DashboardShell';
import { ActionIcon } from '@/components/ActionIcon';
import { RecordDialog } from '@/components/RecordDialog';
import { FormattedDate } from '@/components/ui/FormattedDate';
import { apiError } from '@/lib/apiError';
import { hasPermission } from '@/lib/auth';
import {
  useCreateMedicineMutation,
  useDeleteMedicineMutation,
  useLazyListMedicinesPagedQuery,
  useListMedicinesPagedQuery,
  useUpdateMedicineMutation,
} from '@/store/api';
import type { RoleViewProps } from '@/components/RoleView';
import { FormField } from '@/components/form/FormField';
import { ExportButton } from '@/components/ExportButton';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { Spinner } from '@/components/ui/spinner';

const CATEGORIES = ['Prenatal', 'Supplement', 'Vitamin', 'Antibiotic', 'Analgesic', 'Antacid', 'Antiemetic', 'Other'];
const FORMS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops'];

const medicineSchema = Yup.object({
  name: Yup.string().trim().required('Name is required').max(100, 'Too long'),
  category: Yup.string().required('Select a category'),
  form: Yup.string().required('Select a form'),
  strength: Yup.string().trim().max(40, 'Too long'),
  price: Yup.number()
    .transform((v, o) => (o === '' ? undefined : v))
    .typeError('Must be a number')
    .min(0, 'Cannot be negative')
    .required('Price is required'),
  stock: Yup.number()
    .transform((v, o) => (o === '' ? undefined : v))
    .typeError('Must be a number')
    .integer('Whole number')
    .min(0, 'Cannot be negative')
    .required('Stock is required'),
});

const categoryOptions = CATEGORIES.map((c) => ({ value: c, label: c }));
const formOptions = FORMS.map((f) => ({ value: f, label: f }));

export function AdminMedicines({ session }: RoleViewProps) {
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<Medicine | null>(null);
  const [viewing, setViewing] = useState<Medicine | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const canManage = hasPermission(session, 'medicines.manage');
  // Deletion is a platform capability: hospital staff create and edit, the
  // platform owner is the one who can erase. See migration x9y0z1a2b3c4.
  const canDelete = hasPermission(session, 'medicines.delete');

  const table = useServerTable({ filterKey: categoryFilter });

  const listArgs = {
    q: table.q.trim() || undefined,
    category: categoryFilter === 'all' ? undefined : categoryFilter,
  };
  const { data: medicinePage, isLoading } = useListMedicinesPagedQuery({
    ...listArgs,
    limit: table.limit,
    offset: table.offset,
  });
  const filtered = medicinePage?.items ?? [];
  const totalMedicines = medicinePage?.total ?? 0;
  const [fetchAllForExport] = useLazyListMedicinesPagedQuery();
  const [createMedicine] = useCreateMedicineMutation();
  const [updateMedicine] = useUpdateMedicineMutation();
  const [deleteMedicine, { isLoading: isDeleting }] = useDeleteMedicineMutation();

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (m: Medicine) => { setEditing(m); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMedicine(deleting.id).unwrap();
      toast.success('Medicine deleted');
      setDeleting(null);
    } catch (err) {
      toast.error(apiError(err, 'Failed to delete medicine'));
      setDeleting(null);
    }
  };

  const stockBadge = (stock: number) =>
    stock === 0
      ? 'bg-red-100 text-red-700'
      : stock < 50
      ? 'bg-amber-100 text-amber-700'
      : 'bg-green-100 text-green-700';

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Medicines" subtitle="Pharmacy catalog">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={table.search}
            onChange={(e) => table.setSearch(e.target.value)}
            placeholder="Search medicine…"
            className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <ExportButton
          filename="medicines"
          headers={['Name', 'Category', 'Form', 'Strength', 'Price', 'Stock']}
          rows={filtered.map((m) => [m.name, m.category, m.form, m.strength, m.price, m.stock])}
          getRows={async () => {
            const all = await fetchAllForExport(listArgs).unwrap();
            return all.items.map((m) => [m.name, m.category, m.form, m.strength, m.price, m.stock]);
          }}
        />
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-slate-900">Medicines ({totalMedicines})</h3>
          {canManage && (
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-medium hover:shadow-lg transition"
            >
              <Plus className="w-4 h-4" />
              Add Medicine
            </button>
          )}
        </div>

        {isLoading ? (
          <Spinner variant="block" />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Pill className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-6">No medicines yet</p>
            {canManage && (
              <button
                onClick={openAdd}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-medium hover:shadow-lg transition"
              >
                <Plus className="w-4 h-4" />
                Add Medicine
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Name</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Category</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Form</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Strength</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Price</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Stock</th>
                  <th className="text-right py-3 px-6 font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className="border-b hover:bg-slate-50">
                    <td className="py-3 px-6 font-medium">{m.name}</td>
                    <td className="py-3 px-6 text-slate-600">{m.category}</td>
                    <td className="py-3 px-6 text-slate-600">{m.form}</td>
                    <td className="py-3 px-6 text-slate-600">{m.strength || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">₹{m.price}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${stockBadge(m.stock)}`}>
                        {m.stock}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ActionIcon icon={Eye} label="View" onClick={() => setViewing(m)} />
                        {canManage && <ActionIcon icon={Pencil} label="Edit" onClick={() => openEdit(m)} />}
                        {canDelete && <ActionIcon icon={Trash2} label="Delete" tone="danger" onClick={() => setDeleting(m)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination
              page={table.page}
              pageSize={table.pageSize}
              total={totalMedicines}
              onPageChange={table.setPage}
            />
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">{editing ? 'Edit Medicine' : 'Add Medicine'}</h3>
              <button onClick={closeModal} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Formik
              initialValues={{
                name: editing?.name ?? '',
                category: editing?.category ?? '',
                form: editing?.form ?? '',
                strength: editing?.strength ?? '',
                price: editing ? String(editing.price) : '',
                stock: editing ? String(editing.stock) : '',
              }}
              validationSchema={medicineSchema}
              onSubmit={async (values, { setSubmitting, setStatus }) => {
                const payload = {
                  name: values.name.trim(),
                  category: values.category,
                  form: values.form,
                  strength: values.strength.trim(),
                  price: Number(values.price),
                  stock: Number(values.stock),
                };
                setStatus('');
                try {
                  if (editing) {
                    await updateMedicine({ id: editing.id, body: payload }).unwrap();
                    toast.success('Medicine updated');
                  } else {
                    await createMedicine(payload).unwrap();
                    toast.success('Medicine added');
                  }
                  closeModal();
                } catch (err) {
                  setStatus(apiError(err, 'Failed to save medicine'));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {({ isSubmitting, status }) => (
                <Form className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <FormField name="name" label="Name" placeholder="e.g. Folic Acid" autoFocus required />
                  </div>
                  <FormField name="category" label="Category" as="select" placeholder="Select category" options={categoryOptions} required />
                  <FormField name="form" label="Form" as="select" placeholder="Select form" options={formOptions} required />
                  <FormField name="strength" label="Strength / Pack" placeholder="e.g. 500 mg" />
                  <FormField name="price" label="Price (₹)" type="number" min="0" placeholder="0" required />
                  <FormField name="stock" label="Stock (units)" type="number" min="0" placeholder="0" required />
                  {status && (
                    <p className="sm:col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {status}
                    </p>
                  )}
                  <div className="sm:col-span-2 flex gap-3 pt-2">
                    <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center justify-center gap-2 flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded hover:shadow-lg font-semibold transition disabled:opacity-50"
                    >
                      {isSubmitting ? <Spinner size="sm" label="Saving…" /> : editing ? 'Save Changes' : 'Add Medicine'}
                    </button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">Delete Medicine</h3>
                <p className="text-slate-600 mt-1 text-sm">
                  Are you sure you want to delete <span className="font-semibold text-slate-900">{deleting.name}</span>? This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDeleting(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold transition disabled:opacity-50"
              >
                {isDeleting ? <Spinner size="sm" label="Deleting…" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      <RecordDialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ''}
        subtitle={[viewing?.form, viewing?.strength].filter(Boolean).join(' · ')}
        fields={[
          { label: 'Category', value: viewing?.category },
          { label: 'Form', value: viewing?.form },
          { label: 'Strength', value: viewing?.strength },
          { label: 'Unit', value: viewing?.unit },
          { label: 'Price', value: viewing ? `₹${viewing.price}` : '' },
          { label: 'Stock', value: viewing ? String(viewing.stock) : '' },
          { label: 'Reorder level', value: viewing?.reorderLevel?.toString() },
          { label: 'Lot number', value: viewing?.lotNumber },
          { label: 'Expiry', value: viewing?.expiryDate ? <FormattedDate iso={viewing.expiryDate} /> : '' },
          { label: 'Storage location', value: viewing?.location },
        ]}
      />
    </DashboardShell>
  );
}

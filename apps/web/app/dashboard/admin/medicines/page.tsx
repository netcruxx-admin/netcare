'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Plus, X, Pill, AlertTriangle, Search } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { dbOperations, Medicine } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';
import { FormField } from '@/components/form/FormField';
import { ExportButton } from '@/components/ExportButton';

const generateId = () => `med-${Math.random().toString(36).slice(2, 9)}`;

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

export default function AdminMedicinesPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);

  const [editing, setEditing] = useState<Medicine | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<Medicine | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const refresh = () => setMedicines([...dbOperations.getAllMedicines()]);

  const filtered = medicines
    .filter((m) => categoryFilter === 'all' || m.category === categoryFilter)
    .filter((m) => {
      const q = query.trim().toLowerCase();
      return !q || m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
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

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (m: Medicine) => {
    setEditing(m);
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };
  const confirmDelete = () => {
    if (!deleting) return;
    dbOperations.deleteMedicine(deleting.id);
    refresh();
    setDeleting(null);
  };

  const stockBadge = (stock: number) =>
    stock === 0
      ? 'bg-red-100 text-red-700'
      : stock < 50
      ? 'bg-amber-100 text-amber-700'
      : 'bg-green-100 text-green-700';

  if (!session) {
    return null;
  }

  return (
    <DashboardShell role="admin" userName={session.user.name} title="Medicines" subtitle="Pharmacy catalog">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
        />
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-slate-900">Medicines ({filtered.length})</h3>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg hover:shadow-lg transition"
          >
            <Plus className="w-4 h-4" />
            Add Medicine
          </button>
        </div>

        {medicines.length === 0 ? (
          <div className="text-center py-16">
            <Pill className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-6">No medicines yet</p>
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg hover:shadow-lg transition"
            >
              <Plus className="w-4 h-4" />
              Add Medicine
            </button>
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
                      <button onClick={() => openEdit(m)} className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm mr-4">
                        Edit
                      </button>
                      <button onClick={() => setDeleting(m)} className="text-red-600 hover:text-red-700 font-semibold text-sm">
                        Delete
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
              onSubmit={(values) => {
                const payload = {
                  name: values.name.trim(),
                  category: values.category,
                  form: values.form,
                  strength: values.strength.trim(),
                  price: Number(values.price),
                  stock: Number(values.stock),
                };
                if (editing) {
                  dbOperations.updateMedicine(editing.id, payload);
                } else {
                  dbOperations.createMedicine({ id: generateId(), ...payload });
                }
                refresh();
                closeModal();
              }}
            >
              <Form className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <FormField name="name" label="Name" placeholder="e.g. Folic Acid" autoFocus required />
                </div>
                <FormField name="category" label="Category" as="select" placeholder="Select category" options={categoryOptions} required />
                <FormField name="form" label="Form" as="select" placeholder="Select form" options={formOptions} required />
                <FormField name="strength" label="Strength / Pack" placeholder="e.g. 500 mg" />
                <FormField name="price" label="Price (₹)" type="number" min="0" placeholder="0" required />
                <FormField name="stock" label="Stock (units)" type="number" min="0" placeholder="0" required />
                <div className="sm:col-span-2 flex gap-3 pt-2">
                  <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded hover:shadow-lg font-semibold transition">
                    {editing ? 'Save Changes' : 'Add Medicine'}
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
                <h3 className="text-lg font-bold text-slate-900">Delete Medicine</h3>
                <p className="text-slate-600 mt-1 text-sm">
                  Are you sure you want to delete <span className="font-semibold text-slate-900">{deleting.name}</span>? This cannot be undone.
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

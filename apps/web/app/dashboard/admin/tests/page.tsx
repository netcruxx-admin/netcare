'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Plus, X, FlaskConical, AlertTriangle, Search } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { dbOperations, LabTest } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';
import { FormField } from '@/components/form/FormField';
import { ExportButton } from '@/components/ExportButton';

const generateId = () => `test-${Math.random().toString(36).slice(2, 9)}`;

const CATEGORIES = ['Blood Test', 'Imaging', 'Urine Test', 'Cardiac', 'Prenatal Screening', 'Other'];
const SAMPLE_TYPES = ['Blood', 'Urine', 'Swab', 'Imaging', 'None'];

const testSchema = Yup.object({
  name: Yup.string().trim().required('Name is required').max(100, 'Too long'),
  category: Yup.string().required('Select a category'),
  sampleType: Yup.string().required('Select a sample type'),
  price: Yup.number()
    .transform((v, o) => (o === '' ? undefined : v))
    .typeError('Must be a number')
    .min(0, 'Cannot be negative')
    .required('Price is required'),
  turnaroundTime: Yup.string().trim().max(40, 'Too long'),
});

const categoryOptions = CATEGORIES.map((c) => ({ value: c, label: c }));
const sampleOptions = SAMPLE_TYPES.map((s) => ({ value: s, label: s }));

export default function AdminTestsPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [tests, setTests] = useState<LabTest[]>([]);

  const [editing, setEditing] = useState<LabTest | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<LabTest | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const refresh = () => setTests([...dbOperations.getAllLabTests()]);

  const filtered = tests
    .filter((t) => categoryFilter === 'all' || t.category === categoryFilter)
    .filter((t) => {
      const q = query.trim().toLowerCase();
      return !q || t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
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
  const openEdit = (t: LabTest) => {
    setEditing(t);
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };
  const confirmDelete = () => {
    if (!deleting) return;
    dbOperations.deleteLabTest(deleting.id);
    refresh();
    setDeleting(null);
  };

  if (!session) {
    return null;
  }

  return (
    <DashboardShell role="admin" userName={session.user.name} title="Tests" subtitle="Diagnostic tests available">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search test…"
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
          filename="lab-tests"
          headers={['Name', 'Category', 'Sample', 'Price', 'Turnaround']}
          rows={filtered.map((t) => [t.name, t.category, t.sampleType, t.price, t.turnaroundTime])}
        />
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-slate-900">Tests ({filtered.length})</h3>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg hover:shadow-lg transition"
          >
            <Plus className="w-4 h-4" />
            Add Test
          </button>
        </div>

        {tests.length === 0 ? (
          <div className="text-center py-16">
            <FlaskConical className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-6">No tests yet</p>
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg hover:shadow-lg transition"
            >
              <Plus className="w-4 h-4" />
              Add Test
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Name</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Category</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Sample</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Price</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Turnaround</th>
                  <th className="text-right py-3 px-6 font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b hover:bg-slate-50">
                    <td className="py-3 px-6 font-medium">{t.name}</td>
                    <td className="py-3 px-6 text-slate-600">{t.category}</td>
                    <td className="py-3 px-6 text-slate-600">{t.sampleType}</td>
                    <td className="py-3 px-6 text-slate-600">₹{t.price}</td>
                    <td className="py-3 px-6 text-slate-600">{t.turnaroundTime || '—'}</td>
                    <td className="py-3 px-6 text-right">
                      <button onClick={() => openEdit(t)} className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm mr-4">
                        Edit
                      </button>
                      <button onClick={() => setDeleting(t)} className="text-red-600 hover:text-red-700 font-semibold text-sm">
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
              <h3 className="text-lg font-bold text-slate-900">{editing ? 'Edit Test' : 'Add Test'}</h3>
              <button onClick={closeModal} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Formik
              initialValues={{
                name: editing?.name ?? '',
                category: editing?.category ?? '',
                sampleType: editing?.sampleType ?? '',
                price: editing ? String(editing.price) : '',
                turnaroundTime: editing?.turnaroundTime ?? '',
              }}
              validationSchema={testSchema}
              onSubmit={(values) => {
                const payload = {
                  name: values.name.trim(),
                  category: values.category,
                  sampleType: values.sampleType,
                  price: Number(values.price),
                  turnaroundTime: values.turnaroundTime.trim(),
                };
                if (editing) {
                  dbOperations.updateLabTest(editing.id, payload);
                } else {
                  dbOperations.createLabTest({ id: generateId(), ...payload });
                }
                refresh();
                closeModal();
              }}
            >
              <Form className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <FormField name="name" label="Test Name" placeholder="e.g. Complete Blood Count (CBC)" autoFocus required />
                </div>
                <FormField name="category" label="Category" as="select" placeholder="Select category" options={categoryOptions} required />
                <FormField name="sampleType" label="Sample Type" as="select" placeholder="Select sample" options={sampleOptions} required />
                <FormField name="price" label="Price (₹)" type="number" min="0" placeholder="0" required />
                <FormField name="turnaroundTime" label="Turnaround Time" placeholder="e.g. Same day" />
                <div className="sm:col-span-2 flex gap-3 pt-2">
                  <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded hover:shadow-lg font-semibold transition">
                    {editing ? 'Save Changes' : 'Add Test'}
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
                <h3 className="text-lg font-bold text-slate-900">Delete Test</h3>
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

'use client';

import { useMemo, useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { toast } from 'sonner';
import {
  Syringe, Plus, X, Search, Pencil, Trash2, Eye,
  AlertTriangle, TrendingUp, TrendingDown,
} from 'lucide-react';
import type { Injectable, InjectionMovementType } from '@/lib/types';
import { INJECTION_ROUTES } from '@/lib/types';
import { ActionIcon } from '@/components/ActionIcon';
import { RecordDialog } from '@/components/RecordDialog';
import { FormField } from '@/components/form/FormField';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { RoleViewProps } from '@/components/RoleView';
import { hasPermission } from '@/lib/auth';
import { apiError } from '@/lib/apiError';
import { fmtDate } from '@/lib/date';
import {
  useListInjectablesQuery,
  useCreateInjectableMutation,
  useUpdateInjectableMutation,
  useDeleteInjectableMutation,
  useListInjectableLowStockQuery,
  useListInjectableMovementsQuery,
  useRestockInjectableMutation,
  useAdjustInjectableStockMutation,
} from '@/store/api';

type Tab = 'catalogue' | 'stock';

const CATEGORIES = ['Vaccine', 'Antibiotic', 'Analgesic', 'Anaesthetic', 'Steroid', 'Anticoagulant', 'Hormone', 'Other'];
const FORMS = ['Vial', 'Ampoule', 'Prefilled syringe', 'Cartridge'];

const ADJUST_TYPES: InjectionMovementType[] = ['adjustment', 'expired'];

const MOVEMENT_BADGE: Record<InjectionMovementType, string> = {
  restock: 'bg-green-100 text-green-700',
  administer: 'bg-blue-100 text-blue-700',
  adjustment: 'bg-slate-100 text-slate-600',
  expired: 'bg-red-100 text-red-700',
};

const categoryOptions = CATEGORIES.map((c) => ({ value: c, label: c }));
const formOptions = FORMS.map((f) => ({ value: f, label: f }));
const routeOptions = INJECTION_ROUTES.map((r) => ({ value: r, label: r }));

const schema = Yup.object({
  name: Yup.string().trim().required('Name is required').max(120, 'Too long'),
  category: Yup.string().trim(),
  form: Yup.string().trim(),
  strength: Yup.string().trim().max(40, 'Too long'),
  route: Yup.string().trim(),
  price: Yup.number().transform((v, o) => (o === '' ? undefined : v)).typeError('Must be a number').min(0, 'Cannot be negative').required('Price is required'),
  stock: Yup.number().transform((v, o) => (o === '' ? undefined : v)).typeError('Must be a number').integer('Whole number').min(0, 'Cannot be negative').required('Stock is required'),
  reorderLevel: Yup.number().transform((v, o) => (o === '' ? undefined : v)).typeError('Must be a number').integer('Whole number').min(0, 'Cannot be negative'),
  lotNumber: Yup.string().trim().max(60, 'Too long'),
  expiryDate: Yup.string().trim(),
  location: Yup.string().trim().max(60, 'Too long'),
  unit: Yup.string().trim().max(20, 'Too long'),
});

function stockBadge(item: Injectable): string {
  const reorder = item.reorderLevel ?? 10;
  if (item.stock <= reorder) return 'bg-red-100 text-red-700';
  if (item.stock <= reorder * 2) return 'bg-amber-100 text-amber-700';
  return 'bg-green-100 text-green-700';
}

/**
 * Injectable catalogue plus stock & movements. Rendered as the "Injectables"
 * tab of the combined Inventory page (see InventoryHub); it no longer owns a
 * route or a DashboardShell of its own.
 */
export function InjectableCatalogPanel({ session }: RoleViewProps) {
  const canManage = hasPermission(session, 'injectables.manage');
  // Deletion is a platform capability — hospital staff create and edit only.
  const canDelete = hasPermission(session, 'injectables.delete');

  const [tab, setTab] = useState<Tab>('catalogue');
  const [stockView, setStockView] = useState<'levels' | 'movements'>('levels');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Injectable | null>(null);
  const [viewing, setViewing] = useState<Injectable | null>(null);
  const [deleting, setDeleting] = useState<Injectable | null>(null);
  const [restockItem, setRestockItem] = useState<Injectable | null>(null);
  const [adjustItem, setAdjustItem] = useState<Injectable | null>(null);
  const [restockForm, setRestockForm] = useState({ quantity: '', lotNumber: '', expiryDate: '', notes: '' });
  const [adjustForm, setAdjustForm] = useState<{ quantity: string; movementType: InjectionMovementType; notes: string }>({
    quantity: '', movementType: 'adjustment', notes: '',
  });
  const [stockError, setStockError] = useState('');

  const { data: injectables = [], isLoading } = useListInjectablesQuery();
  const { data: lowStock = [] } = useListInjectableLowStockQuery();
  const { data: movements = [], isLoading: loadingMovements } = useListInjectableMovementsQuery(undefined, {
    skip: tab !== 'stock',
  });

  const [createInjectable] = useCreateInjectableMutation();
  const [updateInjectable] = useUpdateInjectableMutation();
  const [deleteInjectable, { isLoading: isDeleting }] = useDeleteInjectableMutation();
  const [restock, { isLoading: isRestocking }] = useRestockInjectableMutation();
  const [adjustStock, { isLoading: isAdjusting }] = useAdjustInjectableStockMutation();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return injectables;
    return injectables.filter((i) =>
      [i.name, i.category, i.form, i.strength].some((f) => f?.toLowerCase().includes(q)),
    );
  }, [injectables, search]);

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (i: Injectable) => { setEditing(i); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteInjectable(deleting.id).unwrap();
      toast.success('Injectable deleted');
    } catch (err) {
      toast.error(apiError(err, 'Failed to delete injectable'));
    } finally {
      setDeleting(null);
    }
  };

  const openRestock = (i: Injectable) => {
    setRestockItem(i);
    setRestockForm({ quantity: '', lotNumber: '', expiryDate: '', notes: '' });
    setStockError('');
  };
  const openAdjust = (i: Injectable) => {
    setAdjustItem(i);
    setAdjustForm({ quantity: '', movementType: 'adjustment', notes: '' });
    setStockError('');
  };

  const handleRestock = async () => {
    if (!restockItem) return;
    const qty = Number(restockForm.quantity);
    if (!Number.isInteger(qty) || qty < 1) { setStockError('Enter a whole quantity of at least 1'); return; }
    try {
      await restock({
        injectableId: restockItem.id,
        quantity: qty,
        lotNumber: restockForm.lotNumber || undefined,
        expiryDate: restockForm.expiryDate || undefined,
        notes: restockForm.notes || undefined,
      }).unwrap();
      toast.success('Stock added');
      setRestockItem(null);
    } catch (err) {
      setStockError(apiError(err, 'Failed to restock'));
    }
  };

  const handleAdjust = async () => {
    if (!adjustItem) return;
    const qty = Number(adjustForm.quantity);
    if (!Number.isInteger(qty) || qty === 0) { setStockError('Enter a non-zero whole number'); return; }
    try {
      await adjustStock({
        injectableId: adjustItem.id,
        quantity: qty,
        movementType: adjustForm.movementType,
        notes: adjustForm.notes || undefined,
      }).unwrap();
      toast.success('Stock adjusted');
      setAdjustItem(null);
    } catch (err) {
      setStockError(apiError(err, 'Failed to adjust'));
    }
  };

  return (
    <>
      <div className="space-y-6">
        {lowStock.length > 0 && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">
                {lowStock.length} injectable{lowStock.length > 1 ? 's' : ''} at or below reorder level
              </p>
              <p className="text-xs text-red-600 mt-0.5">{lowStock.map((i) => i.name).join(', ')}</p>
            </div>
          </div>
        )}

        <div className="border-b border-slate-200">
          <nav className="flex gap-1" aria-label="Injectables sections">
            {(['catalogue', 'stock'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-current={tab === t ? 'page' : undefined}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                  tab === t
                    ? 'border-cyan-600 text-cyan-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {t === 'stock' ? 'Stock & Movements' : 'Catalogue'}
              </button>
            ))}
          </nav>
        </div>

        {tab === 'catalogue' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search injectable…"
                className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            {canManage && (
              <Button
                onClick={openAdd}
                variant="brand"
                size="sm"
                className="ml-auto"
              >
                <Plus className="w-4 h-4" /> Add Injectable
              </Button>
            )}
          </div>
        )}

        {/* Catalogue tab */}
        {tab === 'catalogue' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold text-slate-900">Catalogue ({filtered.length})</h3>
            </div>
            {isLoading ? (
              <Spinner variant="block" />
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <Syringe className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">No injectables in the catalogue yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b bg-slate-50">
                      <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Name</TableHead>
                      <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Category</TableHead>
                      <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Form</TableHead>
                      <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Strength</TableHead>
                      <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Route</TableHead>
                      <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Price</TableHead>
                      <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Stock</TableHead>
                      <TableHead className="text-right py-3 px-6 font-semibold text-slate-900">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((i) => (
                      <TableRow key={i.id} className="border-b hover:bg-slate-50">
                        <TableCell className="py-3 px-6 font-medium whitespace-normal">{i.name}</TableCell>
                        <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{i.category || '—'}</TableCell>
                        <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{i.form || '—'}</TableCell>
                        <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{i.strength || '—'}</TableCell>
                        <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{i.route || '—'}</TableCell>
                        <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">₹{i.price}</TableCell>
                        <TableCell className="py-3 px-6 whitespace-normal">
                          <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${stockBadge(i)}`}>
                            {i.stock}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 px-6 text-right whitespace-normal">
                          <div className="flex items-center justify-end gap-1">
                            <ActionIcon icon={Eye} label="View" onClick={() => setViewing(i)} />
                            {canManage && <ActionIcon icon={Pencil} label="Edit" onClick={() => openEdit(i)} />}
                            {canDelete && <ActionIcon icon={Trash2} label="Delete" tone="danger" onClick={() => setDeleting(i)} />}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* Stock tab */}
        {tab === 'stock' && (
          <>
            <div className="border-b border-slate-200">
              <nav className="flex gap-1" aria-label="Injectable stock views">
                <button
                  onClick={() => setStockView('levels')}
                  aria-current={stockView === 'levels' ? 'page' : undefined}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                    stockView === 'levels'
                      ? 'border-cyan-600 text-cyan-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  Stock Levels
                </button>
                <button
                  onClick={() => setStockView('movements')}
                  aria-current={stockView === 'movements' ? 'page' : undefined}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                    stockView === 'movements'
                      ? 'border-cyan-600 text-cyan-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  Movement History
                </button>
              </nav>
            </div>

            {stockView === 'levels' && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h3 className="font-semibold text-slate-900">Stock Levels ({injectables.length})</h3>
              </div>
              {isLoading ? (
                <Spinner variant="block" />
              ) : injectables.length === 0 ? (
                <div className="text-center py-16">
                  <Syringe className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600">No injectables in the catalogue yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b bg-slate-50">
                        <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Name</TableHead>
                        <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Strength</TableHead>
                        <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Stock</TableHead>
                        <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Reorder</TableHead>
                        <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Lot</TableHead>
                        <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Expiry</TableHead>
                        {canManage && <TableHead className="text-right py-3 px-6 font-semibold text-slate-900">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {injectables.map((i) => (
                        <TableRow key={i.id} className="border-b hover:bg-slate-50">
                          <TableCell className="py-3 px-6 font-medium whitespace-normal">{i.name}</TableCell>
                          <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{i.strength || '—'}</TableCell>
                          <TableCell className="py-3 px-6 whitespace-normal">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${stockBadge(i)}`}>
                              {i.stock}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{i.reorderLevel ?? 10}</TableCell>
                          <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{i.lotNumber || '—'}</TableCell>
                          <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{i.expiryDate ? fmtDate(i.expiryDate) : '—'}</TableCell>
                          {canManage && (
                            <TableCell className="py-3 px-6 text-right whitespace-normal">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openRestock(i)}
                                  className="px-2 py-1 text-xs font-medium bg-green-50 text-green-700 rounded hover:bg-green-100 transition flex items-center gap-1"
                                >
                                  <TrendingUp className="w-3 h-3" /> Restock
                                </button>
                                <button
                                  onClick={() => openAdjust(i)}
                                  className="px-2 py-1 text-xs font-medium bg-slate-50 text-slate-700 rounded hover:bg-slate-100 transition flex items-center gap-1"
                                >
                                  <TrendingDown className="w-3 h-3" /> Adjust
                                </button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
            )}

            {stockView === 'movements' && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h3 className="font-semibold text-slate-900">Movement History ({movements.length})</h3>
              </div>
              {loadingMovements ? (
                <Spinner variant="block" />
              ) : movements.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 text-sm">No stock movements recorded yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b bg-slate-50">
                        <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Injectable</TableHead>
                        <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Type</TableHead>
                        <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Qty</TableHead>
                        <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">By</TableHead>
                        <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Date</TableHead>
                        <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((m) => (
                        <TableRow key={m.id} className="border-b hover:bg-slate-50">
                          <TableCell className="py-3 px-6 font-medium text-slate-900 whitespace-normal">{m.injectableName ?? m.injectableId}</TableCell>
                          <TableCell className="py-3 px-6 whitespace-normal">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${MOVEMENT_BADGE[m.movementType]}`}>
                              {m.movementType}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 px-6 whitespace-normal">
                            <span className={m.quantity >= 0 ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>
                              {m.quantity >= 0 ? '+' : ''}{m.quantity}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{m.performedByName ?? m.performedBy}</TableCell>
                          <TableCell className="py-3 px-6 text-slate-500">{fmtDate(m.createdAt)}</TableCell>
                          <TableCell className="py-3 px-6 text-slate-600 max-w-xs truncate">{m.notes || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
            )}
          </>
        )}
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">{editing ? 'Edit Injectable' : 'Add Injectable'}</h3>
              <button onClick={closeModal} className="text-slate-500 hover:text-slate-900"><X className="w-5 h-5" /></button>
            </div>
            <Formik
              initialValues={{
                name: editing?.name ?? '',
                category: editing?.category ?? '',
                form: editing?.form ?? '',
                strength: editing?.strength ?? '',
                route: editing?.route ?? 'IM',
                price: editing ? String(editing.price) : '',
                stock: editing ? String(editing.stock) : '',
                reorderLevel: editing ? String(editing.reorderLevel ?? 10) : '10',
                lotNumber: editing?.lotNumber ?? '',
                expiryDate: editing?.expiryDate ?? '',
                location: editing?.location ?? '',
                unit: editing?.unit ?? '',
              }}
              validationSchema={schema}
              onSubmit={async (values, { setSubmitting, setStatus }) => {
                const payload = {
                  name: values.name.trim(),
                  category: values.category,
                  form: values.form,
                  strength: values.strength.trim(),
                  route: values.route,
                  price: Number(values.price),
                  stock: Number(values.stock),
                  reorderLevel: Number(values.reorderLevel || 10),
                  lotNumber: values.lotNumber.trim(),
                  expiryDate: values.expiryDate,
                  location: values.location.trim(),
                  unit: values.unit.trim(),
                };
                setStatus('');
                try {
                  if (editing) {
                    await updateInjectable({ id: editing.id, body: payload }).unwrap();
                    toast.success('Injectable updated');
                  } else {
                    await createInjectable(payload).unwrap();
                    toast.success('Injectable added');
                  }
                  closeModal();
                } catch (err) {
                  setStatus(apiError(err, 'Failed to save injectable'));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {({ isSubmitting, status, dirty }) => (
                <Form className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <FormField name="name" label="Name" placeholder="e.g. Ceftriaxone 1 g" autoFocus required />
                  </div>
                  <FormField name="category" label="Category" as="select" placeholder="Select category" options={categoryOptions} />
                  <FormField name="form" label="Form" as="select" placeholder="Select form" options={formOptions} />
                  <FormField name="strength" label="Strength" placeholder="e.g. 1 g, 0.5 mL" />
                  <FormField name="route" label="Default route" as="select" placeholder="Select route" options={routeOptions} />
                  <FormField name="price" label="Price (₹)" type="number" min="0" placeholder="0" required />
                  <FormField name="stock" label="Stock (units)" type="number" min="0" placeholder="0" required />
                  <FormField name="reorderLevel" label="Reorder level" type="number" min="0" placeholder="10" />
                  <FormField name="unit" label="Unit" placeholder="e.g. vial" />
                  <FormField name="lotNumber" label="Lot number" placeholder="e.g. LOT-2026-014" />
                  <FormField name="expiryDate" label="Expiry date" type="date" />
                  <div className="sm:col-span-2">
                    <FormField name="location" label="Storage location" placeholder="e.g. Fridge 2, shelf B" />
                  </div>
                  {status && (
                    <p className="sm:col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{status}</p>
                  )}
                  <div className="sm:col-span-2 flex gap-3 pt-2">
                    <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                      Cancel
                    </button>
                    <Button
                      type="submit"
                      disabled={isSubmitting || !dirty}
                      variant="brand"
                      className="flex-1"
                    >
                      {isSubmitting ? <Spinner size="sm" label="Saving…" /> : editing ? 'Save Changes' : 'Add Injectable'}
                    </Button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">Delete Injectable</h3>
                <p className="text-slate-600 mt-1 text-sm">
                  Delete <span className="font-semibold text-slate-900">{deleting.name}</span>? This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDeleting(null)} disabled={isDeleting} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition disabled:opacity-50">
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

      {/* Restock modal */}
      {restockItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Restock — {restockItem.name}</h3>
              <button onClick={() => setRestockItem(null)} className="text-slate-500 hover:text-slate-900"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Current stock: <span className="font-semibold text-slate-900">{restockItem.stock}</span></p>
            <div className="grid gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity *</label>
                <input type="number" min="1" value={restockForm.quantity} onChange={(e) => setRestockForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="Units to add" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Lot number</label>
                <input value={restockForm.lotNumber} onChange={(e) => setRestockForm((f) => ({ ...f, lotNumber: e.target.value }))} placeholder="e.g. LOT-2026-014" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Expiry date</label>
                <input type="date" value={restockForm.expiryDate} onChange={(e) => setRestockForm((f) => ({ ...f, expiryDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea value={restockForm.notes} onChange={(e) => setRestockForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional…" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
              </div>
              {stockError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{stockError}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setRestockItem(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">Cancel</button>
                <Button
                  onClick={handleRestock}
                  disabled={isRestocking}
                  variant="brand"
                  className="flex-1"
                >
                  {isRestocking ? <Spinner size="sm" label="Saving…" /> : 'Restock'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adjust modal */}
      {adjustItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Adjust — {adjustItem.name}</h3>
              <button onClick={() => setAdjustItem(null)} className="text-slate-500 hover:text-slate-900"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Current stock: <span className="font-semibold text-slate-900">{adjustItem.stock}</span></p>
            <div className="grid gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select value={adjustForm.movementType} onChange={(e) => setAdjustForm((f) => ({ ...f, movementType: e.target.value as InjectionMovementType }))} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  {ADJUST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity (negative to remove) *</label>
                <input type="number" value={adjustForm.quantity} onChange={(e) => setAdjustForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="e.g. -5 or +10" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea value={adjustForm.notes} onChange={(e) => setAdjustForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Reason for adjustment…" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
              </div>
              {stockError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{stockError}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setAdjustItem(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">Cancel</button>
                <Button
                  onClick={handleAdjust}
                  disabled={isAdjusting}
                  variant="brand"
                  className="flex-1"
                >
                  {isAdjusting ? <Spinner size="sm" label="Saving…" /> : 'Apply Adjustment'}
                </Button>
              </div>
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
          { label: 'Default route', value: viewing?.route },
          { label: 'Unit', value: viewing?.unit },
          { label: 'Price', value: viewing ? `₹${viewing.price}` : '' },
          { label: 'Stock', value: viewing ? String(viewing.stock) : '' },
          { label: 'Reorder level', value: viewing?.reorderLevel?.toString() },
          { label: 'Lot number', value: viewing?.lotNumber },
          { label: 'Expiry', value: viewing?.expiryDate ? fmtDate(viewing.expiryDate) : '' },
          { label: 'Storage location', value: viewing?.location },
        ]}
      />
    </>
  );
}

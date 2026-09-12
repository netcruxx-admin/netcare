'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Package, X, AlertTriangle, TrendingUp, TrendingDown, Eye } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import type { InventoryMovementType, Medicine } from '@/lib/types';
import { ActionIcon } from '@/components/ActionIcon';
import { RecordDialog } from '@/components/RecordDialog';
import { FormField } from '@/components/form/FormField';
import type { RoleViewProps } from '@/components/RoleView';
import { hasPermission } from '@/lib/auth';
import {
  useListMedicinesPagedQuery,
  useListInventoryMovementsQuery,
  useListLowStockQuery,
  useRestockMedicineMutation,
  useAdjustInventoryMutation,
} from '@/store/api';
import { fmtDate } from '@/lib/date';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

const MOVEMENT_BADGE: Record<InventoryMovementType, string> = {
  restock: 'bg-green-100 text-green-700',
  dispense: 'bg-blue-100 text-blue-700',
  expired: 'bg-red-100 text-red-700',
  returned: 'bg-amber-100 text-amber-700',
  adjustment: 'bg-slate-100 text-slate-600',
};

const MOVEMENT_TYPES: InventoryMovementType[] = ['restock', 'dispense', 'expired', 'returned', 'adjustment'];

interface RestockValues {
  quantity: string;
  lotNumber: string;
  expiryDate: string;
  notes: string;
}

interface AdjustValues {
  quantity: string;
  movementType: InventoryMovementType;
  notes: string;
}

const restockSchema = Yup.object({
  quantity: Yup.string().test('qty', 'Enter a valid quantity', (v) => {
    const n = Number(v);
    return !!n && n > 0;
  }),
});

const adjustSchema = Yup.object({
  quantity: Yup.string().test('qty', 'Enter a non-zero quantity', (v) => {
    const n = Number(v);
    return !Number.isNaN(n) && n !== 0;
  }),
});

/**
 * Medicine stock levels and movement history. Rendered as the "Stock &
 * Movements" sub-tab of the Medicines section on the combined Inventory page
 * (see InventoryHub); it no longer owns a route or a DashboardShell of its own.
 */
export function InventoryStockPanel({ session }: RoleViewProps) {
  // A hospital admin holds inventory.read so they can see what is on the
  // shelf; restocking and write-offs stay with the pharmacist.
  const canManage = hasPermission(session, 'inventory.manage');
  const [view, setView] = useState<'levels' | 'movements'>('levels');
  const [viewing, setViewing] = useState<Medicine | null>(null);
  const [restockMed, setRestockMed] = useState<Medicine | null>(null);
  const [adjustMed, setAdjustMed] = useState<Medicine | null>(null);
  const [formError, setFormError] = useState('');

  const { data: medicinePage, isLoading: loadingMedicines } = useListMedicinesPagedQuery({ limit: 200, offset: 0 });
  const medicines = medicinePage?.items ?? [];
  const { data: movements = [], isLoading: loadingMovements } = useListInventoryMovementsQuery();
  const { data: lowStock = [] } = useListLowStockQuery();

  const [restockMedicine, { isLoading: isRestocking }] = useRestockMedicineMutation();
  const [adjustInventory, { isLoading: isAdjusting }] = useAdjustInventoryMutation();

  const openRestock = (med: Medicine) => {
    setRestockMed(med);
    setFormError('');
  };

  const openAdjust = (med: Medicine) => {
    setAdjustMed(med);
    setFormError('');
  };

  const stockBadgeClass = (med: Medicine) => {
    const reorder = med.reorderLevel ?? 10;
    if (med.stock <= reorder) return 'bg-red-100 text-red-700';
    if (med.stock <= reorder * 2) return 'bg-amber-100 text-amber-700';
    return 'bg-green-100 text-green-700';
  };

  return (
    <>
      <div className="space-y-6">
        {/* Low stock alert */}
        {lowStock.length > 0 && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">
                {lowStock.length} medicine{lowStock.length > 1 ? 's' : ''} at or below reorder level
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                {lowStock.map((m) => m.name).join(', ')}
              </p>
            </div>
          </div>
        )}

        <div className="border-b border-slate-200">
          <nav className="flex gap-1" aria-label="Medicine stock views">
            <button
              onClick={() => setView('levels')}
              aria-current={view === 'levels' ? 'page' : undefined}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                view === 'levels'
                  ? 'border-cyan-600 text-cyan-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Stock Levels
            </button>
            <button
              onClick={() => setView('movements')}
              aria-current={view === 'movements' ? 'page' : undefined}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                view === 'movements'
                  ? 'border-cyan-600 text-cyan-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Movement History
            </button>
          </nav>
        </div>

        {/* Stock Levels */}
        {view === 'levels' && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Stock Levels ({medicines.length})</h3>
          </div>
          {loadingMedicines ? (
            <Spinner variant="block" />
          ) : medicines.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No medicines in catalog yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-slate-50">
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Name</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Form</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Strength</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Category</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Stock</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Reorder</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Location</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Unit</TableHead>
                    <TableHead className="text-right py-3 px-4 font-semibold text-slate-900">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {medicines.map((med) => (
                    <TableRow key={med.id} className="border-b hover:bg-slate-50">
                      <TableCell className="py-3 px-4 font-medium text-slate-900 whitespace-normal">{med.name}</TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{med.form || '—'}</TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{med.strength || '—'}</TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{med.category || '—'}</TableCell>
                      <TableCell className="py-3 px-4 whitespace-normal">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${stockBadgeClass(med)}`}>
                          {med.stock}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{med.reorderLevel ?? 10}</TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{med.location || '—'}</TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{med.unit || '—'}</TableCell>
                      <TableCell className="py-3 px-4 text-right whitespace-normal">
                        <div className="flex items-center justify-end gap-2">
                          <ActionIcon icon={Eye} label="View" onClick={() => setViewing(med)} />
                          {canManage && (
                            <>
                              <button
                                onClick={() => openRestock(med)}
                                className="px-2 py-1 text-xs font-medium bg-green-50 text-green-700 rounded hover:bg-green-100 transition flex items-center gap-1"
                              >
                                <TrendingUp className="w-3 h-3" /> Restock
                              </button>
                              <button
                                onClick={() => openAdjust(med)}
                                className="px-2 py-1 text-xs font-medium bg-slate-50 text-slate-700 rounded hover:bg-slate-100 transition flex items-center gap-1"
                              >
                                <TrendingDown className="w-3 h-3" /> Adjust
                              </button>
                            </>
                          )}
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

        {/* Movement History */}
        {view === 'movements' && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Movement History ({movements.length})</h3>
          </div>
          {loadingMovements ? (
            <Spinner variant="block" />
          ) : movements.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No movements recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-slate-50">
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Medicine</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Type</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Qty</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Lot No.</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Performed By</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Date</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id} className="border-b hover:bg-slate-50">
                      <TableCell className="py-3 px-4 font-medium text-slate-900 whitespace-normal">
                        {m.medicineName ?? m.medicineId}
                      </TableCell>
                      <TableCell className="py-3 px-4 whitespace-normal">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${MOVEMENT_BADGE[m.movementType]}`}>
                          {m.movementType}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-4 whitespace-normal">
                        <span className={m.quantity >= 0 ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>
                          {m.quantity >= 0 ? '+' : ''}{m.quantity}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{m.lotNumber || '—'}</TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">
                        {m.performedByName ?? m.performedBy}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-slate-500">
                        {fmtDate(m.createdAt)}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 max-w-xs truncate">{m.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Restock Modal */}
      {restockMed && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Restock — {restockMed.name}</h3>
              <button onClick={() => setRestockMed(null)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Current stock: <span className="font-semibold text-slate-900">{restockMed.stock}</span></p>
            <Formik<RestockValues>
              initialValues={{ quantity: '', lotNumber: '', expiryDate: '', notes: '' }}
              validationSchema={restockSchema}
              onSubmit={async (values, { setSubmitting }) => {
                setFormError('');
                try {
                  await restockMedicine({
                    medicineId: restockMed.id,
                    quantity: Number(values.quantity),
                    lotNumber: values.lotNumber,
                    expiryDate: values.expiryDate,
                    notes: values.notes,
                  }).unwrap();
                  toast.success('Stock updated');
                  setRestockMed(null);
                } catch (err) {
                  setFormError(apiError(err, 'Failed to restock'));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {({ isSubmitting, dirty }) => (
                <Form className="grid gap-3">
                  <FormField name="quantity" label="Quantity" type="number" min="1" placeholder="Units to add" required />
                  <FormField name="lotNumber" label="Lot Number" placeholder="e.g. LOT-2024-001" />
                  <FormField name="expiryDate" label="Expiry Date" type="date" />
                  <FormField name="notes" label="Notes" as="textarea" rows={2} placeholder="Optional notes…" />
                  {formError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {formError}
                    </p>
                  )}
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setRestockMed(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                      Cancel
                    </button>
                    <Button
                      type="submit"
                      disabled={isSubmitting || !dirty || isRestocking}
                      variant="brand"
                      className="flex-1"
                    >
                      {isSubmitting || isRestocking ? <Spinner size="sm" label="Saving…" /> : 'Restock'}
                    </Button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* Adjust Modal */}
      {adjustMed && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Adjust — {adjustMed.name}</h3>
              <button onClick={() => setAdjustMed(null)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Current stock: <span className="font-semibold text-slate-900">{adjustMed.stock}</span></p>
            <Formik<AdjustValues>
              initialValues={{ quantity: '', movementType: 'adjustment', notes: '' }}
              validationSchema={adjustSchema}
              onSubmit={async (values, { setSubmitting }) => {
                setFormError('');
                try {
                  await adjustInventory({
                    medicineId: adjustMed.id,
                    quantity: Number(values.quantity),
                    movementType: values.movementType,
                    notes: values.notes,
                  }).unwrap();
                  toast.success('Inventory adjusted');
                  setAdjustMed(null);
                } catch (err) {
                  setFormError(apiError(err, 'Failed to adjust'));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {({ isSubmitting, dirty }) => (
                <Form className="grid gap-3">
                  <FormField
                    name="movementType"
                    label="Type"
                    as="select"
                    options={MOVEMENT_TYPES.map((t) => ({ value: t, label: t }))}
                  />
                  <FormField name="quantity" label="Quantity (negative to remove)" type="number" placeholder="e.g. -5 or +10" required />
                  <FormField name="notes" label="Notes" as="textarea" rows={2} placeholder="Reason for adjustment…" />
                  {formError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {formError}
                    </p>
                  )}
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setAdjustMed(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                      Cancel
                    </button>
                    <Button
                      type="submit"
                      disabled={isSubmitting || !dirty || isAdjusting}
                      variant="brand"
                      className="flex-1"
                    >
                      {isSubmitting || isAdjusting ? <Spinner size="sm" label="Saving…" /> : 'Apply Adjustment'}
                    </Button>
                  </div>
                </Form>
              )}
            </Formik>
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
          { label: 'Expiry', value: viewing?.expiryDate ? fmtDate(viewing.expiryDate) : '' },
          { label: 'Storage location', value: viewing?.location },
        ]}
      />
    </>
  );
}

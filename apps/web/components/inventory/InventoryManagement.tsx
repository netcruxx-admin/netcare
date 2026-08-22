'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Package, X, AlertTriangle, TrendingUp, TrendingDown, Eye } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import type { InventoryMovementType, Medicine } from '@/lib/types';
import { DashboardShell } from '@/components/DashboardShell';
import { ActionIcon } from '@/components/ActionIcon';
import { RecordDialog } from '@/components/RecordDialog';
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

type ActiveTab = 'stock' | 'movements';

const MOVEMENT_BADGE: Record<InventoryMovementType, string> = {
  restock: 'bg-green-100 text-green-700',
  dispense: 'bg-blue-100 text-blue-700',
  expired: 'bg-red-100 text-red-700',
  returned: 'bg-amber-100 text-amber-700',
  adjustment: 'bg-slate-100 text-slate-600',
};

const MOVEMENT_TYPES: InventoryMovementType[] = ['restock', 'dispense', 'expired', 'returned', 'adjustment'];

interface RestockForm {
  medicineId: string;
  quantity: string;
  lotNumber: string;
  expiryDate: string;
  notes: string;
}

interface AdjustForm {
  medicineId: string;
  quantity: string;
  movementType: InventoryMovementType;
  notes: string;
}

export function InventoryManagement({ session }: RoleViewProps) {
  // A hospital admin holds inventory.read so they can see what is on the
  // shelf; restocking and write-offs stay with the pharmacist.
  const canManage = hasPermission(session, 'inventory.manage');
  const [activeTab, setActiveTab] = useState<ActiveTab>('stock');
  const [viewing, setViewing] = useState<Medicine | null>(null);
  const [restockMed, setRestockMed] = useState<Medicine | null>(null);
  const [adjustMed, setAdjustMed] = useState<Medicine | null>(null);
  const [restockForm, setRestockForm] = useState<RestockForm>({
    medicineId: '', quantity: '', lotNumber: '', expiryDate: '', notes: '',
  });
  const [adjustForm, setAdjustForm] = useState<AdjustForm>({
    medicineId: '', quantity: '', movementType: 'adjustment', notes: '',
  });
  const [formError, setFormError] = useState('');

  const { data: medicinePage } = useListMedicinesPagedQuery({ limit: 200, offset: 0 });
  const medicines = medicinePage?.items ?? [];
  const { data: movements = [] } = useListInventoryMovementsQuery();
  const { data: lowStock = [] } = useListLowStockQuery();

  const [restockMedicine, { isLoading: isRestocking }] = useRestockMedicineMutation();
  const [adjustInventory, { isLoading: isAdjusting }] = useAdjustInventoryMutation();

  const openRestock = (med: Medicine) => {
    setRestockMed(med);
    setRestockForm({ medicineId: med.id, quantity: '', lotNumber: '', expiryDate: '', notes: '' });
    setFormError('');
  };

  const openAdjust = (med: Medicine) => {
    setAdjustMed(med);
    setAdjustForm({ medicineId: med.id, quantity: '', movementType: 'adjustment', notes: '' });
    setFormError('');
  };

  const handleRestock = async () => {
    setFormError('');
    const qty = Number(restockForm.quantity);
    if (!qty || qty <= 0) { setFormError('Enter a valid quantity'); return; }
    try {
      await restockMedicine({
        medicineId: restockForm.medicineId,
        quantity: qty,
        lotNumber: restockForm.lotNumber,
        expiryDate: restockForm.expiryDate,
        notes: restockForm.notes,
      }).unwrap();
      toast.success('Stock updated');
      setRestockMed(null);
    } catch (err) {
      setFormError(apiError(err, 'Failed to restock'));
    }
  };

  const handleAdjust = async () => {
    setFormError('');
    const qty = Number(adjustForm.quantity);
    if (isNaN(qty) || qty === 0) { setFormError('Enter a non-zero quantity'); return; }
    try {
      await adjustInventory({
        medicineId: adjustForm.medicineId,
        quantity: qty,
        movementType: adjustForm.movementType,
        notes: adjustForm.notes,
      }).unwrap();
      toast.success('Inventory adjusted');
      setAdjustMed(null);
    } catch (err) {
      setFormError(apiError(err, 'Failed to adjust'));
    }
  };

  const stockBadgeClass = (med: Medicine) => {
    const reorder = med.reorderLevel ?? 10;
    if (med.stock <= reorder) return 'bg-red-100 text-red-700';
    if (med.stock <= reorder * 2) return 'bg-amber-100 text-amber-700';
    return 'bg-green-100 text-green-700';
  };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Inventory"
      subtitle="Medicine stock levels and movement history"
    >
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

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-lg shadow px-1 py-1 w-fit">
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              activeTab === 'stock' ? 'bg-cyan-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Stock Levels
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              activeTab === 'movements' ? 'bg-cyan-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Movement History
          </button>
        </div>

        {/* Stock Levels */}
        {activeTab === 'stock' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold text-slate-900">Stock Levels ({medicines.length})</h3>
            </div>
            {medicines.length === 0 ? (
              <div className="text-center py-16">
                <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">No medicines in catalog yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Form</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Strength</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Category</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Stock</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Reorder</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Location</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Unit</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicines.map((med) => (
                      <tr key={med.id} className="border-b hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium text-slate-900">{med.name}</td>
                        <td className="py-3 px-4 text-slate-600">{med.form || '—'}</td>
                        <td className="py-3 px-4 text-slate-600">{med.strength || '—'}</td>
                        <td className="py-3 px-4 text-slate-600">{med.category || '—'}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${stockBadgeClass(med)}`}>
                            {med.stock}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{med.reorderLevel ?? 10}</td>
                        <td className="py-3 px-4 text-slate-600">{med.location || '—'}</td>
                        <td className="py-3 px-4 text-slate-600">{med.unit || '—'}</td>
                        <td className="py-3 px-4 text-right">
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Movement History */}
        {activeTab === 'movements' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold text-slate-900">Movement History ({movements.length})</h3>
            </div>
            {movements.length === 0 ? (
              <div className="text-center py-16">
                <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">No movements recorded yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Medicine</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Type</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Qty</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Lot No.</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Performed By</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Date</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className="border-b hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {m.medicineName ?? m.medicineId}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${MOVEMENT_BADGE[m.movementType]}`}>
                            {m.movementType}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={m.quantity >= 0 ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>
                            {m.quantity >= 0 ? '+' : ''}{m.quantity}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{m.lotNumber || '—'}</td>
                        <td className="py-3 px-4 text-slate-600">
                          {m.performedByName ?? m.performedBy}
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {fmtDate(m.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{m.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
            <div className="grid gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity *</label>
                <input
                  type="number"
                  min="1"
                  value={restockForm.quantity}
                  onChange={(e) => setRestockForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="Units to add"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Lot Number</label>
                <input
                  value={restockForm.lotNumber}
                  onChange={(e) => setRestockForm((f) => ({ ...f, lotNumber: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="e.g. LOT-2024-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label>
                <input
                  type="date"
                  value={restockForm.expiryDate}
                  onChange={(e) => setRestockForm((f) => ({ ...f, expiryDate: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={restockForm.notes}
                  onChange={(e) => setRestockForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                  placeholder="Optional notes…"
                />
              </div>
              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setRestockMed(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                  Cancel
                </button>
                <button
                  onClick={handleRestock}
                  disabled={isRestocking}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded hover:shadow-lg font-semibold transition disabled:opacity-50"
                >
                  {isRestocking ? 'Saving…' : 'Restock'}
                </button>
              </div>
            </div>
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
            <div className="grid gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={adjustForm.movementType}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, movementType: e.target.value as InventoryMovementType }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {MOVEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity (negative to remove) *</label>
                <input
                  type="number"
                  value={adjustForm.quantity}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="e.g. -5 or +10"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                  placeholder="Reason for adjustment…"
                />
              </div>
              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setAdjustMed(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                  Cancel
                </button>
                <button
                  onClick={handleAdjust}
                  disabled={isAdjusting}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded hover:shadow-lg font-semibold transition disabled:opacity-50"
                >
                  {isAdjusting ? 'Saving…' : 'Apply Adjustment'}
                </button>
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
          { label: 'Unit', value: viewing?.unit },
          { label: 'Price', value: viewing ? `₹${viewing.price}` : '' },
          { label: 'Stock', value: viewing ? String(viewing.stock) : '' },
          { label: 'Reorder level', value: viewing?.reorderLevel?.toString() },
          { label: 'Lot number', value: viewing?.lotNumber },
          { label: 'Expiry', value: viewing?.expiryDate ? fmtDate(viewing.expiryDate) : '' },
          { label: 'Storage location', value: viewing?.location },
        ]}
      />
    </DashboardShell>
  );
}

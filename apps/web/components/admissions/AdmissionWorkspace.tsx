'use client';

/**
 * The per-stay IPD workspace — reached from the Admissions list, not itself
 * in the route table (see lib/roles.ts's note on alwaysAllowedPathPrefixes).
 * Access is judged against the record itself: GET /admissions/{id} 404s a
 * caller who isn't a party to this admission, so reaching this page with
 * data back is itself the access check, the same pattern /dashboard/consult
 * already uses for an appointment.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowLeft,
  BedDouble,
  FileText,
  LogOut,
  Plus,
  Receipt,
  Stethoscope,
} from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { Spinner } from '@/components/ui/spinner';
import { apiError } from '@/lib/apiError';
import { fmtDateTime } from '@/lib/date';
import { doctorRole, hasPermission, permissionScope } from '@/lib/roles';
import type { AuthSession, DischargeType } from '@/lib/types';
import {
  useCreateAdmissionChargeItemMutation,
  useCreateDischargeSummaryMutation,
  useCreateProgressNoteMutation,
  useGetAdmissionBillQuery,
  useGetAdmissionQuery,
  useGetDoctorByUserQuery,
  useListBedsPagedQuery,
  useListDischargeSummariesPagedQuery,
  useListProgressNotesPagedQuery,
  useTransferAdmissionBedMutation,
} from '@/store/api';

const STATUS_STYLES: Record<string, string> = {
  admitted: 'bg-green-100 text-green-700',
  discharged: 'bg-slate-100 text-slate-600',
  dama: 'bg-amber-100 text-amber-700',
  transferred_out: 'bg-blue-100 text-blue-700',
  deceased: 'bg-slate-200 text-slate-700',
};

function fmtMoney(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function TransferBedControl({ admissionId, currentBedId }: { admissionId: string; currentBedId: string }) {
  const [open, setOpen] = useState(false);
  const [bedId, setBedId] = useState('');
  const { data: bedPage } = useListBedsPagedQuery({ limit: 200, status: 'vacant' }, { skip: !open });
  const beds = bedPage?.items ?? [];
  const [transfer, { isLoading }] = useTransferAdmissionBedMutation();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-cyan-600 hover:text-cyan-700 px-3 py-1.5 rounded-lg border border-cyan-200 hover:bg-cyan-50 transition"
      >
        Transfer Bed
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={bedId}
        onChange={(e) => setBedId(e.target.value)}
        className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500"
      >
        <option value="">Select a bed…</option>
        {beds.filter((b) => b.id !== currentBedId).map((b) => (
          <option key={b.id} value={b.id}>Bed {b.bedNumber}</option>
        ))}
      </select>
      <button
        disabled={!bedId || isLoading}
        onClick={async () => {
          try {
            await transfer({ id: admissionId, bedId }).unwrap();
            toast.success('Bed transferred');
            setOpen(false);
            setBedId('');
          } catch (err) {
            toast.error(apiError(err, 'Could not transfer the bed'));
          }
        }}
        className="bg-cyan-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-cyan-700 transition disabled:opacity-60"
      >
        {isLoading ? 'Moving…' : 'Confirm'}
      </button>
      <button onClick={() => setOpen(false)} className="text-sm text-slate-500 px-2 py-1.5 hover:text-slate-700">
        Cancel
      </button>
    </div>
  );
}

function ProgressNotesSection({
  admissionId,
  canWrite,
}: {
  admissionId: string;
  canWrite: boolean;
}) {
  const { data: notePage, isLoading } = useListProgressNotesPagedQuery({ admissionId, limit: 100 });
  const notes = notePage?.items ?? [];
  const [createNote, { isLoading: saving }] = useCreateProgressNoteMutation();
  const [draft, setDraft] = useState('');

  async function submit() {
    const note = draft.trim();
    if (!note) return;
    try {
      await createNote({ admissionId, note }).unwrap();
      setDraft('');
    } catch (err) {
      toast.error(apiError(err, 'Could not add the note'));
    }
  }

  return (
    <div className="bg-white rounded-xl shadow">
      <div className="px-6 py-4 border-b flex items-center gap-2">
        <Stethoscope className="w-4 h-4 text-cyan-600" />
        <h3 className="font-semibold text-slate-900">Progress Notes</h3>
      </div>

      {canWrite && (
        <div className="px-6 py-4 border-b bg-slate-50 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Ward-round note…"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          />
          <div className="flex justify-end">
            <button
              onClick={submit}
              disabled={saving || !draft.trim()}
              className="bg-cyan-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-cyan-700 transition disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Add Note'}
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {isLoading ? (
          <Spinner variant="block" />
        ) : notes.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-500">No progress notes yet.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="px-6 py-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-slate-900">Dr. {n.doctorName || 'Doctor'}</p>
                <p className="text-xs text-slate-400">{fmtDateTime(n.createdAt)}</p>
              </div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{n.note}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BillingSection({ admissionId, canManage }: { admissionId: string; canManage: boolean }) {
  const { data: bill, isLoading } = useGetAdmissionBillQuery(admissionId);
  const [createItem, { isLoading: saving }] = useCreateAdmissionChargeItemMutation();
  const [adding, setAdding] = useState(false);
  const [chargeType, setChargeType] = useState<'nursing' | 'doctor_visit' | 'procedure' | 'misc'>('misc');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  async function submit() {
    const parsed = Number(amount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    try {
      await createItem({ admissionId, body: { chargeType, description, amount: parsed } }).unwrap();
      toast.success('Charge added');
      setAdding(false);
      setDescription('');
      setAmount('');
    } catch (err) {
      toast.error(apiError(err, 'Could not add the charge'));
    }
  }

  return (
    <div className="bg-white rounded-xl shadow">
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-cyan-600" />
          <h3 className="font-semibold text-slate-900">Billing</h3>
        </div>
        {canManage && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-sm font-medium text-cyan-600 hover:text-cyan-700"
          >
            <Plus className="w-4 h-4" /> Add Charge
          </button>
        )}
      </div>

      {adding && (
        <div className="px-6 py-4 border-b bg-slate-50 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select
              value={chargeType}
              onChange={(e) => setChargeType(e.target.value as typeof chargeType)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500"
            >
              <option value="nursing">Nursing</option>
              <option value="doctor_visit">Doctor Visit</option>
              <option value="procedure">Procedure</option>
              <option value="misc">Miscellaneous</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Amount (₹)</label>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <button
            onClick={submit}
            disabled={saving}
            className="bg-cyan-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-cyan-700 transition disabled:opacity-60"
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
          <button onClick={() => setAdding(false)} className="text-sm text-slate-500 px-3 py-1.5 hover:text-slate-700">
            Cancel
          </button>
        </div>
      )}

      {isLoading || !bill ? (
        <Spinner variant="block" />
      ) : (
        <>
          <div className="divide-y divide-slate-100">
            <div className="px-6 py-3 flex items-center justify-between text-sm">
              <span className="text-slate-600">
                Room ({bill.roomNights} night{bill.roomNights !== 1 ? 's' : ''} × {fmtMoney(bill.roomRate)})
              </span>
              <span className="font-medium text-slate-900">{fmtMoney(bill.roomTotal)}</span>
            </div>
            {bill.items.map((item) => (
              <div key={item.id} className="px-6 py-3 flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {item.description || item.chargeType} {item.quantity > 1 ? `× ${item.quantity}` : ''}
                </span>
                <span className="font-medium text-slate-900">{fmtMoney(item.amount * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="px-6 py-4 border-t bg-slate-50 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Total</span>
              <span className="font-semibold text-slate-900">{fmtMoney(bill.grandTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Paid</span>
              <span className="text-slate-700">{fmtMoney(bill.paidTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm pt-1 border-t border-slate-200">
              <span className="font-semibold text-slate-900">Balance Due</span>
              <span className={`font-bold ${bill.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {fmtMoney(bill.balanceDue)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DischargeSection({
  admissionId,
  status,
  canDischarge,
}: {
  admissionId: string;
  status: string;
  canDischarge: boolean;
}) {
  const { data: summaryPage } = useListDischargeSummariesPagedQuery({ admissionId, limit: 1 });
  const summary = summaryPage?.items?.[0];
  const [open, setOpen] = useState(false);
  const [dischargeType, setDischargeType] = useState<DischargeType>('routine');
  const [diagnosisFinal, setDiagnosisFinal] = useState('');
  const [hospitalCourse, setHospitalCourse] = useState('');
  const [conditionAtDischarge, setConditionAtDischarge] = useState('');
  const [dischargeMedications, setDischargeMedications] = useState('');
  const [followUpAdvice, setFollowUpAdvice] = useState('');
  const [createSummary, { isLoading: saving }] = useCreateDischargeSummaryMutation();

  if (summary) {
    return (
      <div className="bg-white rounded-xl shadow">
        <div className="px-6 py-4 border-b flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyan-600" />
          <h3 className="font-semibold text-slate-900">Discharge Summary</h3>
        </div>
        <div className="px-6 py-4 space-y-3 text-sm">
          <p className="text-xs text-slate-400">
            {fmtDateTime(summary.dischargedAt)} · Dr. {summary.doctorName || 'Doctor'}
          </p>
          <div><span className="font-medium text-slate-700">Final diagnosis: </span>{summary.diagnosisFinal || '—'}</div>
          <div><span className="font-medium text-slate-700">Hospital course: </span>{summary.hospitalCourse || '—'}</div>
          <div><span className="font-medium text-slate-700">Condition at discharge: </span>{summary.conditionAtDischarge || '—'}</div>
          <div><span className="font-medium text-slate-700">Discharge medications: </span>{summary.dischargeMedications || '—'}</div>
          <div><span className="font-medium text-slate-700">Follow-up advice: </span>{summary.followUpAdvice || '—'}</div>
        </div>
      </div>
    );
  }

  if (status !== 'admitted' || !canDischarge) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-700 transition"
      >
        <LogOut className="w-4 h-4" /> Discharge Patient
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow">
      <div className="px-6 py-4 border-b flex items-center gap-2">
        <LogOut className="w-4 h-4 text-red-600" />
        <h3 className="font-semibold text-slate-900">Discharge Patient</h3>
      </div>
      <div className="px-6 py-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Discharge Type</label>
          <select
            value={dischargeType}
            onChange={(e) => setDischargeType(e.target.value as DischargeType)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="routine">Routine</option>
            <option value="referred">Referred / Transferred</option>
            <option value="dama">DAMA (against medical advice)</option>
            <option value="deceased">Deceased</option>
          </select>
        </div>
        <textarea
          value={diagnosisFinal}
          onChange={(e) => setDiagnosisFinal(e.target.value)}
          placeholder="Final diagnosis"
          rows={2}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        />
        <textarea
          value={hospitalCourse}
          onChange={(e) => setHospitalCourse(e.target.value)}
          placeholder="Hospital course"
          rows={2}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        />
        <textarea
          value={conditionAtDischarge}
          onChange={(e) => setConditionAtDischarge(e.target.value)}
          placeholder="Condition at discharge"
          rows={2}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        />
        <textarea
          value={dischargeMedications}
          onChange={(e) => setDischargeMedications(e.target.value)}
          placeholder="Discharge medications"
          rows={2}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        />
        <textarea
          value={followUpAdvice}
          onChange={(e) => setFollowUpAdvice(e.target.value)}
          placeholder="Follow-up advice"
          rows={2}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        />
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={() => setOpen(false)} className="text-sm text-slate-500 px-3 py-2 hover:text-slate-700">
            Cancel
          </button>
          <button
            onClick={async () => {
              try {
                await createSummary({
                  admissionId,
                  dischargeType,
                  diagnosisFinal,
                  hospitalCourse,
                  conditionAtDischarge,
                  dischargeMedications,
                  followUpAdvice,
                }).unwrap();
                toast.success('Patient discharged');
                // No manual refresh needed: createDischargeSummary's
                // invalidatesTags refetches both this admission and its
                // discharge-summary list, which is what flips this section
                // over to the read view below.
              } catch (err) {
                toast.error(apiError(err, 'Could not complete the discharge'));
              }
            }}
            disabled={saving}
            className="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-700 transition disabled:opacity-60"
          >
            {saving ? 'Discharging…' : 'Confirm Discharge'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdmissionWorkspace({ session, admissionId }: { session: AuthSession; admissionId: string }) {
  const router = useRouter();
  const { data: admission, isLoading, isError } = useGetAdmissionQuery(admissionId);
  const { data: ownDoctor } = useGetDoctorByUserQuery(session.user.id, {
    skip: session.user.role !== doctorRole,
  });

  if (isLoading) {
    return (
      <DashboardShell role={session.user.role} userName={session.user.name} title="Admission" loading>
        <Spinner variant="block" />
      </DashboardShell>
    );
  }

  if (isError || !admission) {
    return (
      <DashboardShell role={session.user.role} userName={session.user.name} title="Admission">
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">This admission could not be found.</p>
          <button
            onClick={() => router.push('/dashboard/admissions')}
            className="mt-4 text-sm font-medium text-cyan-600 hover:text-cyan-700"
          >
            Back to Admissions
          </button>
        </div>
      </DashboardShell>
    );
  }

  const manageScope = permissionScope(session.permissions, 'admissions.manage');
  const canTransfer = manageScope === 'all' && admission.status === 'admitted';
  const isAttending = !!ownDoctor && ownDoctor.id === admission.doctorId;
  const canWriteNotes =
    hasPermission(session.permissions, 'progress_notes.write') &&
    (isAttending || permissionScope(session.permissions, 'progress_notes.write') === 'all');
  const canDischarge =
    hasPermission(session.permissions, 'admissions.discharge') &&
    (permissionScope(session.permissions, 'admissions.discharge') === 'all' || isAttending);
  const canBill = hasPermission(session.permissions, 'ipd_billing.manage');

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title={`Admission ${admission.admissionNumber}`}
      subtitle={admission.patientName}
    >
      <div className="space-y-6">
        <button
          onClick={() => router.push('/dashboard/admissions')}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Admissions
        </button>

        {/* Header card */}
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold text-slate-900">{admission.patientName || 'Patient'}</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[admission.status] ?? ''}`}>
                  {admission.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm text-slate-500">{admission.patientPhone}</p>
            </div>
            {canTransfer && <TransferBedControl admissionId={admission.id} currentBedId={admission.bedId} />}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Attending Doctor</p>
              <p className="text-sm font-medium text-slate-900">Dr. {admission.doctorName || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Ward / Bed</p>
              <p className="text-sm font-medium text-slate-900 flex items-center gap-1">
                <BedDouble className="w-3.5 h-3.5 text-slate-400" />
                {admission.wardName} · Bed {admission.bedNumber}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Admitted</p>
              <p className="text-sm font-medium text-slate-900">{fmtDateTime(admission.admittedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Type / Payer</p>
              <p className="text-sm font-medium text-slate-900 capitalize">
                {admission.admissionType} · {admission.payerType}
              </p>
            </div>
          </div>

          {admission.provisionalDiagnosis && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Provisional Diagnosis</p>
              <p className="text-sm text-slate-700">{admission.provisionalDiagnosis}</p>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <ProgressNotesSection admissionId={admission.id} canWrite={canWriteNotes} />
          <BillingSection admissionId={admission.id} canManage={canBill} />
        </div>

        <DischargeSection
          admissionId={admission.id}
          status={admission.status}
          canDischarge={canDischarge}
        />
      </div>
    </DashboardShell>
  );
}

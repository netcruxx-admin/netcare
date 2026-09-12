'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Baby, Plus, X, AlertTriangle, Search } from 'lucide-react';
import type { PregnancyRecord } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import { hasPermission } from '@/lib/auth';
import {
  useCreateAncVisitMutation,
  useGetDoctorByUserQuery,
  useCreatePregnancyMutation,
  useListPatientsQuery,
  useListPregnanciesPagedQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { eddFromLmp, evaluateRisks, formatGA, gestationalAge, trimester } from '@/lib/anc';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

const today = () => new Date().toISOString().split('T')[0];

export function DoctorPregnancies({ session }: RoleViewProps) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [visitFor, setVisitFor] = useState<PregnancyRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const table = useServerTable({ filterKey: statusFilter });

  // The mother's name, the visit count and the newest visit's readings all
  // arrive on the record, so this screen no longer holds every patient and
  // every antenatal visit in the hospital in memory.
  const { data: pregnancyPage, isLoading } = useListPregnanciesPagedQuery({
    q: table.q.trim() || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: table.limit,
    offset: table.offset,
  });
  const records = pregnancyPage?.items ?? [];
  const totalRecords = pregnancyPage?.total ?? 0;
  const { data: doctor } = useGetDoctorByUserQuery(session.user.id);
  const doctorId = doctor?.id ?? '';
  // Nurse holds pregnancies.read but not pregnancies.manage — same list,
  // read-only: no new records, no antenatal visits.
  const canManage = hasPermission(session, 'pregnancies.manage');

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Pregnancies"
      subtitle="Antenatal records for your maternity patients"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              placeholder="Search patient, blood group or notes…"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="delivered">Delivered</option>
            <option value="closed">Closed</option>
          </select>
          {canManage && (
            <Button
              onClick={() => setShowNew(true)}
              variant="brand"
              className="ml-auto"
            >
              <Plus className="w-4 h-4" /> New pregnancy record
            </Button>
          )}
        </div>

        {isLoading ? (
          <Spinner variant="block" />
        ) : records.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Baby className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">
              {canManage
                ? 'No pregnancy records yet. Create one to start antenatal tracking.'
                : 'No pregnancy records yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {records.map((r) => {
              const ga = gestationalAge(r.lmp);
              const visitCount = r.visitCount ?? 0;
              const risks = evaluateRisks(r, r.latestVisit ?? undefined);
              return (
                <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{r.patientName || r.patientId}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatGA(ga)} · Trimester {trimester(ga.weeks)} · G{r.gravida}P{r.para}
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-700 bg-cyan-100 px-2 py-0.5 rounded-full capitalize">
                      {r.status}
                    </span>
                  </div>
                  <div className="mt-3 text-xs text-slate-500 space-y-0.5">
                    <p>EDD: {new Date(r.edd + 'T00:00:00').toLocaleDateString('en-IN')}</p>
                    <p>{visitCount} antenatal visit{visitCount === 1 ? '' : 's'}</p>
                  </div>
                  {risks.length > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {risks.length} flag{risks.length === 1 ? '' : 's'}
                    </div>
                  )}
                  {canManage && (
                    <button
                      onClick={() => setVisitFor(r)}
                      className="mt-3 w-full text-sm font-medium text-cyan-700 border border-cyan-200 rounded-lg py-2 hover:bg-cyan-50"
                    >
                      + Add antenatal visit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {totalRecords > 0 && (
          <div className="bg-white rounded-lg shadow">
            <TablePagination
              page={table.page}
              pageSize={table.pageSize}
              total={totalRecords}
              onPageChange={table.setPage}
            />
          </div>
        )}
      </div>

      {showNew && (
        <NewPregnancyModal
          onClose={() => setShowNew(false)}
          onSaved={() => setShowNew(false)}
        />
      )}

      {visitFor && (
        <NewVisitModal
          record={visitFor}
          doctorId={doctorId}
          onClose={() => setVisitFor(null)}
          onSaved={() => setVisitFor(null)}
        />
      )}
    </DashboardShell>
  );
}

// --- New pregnancy record modal ---------------------------------------------
interface PregnancyFormValues {
  patientId: string;
  lmp: string;
  gravida: string;
  para: string;
  height: string;
  weight: string;
  bloodGroup: string;
  riskFactors: string;
  notes: string;
}

const pregnancySchema = Yup.object({
  patientId: Yup.string().required('Select a patient'),
  lmp: Yup.string().required('Last menstrual period (LMP) is required'),
});

function NewPregnancyModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: patientRecords = [] } = useListPatientsQuery();
  const [createPregnancy] = useCreatePregnancyMutation();
  const patients = useMemo(
    () =>
      patientRecords.map((p) => ({
        id: p.id,
        name: p.user?.name ?? p.id,
        bloodGroup: p.bloodGroup,
      })),
    [patientRecords],
  );

  const [error, setError] = useState('');

  const initialValues: PregnancyFormValues = {
    patientId: '', lmp: '', gravida: '1', para: '0', height: '', weight: '', bloodGroup: '', riskFactors: '', notes: '',
  };

  return (
    <Modal title="New pregnancy record" onClose={onClose}>
      <Formik<PregnancyFormValues>
        initialValues={initialValues}
        validationSchema={pregnancySchema}
        onSubmit={async (values, { setSubmitting }) => {
          setError('');
          try {
            await createPregnancy({
              patientId: values.patientId,
              lmp: values.lmp,
              edd: eddFromLmp(values.lmp),
              gravida: Number(values.gravida) || 0,
              para: Number(values.para) || 0,
              height: Number(values.height) || 0,
              prePregnancyWeight: Number(values.weight) || 0,
              bloodGroup: values.bloodGroup,
              riskFactors: values.riskFactors.split(',').map((s) => s.trim()).filter(Boolean),
              status: 'active',
              notes: values.notes,
            }).unwrap();
            onSaved();
          } catch (err) {
            setError(apiError(err, 'Could not save the pregnancy record'));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {({ values, handleChange, setFieldValue, isSubmitting, dirty }) => (
          <Form className="space-y-3">
            <Field label="Patient">
              <select
                name="patientId"
                value={values.patientId}
                onChange={(e) => {
                  handleChange(e);
                  const p = patients.find((x) => x.id === e.target.value);
                  if (p?.bloodGroup) setFieldValue('bloodGroup', p.bloodGroup);
                }}
                className={inputCls}
              >
                <option value="">Select patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="LMP (last period)">
                <input type="date" name="lmp" value={values.lmp} max={today()} onChange={handleChange} className={inputCls} />
              </Field>
              <Field label="EDD (auto)">
                <input value={values.lmp ? eddFromLmp(values.lmp) : ''} readOnly className={`${inputCls} bg-slate-50 text-slate-500`} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Gravida"><input type="number" min={1} name="gravida" value={values.gravida} onChange={handleChange} className={inputCls} /></Field>
              <Field label="Para"><input type="number" min={0} name="para" value={values.para} onChange={handleChange} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Height (cm)"><input type="number" name="height" value={values.height} onChange={handleChange} className={inputCls} /></Field>
              <Field label="Weight (kg)"><input type="number" name="weight" value={values.weight} onChange={handleChange} className={inputCls} /></Field>
              <Field label="Blood group"><input name="bloodGroup" value={values.bloodGroup} onChange={handleChange} className={inputCls} /></Field>
            </div>
            <Field label="Risk factors (comma-separated)">
              <input name="riskFactors" value={values.riskFactors} onChange={handleChange} placeholder="e.g. Previous C-section, Advanced maternal age" className={inputCls} />
            </Field>
            <Field label="Notes">
              <textarea name="notes" value={values.notes} onChange={handleChange} rows={2} className={inputCls} />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
              <Button type="submit" disabled={isSubmitting || !dirty} variant="brand">
                {isSubmitting ? 'Saving…' : 'Save record'}
              </Button>
            </div>
          </Form>
        )}
      </Formik>
    </Modal>
  );
}

// --- New ANC visit modal -----------------------------------------------------
interface AncVisitFormValues {
  date: string;
  weight: string;
  systolic: string;
  diastolic: string;
  fundalHeight: string;
  hemoglobin: string;
  fhr: string;
  notes: string;
}

function NewVisitModal({
  record,
  doctorId,
  onClose,
  onSaved,
}: {
  record: PregnancyRecord;
  doctorId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState('');
  const [createAncVisit] = useCreateAncVisitMutation();

  const initialValues: AncVisitFormValues = {
    date: today(), weight: '', systolic: '', diastolic: '', fundalHeight: '', hemoglobin: '', fhr: '', notes: '',
  };

  return (
    <Formik<AncVisitFormValues>
      initialValues={initialValues}
      onSubmit={async (values, { setSubmitting }) => {
        setError('');
        const weeks = gestationalAge(record.lmp, new Date(values.date + 'T00:00:00')).weeks;
        try {
          await createAncVisit({
            pregnancyId: record.id,
            patientId: record.patientId,
            doctorId,
            date: values.date,
            weeks,
            weight: Number(values.weight) || 0,
            systolic: Number(values.systolic) || 0,
            diastolic: Number(values.diastolic) || 0,
            fundalHeight: Number(values.fundalHeight) || 0,
            hemoglobin: Number(values.hemoglobin) || 0,
            fetalHeartRate: Number(values.fhr) || 0,
            notes: values.notes,
          }).unwrap();
          onSaved();
        } catch (err) {
          setError(apiError(err, 'Could not save the visit'));
        } finally {
          setSubmitting(false);
        }
      }}
    >
      {({ values, handleChange, isSubmitting, dirty }) => {
        const weeks = gestationalAge(record.lmp, new Date(values.date + 'T00:00:00')).weeks;
        return (
          <Modal title={`Antenatal visit · week ${weeks}`} onClose={onClose}>
            <Form className="space-y-3">
              <Field label="Visit date">
                <input type="date" name="date" value={values.date} max={today()} onChange={handleChange} className={inputCls} />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Weight (kg)"><input type="number" name="weight" value={values.weight} onChange={handleChange} className={inputCls} /></Field>
                <Field label="Systolic"><input type="number" name="systolic" value={values.systolic} onChange={handleChange} className={inputCls} /></Field>
                <Field label="Diastolic"><input type="number" name="diastolic" value={values.diastolic} onChange={handleChange} className={inputCls} /></Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Fundal ht. (cm)"><input type="number" name="fundalHeight" value={values.fundalHeight} onChange={handleChange} className={inputCls} /></Field>
                <Field label="Hb (g/dL)"><input type="number" step="0.1" name="hemoglobin" value={values.hemoglobin} onChange={handleChange} className={inputCls} /></Field>
                <Field label="FHR (bpm)"><input type="number" name="fhr" value={values.fhr} onChange={handleChange} className={inputCls} /></Field>
              </div>
              <Field label="Notes">
                <textarea name="notes" value={values.notes} onChange={handleChange} rows={2} className={inputCls} />
              </Field>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
                <Button type="submit" disabled={isSubmitting || !dirty} variant="brand">
                  {isSubmitting ? 'Saving…' : 'Save visit'}
                </Button>
              </div>
            </Form>
          </Modal>
        );
      }}
    </Formik>
  );
}

// --- Small UI helpers --------------------------------------------------------
const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

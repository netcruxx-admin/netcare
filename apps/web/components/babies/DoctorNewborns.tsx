'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Baby as BabyIcon, Plus, X, Search, Syringe, LineChart as LineChartIcon, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { Baby, Immunization } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import { hasPermission } from '@/lib/auth';
import {
  useAddGrowthMutation,
  useCreateBabyMutation,
  useCreateImmunizationMutation,
  useListBabiesPagedQuery,
  useListGrowthQuery,
  useListImmunizationsQuery,
  useListPatientsQuery,
  useMarkImmunizationGivenMutation,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { ageDisplay, scheduleForDob, immStatus } from '@/lib/baby';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

const today = () => new Date().toISOString().split('T')[0];
const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500';

export function DoctorNewborns({ session }: RoleViewProps) {
  const [showRegister, setShowRegister] = useState(false);
  const [growthFor, setGrowthFor] = useState<Baby | null>(null);
  const [immFor, setImmFor] = useState<Baby | null>(null);

  const table = useServerTable();

  // The mother's name arrives on the record, so this screen no longer holds
  // every patient in the hospital in memory to label a card.
  const { data: babyPage, isLoading } = useListBabiesPagedQuery({
    q: table.q.trim() || undefined,
    limit: table.limit,
    offset: table.offset,
  });
  const babies = babyPage?.items ?? [];
  const totalBabies = babyPage?.total ?? 0;
  // Nurse holds babies.read but not babies.manage — same list, read-only: no
  // registration, no growth entries, no marking a vaccine given.
  const canManage = hasPermission(session, 'babies.manage');

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Newborns" subtitle="Growth tracking & immunisations">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              placeholder="Search baby or mother…"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          {canManage && (
            <Button onClick={() => setShowRegister(true)} variant="brand" className="ml-auto">
              <Plus className="w-4 h-4" /> Register newborn
            </Button>
          )}
        </div>

        {isLoading ? (
          <Spinner variant="block" />
        ) : babies.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <BabyIcon className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">No newborns registered yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {babies.map((b) => (
              <BabyCard
                key={b.id}
                baby={b}
                motherName={b.motherName || '—'}
                onGrowth={() => setGrowthFor(b)}
                onImmunisations={() => setImmFor(b)}
              />
            ))}
          </div>
        )}
        {totalBabies > 0 && (
          <div className="bg-white rounded-lg shadow">
            <TablePagination
              page={table.page}
              pageSize={table.pageSize}
              total={totalBabies}
              onPageChange={table.setPage}
            />
          </div>
        )}
      </div>

      {showRegister && <RegisterBabyModal onClose={() => setShowRegister(false)} onSaved={() => setShowRegister(false)} />}
      {growthFor && <GrowthModal baby={growthFor} canManage={canManage} onClose={() => setGrowthFor(null)} />}
      {immFor && <ImmunizationModal baby={immFor} canManage={canManage} onClose={() => setImmFor(null)} />}
    </DashboardShell>
  );
}

/** One baby in the list. Fetches its own immunisations so the overdue badge is
 *  accurate without loading every baby's schedule up front. */
function BabyCard({
  baby,
  motherName,
  onGrowth,
  onImmunisations,
}: {
  baby: Baby;
  motherName: string;
  onGrowth: () => void;
  onImmunisations: () => void;
}) {
  const { data: imms = [] } = useListImmunizationsQuery(baby.id);
  const overdue = imms.filter((i) => immStatus(i) === 'overdue').length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-slate-900">{baby.name || 'Baby'}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {ageDisplay(baby.dateOfBirth)} · {baby.sex === 'male' ? 'Boy' : 'Girl'} · Mother: {motherName}
          </p>
        </div>
        {overdue > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5" /> {overdue} overdue
          </span>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={onGrowth} className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-cyan-700 border border-cyan-200 rounded-lg py-2 hover:bg-cyan-50">
          <LineChartIcon className="w-4 h-4" /> Growth
        </button>
        <button onClick={onImmunisations} className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-cyan-700 border border-cyan-200 rounded-lg py-2 hover:bg-cyan-50">
          <Syringe className="w-4 h-4" /> Immunisations
        </button>
      </div>
    </div>
  );
}

interface RegisterBabyValues {
  motherPatientId: string;
  name: string;
  dob: string;
  sex: 'male' | 'female';
  birthWeight: string;
  birthLength: string;
  headCircumference: string;
  deliveryType: 'normal' | 'c-section' | 'assisted';
  gestationalWeeks: string;
}

const registerBabySchema = Yup.object({
  motherPatientId: Yup.string().required('Select the mother'),
  dob: Yup.string().required('Date of birth is required'),
});

function RegisterBabyModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: patientRecords = [] } = useListPatientsQuery();
  const [createBaby] = useCreateBabyMutation();
  const [createImmunization] = useCreateImmunizationMutation();
  const [addGrowth] = useAddGrowthMutation();
  const mothers = useMemo(() => {
    return patientRecords.map((p) => ({ id: p.id, name: p.user?.name ?? p.id }));
  }, []);

  const [error, setError] = useState('');

  const initialValues: RegisterBabyValues = {
    motherPatientId: '', name: '', dob: today(), sex: 'female',
    birthWeight: '', birthLength: '', headCircumference: '',
    deliveryType: 'normal', gestationalWeeks: '39',
  };

  return (
    <Modal title="Register newborn" onClose={onClose}>
      <Formik<RegisterBabyValues>
        initialValues={initialValues}
        validationSchema={registerBabySchema}
        onSubmit={async (values, { setSubmitting }) => {
          setError('');
          const birthWeight = Number(values.birthWeight) || 0;
          const birthLength = Number(values.birthLength) || 0;
          const headCircumference = Number(values.headCircumference) || 0;
          try {
            const baby = await createBaby({
              motherPatientId: values.motherPatientId,
              name: values.name || 'Baby',
              dateOfBirth: values.dob,
              sex: values.sex,
              birthWeight, birthLength, headCircumference,
              deliveryType: values.deliveryType,
              gestationalWeeks: Number(values.gestationalWeeks) || 0,
            }).unwrap();

            // Seed the immunisation schedule from the DOB.
            for (const s of scheduleForDob(values.dob)) {
              await createImmunization({
                babyId: baby.id,
                body: { vaccine: s.vaccine, ageLabel: s.ageLabel, dueDate: s.dueDate, status: 'pending' },
              }).unwrap();
            }
            // Record the birth measurement as the first growth point.
            if (birthWeight) {
              await addGrowth({
                babyId: baby.id,
                body: { date: values.dob, weight: birthWeight, height: birthLength, headCircumference },
              }).unwrap();
            }
            onSaved();
          } catch (err) {
            setError(apiError(err, 'Could not register the newborn'));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {({ values, handleChange, isSubmitting, dirty }) => (
          <Form className="space-y-3">
            <Field label="Mother">
              <select name="motherPatientId" value={values.motherPatientId} onChange={handleChange} className={inputCls}>
                <option value="">Select mother…</option>
                {mothers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Baby's name"><input name="name" value={values.name} onChange={handleChange} placeholder="Baby / given name" className={inputCls} /></Field>
              <Field label="Date of birth"><input type="date" name="dob" value={values.dob} max={today()} onChange={handleChange} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sex">
                <select name="sex" value={values.sex} onChange={handleChange} className={inputCls}>
                  <option value="female">Girl</option>
                  <option value="male">Boy</option>
                </select>
              </Field>
              <Field label="Gestational age (weeks)"><input type="number" name="gestationalWeeks" value={values.gestationalWeeks} onChange={handleChange} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Birth weight (kg)"><input type="number" step="0.01" name="birthWeight" value={values.birthWeight} onChange={handleChange} className={inputCls} /></Field>
              <Field label="Length (cm)"><input type="number" step="0.1" name="birthLength" value={values.birthLength} onChange={handleChange} className={inputCls} /></Field>
              <Field label="Head circ. (cm)"><input type="number" step="0.1" name="headCircumference" value={values.headCircumference} onChange={handleChange} className={inputCls} /></Field>
            </div>
            <Field label="Delivery type">
              <select name="deliveryType" value={values.deliveryType} onChange={handleChange} className={inputCls}>
                <option value="normal">Normal (vaginal)</option>
                <option value="c-section">C-section</option>
                <option value="assisted">Assisted</option>
              </select>
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
              <Button type="submit" disabled={isSubmitting || !dirty} variant="brand">
                {isSubmitting ? 'Registering…' : 'Register'}
              </Button>
            </div>
          </Form>
        )}
      </Formik>
    </Modal>
  );
}

interface GrowthValues {
  date: string;
  weight: string;
  height: string;
  head: string;
}

function GrowthModal({ baby, canManage, onClose }: { baby: Baby; canManage: boolean; onClose: () => void }) {
  const { data: measurements = [] } = useListGrowthQuery(baby.id);
  const [addGrowth] = useAddGrowthMutation();
  const [error, setError] = useState('');

  const initialValues: GrowthValues = { date: today(), weight: '', height: '', head: '' };

  return (
    <Modal title={`Growth — ${baby.name}`} onClose={onClose}>
      <div className="space-y-3">
      <Formik<GrowthValues>
        initialValues={initialValues}
        onSubmit={async (values, { setSubmitting, resetForm }) => {
          const weight = Number(values.weight) || 0;
          if (!weight) { setSubmitting(false); return; }
          setError('');
          try {
            await addGrowth({
              babyId: baby.id,
              body: { date: values.date, weight, height: Number(values.height) || 0, headCircumference: Number(values.head) || 0 },
            }).unwrap();
            resetForm({ values: { ...values, weight: '', height: '', head: '' } });
          } catch (err) {
            setError(apiError(err, 'Could not add the measurement'));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {({ values, handleChange, isSubmitting, dirty }) => (
          <Form className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input type="date" name="date" value={values.date} max={today()} onChange={handleChange} className={inputCls} /></Field>
              <Field label="Weight (kg)"><input type="number" step="0.01" name="weight" value={values.weight} onChange={handleChange} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Length (cm)"><input type="number" step="0.1" name="height" value={values.height} onChange={handleChange} className={inputCls} /></Field>
              <Field label="Head circ. (cm)"><input type="number" step="0.1" name="head" value={values.head} onChange={handleChange} className={inputCls} /></Field>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {canManage && (
              <Button type="submit" disabled={isSubmitting || !dirty} variant="brand" className="w-full">
                {isSubmitting ? 'Adding…' : 'Add measurement'}
              </Button>
            )}
          </Form>
        )}
      </Formik>

      <div className="pt-2">
        <p className="text-xs font-medium text-slate-500 mb-1">Recorded measurements</p>
        {measurements.length === 0 ? (
          <p className="text-sm text-slate-400">None yet.</p>
        ) : (
          <div className="max-h-40 overflow-y-auto text-sm divide-y divide-slate-100">
            {[...measurements].reverse().map((m) => (
              <div key={m.id} className="flex justify-between py-1.5 text-slate-700">
                <span>{m.date}</span>
                <span>{m.weight} kg{m.height ? ` · ${m.height} cm` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </Modal>
  );
}

function ImmunizationModal({ baby, canManage, onClose }: { baby: Baby; canManage: boolean; onClose: () => void }) {
  const { data: imms = [] } = useListImmunizationsQuery(baby.id);
  const [markGiven] = useMarkImmunizationGivenMutation();
  const [error, setError] = useState('');

  const give = async (id: string) => {
    setError('');
    try {
      await markGiven({ babyId: baby.id, immunizationId: id, givenDate: today() }).unwrap();
    } catch (err) {
      setError(apiError(err, 'Could not record the vaccination'));
    }
  };

  // Group by age label.
  const groups = imms.reduce<Record<string, Immunization[]>>((acc, i) => {
    (acc[i.ageLabel] ??= []).push(i);
    return acc;
  }, {});

  return (
    <Modal title={`Immunisations — ${baby.name}`} onClose={onClose}>
      <div className="space-y-4 max-h-[60vh] overflow-y-auto">
        {Object.entries(groups).map(([label, list]) => (
          <div key={label}>
            <p className="text-xs font-semibold text-slate-500 mb-1">{label}</p>
            <div className="space-y-1">
              {list.map((i) => {
                const st = immStatus(i);
                return (
                  <div key={i.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{i.vaccine}</span>
                    {i.status === 'given' ? (
                      <span className="inline-flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Given {i.givenDate}</span>
                    ) : canManage ? (
                      <button onClick={() => give(i.id)} className={`text-xs font-medium px-2 py-1 rounded-md border ${st === 'overdue' ? 'border-amber-300 text-amber-700 hover:bg-amber-50' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                        Mark given
                      </button>
                    ) : (
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${st === 'overdue' ? 'bg-red-100 text-red-700' : st === 'due' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                        {st === 'overdue' ? 'Overdue' : st === 'due' ? 'Due now' : 'Upcoming'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// --- shared bits -------------------------------------------------------------
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

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Baby as BabyIcon, Plus, X, Syringe, LineChart as LineChartIcon, CheckCircle2, AlertTriangle } from 'lucide-react';
import { dbOperations, type Baby, type Immunization } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ageDisplay, scheduleForDob, immStatus } from '@/lib/baby';

const today = () => new Date().toISOString().split('T')[0];
const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500';

export function DoctorNewborns({ session }: RoleViewProps) {
  const router = useRouter();
  const [babies, setBabies] = useState<Baby[]>([]);
  const [showRegister, setShowRegister] = useState(false);
  const [growthFor, setGrowthFor] = useState<Baby | null>(null);
  const [immFor, setImmFor] = useState<Baby | null>(null);

  const refresh = () => setBabies([...dbOperations.getAllBabies()]);

  useEffect(() => {
    refresh();
  }, [session]);

  const motherName = useMemo(() => {
    const users = new Map(dbOperations.getAllUsers().map((u) => [u.id, u.name]));
    const map = new Map<string, string>();
    dbOperations.getAllPatients().forEach((p) => map.set(p.id, users.get(p.userId) ?? p.id));
    return map;
  }, [babies]);

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Newborns" subtitle="Growth tracking & immunisations">
      <div className="space-y-4">
        <div className="flex justify-end">
          <button onClick={() => setShowRegister(true)} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 text-white text-sm font-semibold px-4 py-2 shadow hover:opacity-95">
            <Plus className="w-4 h-4" /> Register newborn
          </button>
        </div>

        {babies.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <BabyIcon className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">No newborns registered yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {babies.map((b) => {
              const imms = dbOperations.getImmunizationsByBabyId(b.id);
              const overdue = imms.filter((i) => immStatus(i) === 'overdue').length;
              return (
                <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{b.name || 'Baby'}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {ageDisplay(b.dateOfBirth)} · {b.sex === 'male' ? 'Boy' : 'Girl'} · Mother: {motherName.get(b.motherPatientId) ?? '—'}
                      </p>
                    </div>
                    {overdue > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="w-3.5 h-3.5" /> {overdue} overdue</span>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => setGrowthFor(b)} className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-cyan-700 border border-cyan-200 rounded-lg py-2 hover:bg-cyan-50">
                      <LineChartIcon className="w-4 h-4" /> Growth
                    </button>
                    <button onClick={() => setImmFor(b)} className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-cyan-700 border border-cyan-200 rounded-lg py-2 hover:bg-cyan-50">
                      <Syringe className="w-4 h-4" /> Immunisations
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showRegister && <RegisterBabyModal onClose={() => setShowRegister(false)} onSaved={() => { setShowRegister(false); refresh(); }} />}
      {growthFor && <GrowthModal baby={growthFor} onClose={() => setGrowthFor(null)} />}
      {immFor && <ImmunizationModal baby={immFor} onClose={() => setImmFor(null)} />}
    </DashboardShell>
  );
}

function RegisterBabyModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const mothers = useMemo(() => {
    const users = new Map(dbOperations.getAllUsers().map((u) => [u.id, u.name]));
    return dbOperations.getAllPatients().map((p) => ({ id: p.id, name: users.get(p.userId) ?? p.id }));
  }, []);

  const [motherPatientId, setMother] = useState('');
  const [name, setName] = useState('');
  const [dob, setDob] = useState(today());
  const [sex, setSex] = useState<'male' | 'female'>('female');
  const [birthWeight, setBirthWeight] = useState(0);
  const [birthLength, setBirthLength] = useState(0);
  const [headCircumference, setHead] = useState(0);
  const [deliveryType, setDelivery] = useState<'normal' | 'c-section' | 'assisted'>('normal');
  const [gestationalWeeks, setGA] = useState(39);
  const [error, setError] = useState('');

  const save = () => {
    if (!motherPatientId) return setError('Select the mother');
    if (!dob) return setError('Date of birth is required');
    const babyId = `baby-${Date.now()}`;
    dbOperations.createBaby({
      id: babyId, motherPatientId, name: name || 'Baby', dateOfBirth: dob, sex,
      birthWeight, birthLength, headCircumference, deliveryType, gestationalWeeks,
      createdAt: new Date().toISOString(),
    });
    // Seed the immunisation schedule from the DOB.
    scheduleForDob(dob).forEach((s, i) => {
      dbOperations.createImmunization({
        id: `imm-${Date.now()}-${i}`, babyId, vaccine: s.vaccine, ageLabel: s.ageLabel,
        dueDate: s.dueDate, status: 'pending', createdAt: new Date().toISOString(),
      });
    });
    // Record the birth measurement as the first growth point.
    if (birthWeight) {
      dbOperations.addGrowthMeasurement({
        id: `gm-${Date.now()}`, babyId, date: dob, weight: birthWeight, height: birthLength,
        headCircumference, createdAt: new Date().toISOString(),
      });
    }
    onSaved();
  };

  return (
    <Modal title="Register newborn" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Mother">
          <select value={motherPatientId} onChange={(e) => setMother(e.target.value)} className={inputCls}>
            <option value="">Select mother…</option>
            {mothers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Baby's name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Baby / given name" className={inputCls} /></Field>
          <Field label="Date of birth"><input type="date" value={dob} max={today()} onChange={(e) => setDob(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sex">
            <select value={sex} onChange={(e) => setSex(e.target.value as 'male' | 'female')} className={inputCls}>
              <option value="female">Girl</option>
              <option value="male">Boy</option>
            </select>
          </Field>
          <Field label="Gestational age (weeks)"><input type="number" value={gestationalWeeks} onChange={(e) => setGA(+e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Birth weight (kg)"><input type="number" step="0.01" value={birthWeight || ''} onChange={(e) => setBirthWeight(+e.target.value)} className={inputCls} /></Field>
          <Field label="Length (cm)"><input type="number" step="0.1" value={birthLength || ''} onChange={(e) => setBirthLength(+e.target.value)} className={inputCls} /></Field>
          <Field label="Head circ. (cm)"><input type="number" step="0.1" value={headCircumference || ''} onChange={(e) => setHead(+e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Delivery type">
          <select value={deliveryType} onChange={(e) => setDelivery(e.target.value as 'normal' | 'c-section' | 'assisted')} className={inputCls}>
            <option value="normal">Normal (vaginal)</option>
            <option value="c-section">C-section</option>
            <option value="assisted">Assisted</option>
          </select>
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
          <button onClick={save} className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-teal-600 rounded-lg">Register</button>
        </div>
      </div>
    </Modal>
  );
}

function GrowthModal({ baby, onClose }: { baby: Baby; onClose: () => void }) {
  const [, tick] = useState(0);
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState(0);
  const [height, setHeight] = useState(0);
  const [head, setHead] = useState(0);

  const measurements = dbOperations.getGrowthByBabyId(baby.id);

  const add = () => {
    if (!weight) return;
    dbOperations.addGrowthMeasurement({
      id: `gm-${Date.now()}`, babyId: baby.id, date, weight, height, headCircumference: head,
      createdAt: new Date().toISOString(),
    });
    setWeight(0); setHeight(0); setHead(0);
    tick((t) => t + 1);
  };

  return (
    <Modal title={`Growth — ${baby.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
          <Field label="Weight (kg)"><input type="number" step="0.01" value={weight || ''} onChange={(e) => setWeight(+e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Length (cm)"><input type="number" step="0.1" value={height || ''} onChange={(e) => setHeight(+e.target.value)} className={inputCls} /></Field>
          <Field label="Head circ. (cm)"><input type="number" step="0.1" value={head || ''} onChange={(e) => setHead(+e.target.value)} className={inputCls} /></Field>
        </div>
        <button onClick={add} className="w-full py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 text-white text-sm font-semibold">Add measurement</button>

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

function ImmunizationModal({ baby, onClose }: { baby: Baby; onClose: () => void }) {
  const [, tick] = useState(0);
  const imms = dbOperations.getImmunizationsByBabyId(baby.id);

  const give = (id: string) => {
    dbOperations.markImmunizationGiven(id, today());
    tick((t) => t + 1);
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
                    ) : (
                      <button onClick={() => give(i.id)} className={`text-xs font-medium px-2 py-1 rounded-md border ${st === 'overdue' ? 'border-amber-300 text-amber-700 hover:bg-amber-50' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                        Mark given
                      </button>
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

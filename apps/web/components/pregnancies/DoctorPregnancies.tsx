'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Baby, Plus, X, AlertTriangle } from 'lucide-react';
import type { PregnancyRecord } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import {
  useCreateAncVisitMutation,
  useGetDoctorByUserQuery,
  useCreatePregnancyMutation,
  useListAncVisitsQuery,
  useListPatientsQuery,
  useListPregnanciesQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { eddFromLmp, evaluateRisks, formatGA, gestationalAge, trimester } from '@/lib/anc';

const today = () => new Date().toISOString().split('T')[0];

export function DoctorPregnancies({ session }: RoleViewProps) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [visitFor, setVisitFor] = useState<PregnancyRecord | null>(null);

  const { data: records = [] } = useListPregnanciesQuery();
  const { data: patients = [] } = useListPatientsQuery();
  // Fetched once for the whole list rather than per card.
  const { data: allVisits = [] } = useListAncVisitsQuery();
  const { data: doctor } = useGetDoctorByUserQuery(session.user.id);
  const doctorId = doctor?.id ?? '';

  const patientName = useMemo(
    () => new Map(patients.map((p) => [p.id, p.user?.name ?? p.id])),
    [patients],
  );

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Pregnancies"
      subtitle="Antenatal records for your maternity patients"
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-brand-teal text-white text-sm font-semibold px-4 py-2 shadow hover:opacity-95"
          >
            <Plus className="w-4 h-4" /> New pregnancy record
          </button>
        </div>

        {records.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Baby className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">No pregnancy records yet. Create one to start antenatal tracking.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {records.map((r) => {
              const ga = gestationalAge(r.lmp);
              const visits = allVisits.filter((v) => v.pregnancyId === r.id);
              const risks = evaluateRisks(r, visits[visits.length - 1]);
              return (
                <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{patientName.get(r.patientId) ?? r.patientId}</p>
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
                    <p>{visits.length} antenatal visit{visits.length === 1 ? '' : 's'}</p>
                  </div>
                  {risks.length > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {risks.length} flag{risks.length === 1 ? '' : 's'}
                    </div>
                  )}
                  <button
                    onClick={() => setVisitFor(r)}
                    className="mt-3 w-full text-sm font-medium text-cyan-700 border border-cyan-200 rounded-lg py-2 hover:bg-cyan-50"
                  >
                    + Add antenatal visit
                  </button>
                </div>
              );
            })}
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

  const [patientId, setPatientId] = useState('');
  const [lmp, setLmp] = useState('');
  const [gravida, setGravida] = useState(1);
  const [para, setPara] = useState(0);
  const [height, setHeight] = useState(0);
  const [weight, setWeight] = useState(0);
  const [bloodGroup, setBloodGroup] = useState('');
  const [riskFactors, setRiskFactors] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    if (!patientId) return setError('Select a patient');
    if (!lmp) return setError('Last menstrual period (LMP) is required');
    setError('');
    try {
      await createPregnancy({
        patientId,
        lmp,
        edd: eddFromLmp(lmp),
        gravida,
        para,
        height,
        prePregnancyWeight: weight,
        bloodGroup,
        riskFactors: riskFactors.split(',').map((s) => s.trim()).filter(Boolean),
        status: 'active',
        notes,
      }).unwrap();
      onSaved();
    } catch (err) {
      setError(apiError(err, 'Could not save the pregnancy record'));
    }
  };

  return (
    <Modal title="New pregnancy record" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Patient">
          <select value={patientId} onChange={(e) => { setPatientId(e.target.value); const p = patients.find((x) => x.id === e.target.value); if (p?.bloodGroup) setBloodGroup(p.bloodGroup); }} className={inputCls}>
            <option value="">Select patient…</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="LMP (last period)">
            <input type="date" value={lmp} max={today()} onChange={(e) => setLmp(e.target.value)} className={inputCls} />
          </Field>
          <Field label="EDD (auto)">
            <input value={lmp ? eddFromLmp(lmp) : ''} readOnly className={`${inputCls} bg-slate-50 text-slate-500`} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gravida"><input type="number" min={1} value={gravida} onChange={(e) => setGravida(+e.target.value)} className={inputCls} /></Field>
          <Field label="Para"><input type="number" min={0} value={para} onChange={(e) => setPara(+e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Height (cm)"><input type="number" value={height || ''} onChange={(e) => setHeight(+e.target.value)} className={inputCls} /></Field>
          <Field label="Weight (kg)"><input type="number" value={weight || ''} onChange={(e) => setWeight(+e.target.value)} className={inputCls} /></Field>
          <Field label="Blood group"><input value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Risk factors (comma-separated)">
          <input value={riskFactors} onChange={(e) => setRiskFactors(e.target.value)} placeholder="e.g. Previous C-section, Advanced maternal age" className={inputCls} />
        </Field>
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
          <button onClick={save} className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-brand-teal rounded-lg">Save record</button>
        </div>
      </div>
    </Modal>
  );
}

// --- New ANC visit modal -----------------------------------------------------
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
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState(0);
  const [systolic, setSystolic] = useState(0);
  const [diastolic, setDiastolic] = useState(0);
  const [fundalHeight, setFundalHeight] = useState(0);
  const [hemoglobin, setHemoglobin] = useState(0);
  const [fhr, setFhr] = useState(0);
  const [notes, setNotes] = useState('');

  const [error, setError] = useState('');
  const [createAncVisit] = useCreateAncVisitMutation();

  const weeks = gestationalAge(record.lmp, new Date(date + 'T00:00:00')).weeks;

  const save = async () => {
    setError('');
    try {
      await createAncVisit({
        pregnancyId: record.id,
        patientId: record.patientId,
        doctorId,
        date,
        weeks,
        weight,
        systolic,
        diastolic,
        fundalHeight,
        hemoglobin,
        fetalHeartRate: fhr,
        notes,
      }).unwrap();
      onSaved();
    } catch (err) {
      setError(apiError(err, 'Could not save the visit'));
    }
  };

  return (
    <Modal title={`Antenatal visit · week ${weeks}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Visit date">
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Weight (kg)"><input type="number" value={weight || ''} onChange={(e) => setWeight(+e.target.value)} className={inputCls} /></Field>
          <Field label="Systolic"><input type="number" value={systolic || ''} onChange={(e) => setSystolic(+e.target.value)} className={inputCls} /></Field>
          <Field label="Diastolic"><input type="number" value={diastolic || ''} onChange={(e) => setDiastolic(+e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Fundal ht. (cm)"><input type="number" value={fundalHeight || ''} onChange={(e) => setFundalHeight(+e.target.value)} className={inputCls} /></Field>
          <Field label="Hb (g/dL)"><input type="number" step="0.1" value={hemoglobin || ''} onChange={(e) => setHemoglobin(+e.target.value)} className={inputCls} /></Field>
          <Field label="FHR (bpm)"><input type="number" value={fhr || ''} onChange={(e) => setFhr(+e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
          <button onClick={save} className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-brand-teal rounded-lg">Save visit</button>
        </div>
      </div>
    </Modal>
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

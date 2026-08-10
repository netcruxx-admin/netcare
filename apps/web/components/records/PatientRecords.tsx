'use client';

import { Pill, Activity, FileText } from 'lucide-react';
import { fmtDate } from '@/lib/date';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { useGetPatientPrescriptionsQuery, useGetPatientVitalsQuery } from '@/store/api';

export function PatientRecords({ session }: RoleViewProps) {
  const patientId = session?.patient?.id ?? '';
  const { data: prescriptions = [] } = useGetPatientPrescriptionsQuery(patientId, { skip: !patientId });
  const { data: vitals = [] } = useGetPatientVitalsQuery(patientId, { skip: !patientId });

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Medical Records"
      subtitle="Your prescriptions and recorded vitals"
    >
      <div className="space-y-8">
        {/* Prescriptions */}
        <section>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900 mb-4">
            <Pill className="w-5 h-5 text-cyan-600" />
            Prescriptions ({prescriptions.length})
          </h3>
          {prescriptions.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-10 text-center text-slate-500">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              No prescriptions on record yet.
            </div>
          ) : (
            <div className="grid gap-4">
              {prescriptions.map((rx) => (
                <div key={rx.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-slate-900">{rx.medicineName}</h4>
                    <span className="text-xs text-slate-400">{fmtDate(rx.createdAt)}</span>
                  </div>
                  <div className="grid md:grid-cols-4 gap-4 text-sm">
                    <div><p className="text-slate-500">Dosage</p><p className="font-medium">{rx.dosage}</p></div>
                    <div><p className="text-slate-500">Frequency</p><p className="font-medium">{rx.frequency}</p></div>
                    <div><p className="text-slate-500">Duration</p><p className="font-medium">{rx.duration}</p></div>
                    <div><p className="text-slate-500">Instructions</p><p className="font-medium">{rx.instructions || '—'}</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Vitals */}
        <section>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900 mb-4">
            <Activity className="w-5 h-5 text-teal-600" />
            Vitals ({vitals.length})
          </h3>
          {vitals.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-10 text-center text-slate-500">
              <Activity className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              No vitals recorded yet.
            </div>
          ) : (
            <div className="grid gap-4">
              {vitals.map((v) => (
                <div key={v.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-slate-900">Vitals Record</h4>
                    <span className="text-xs text-slate-400">{fmtDate(v.createdAt)}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div><p className="text-slate-500">Temperature</p><p className="font-medium">{v.temperature}°C</p></div>
                    <div><p className="text-slate-500">Blood Pressure</p><p className="font-medium">{v.bloodPressure}</p></div>
                    <div><p className="text-slate-500">Heart Rate</p><p className="font-medium">{v.heartRate} bpm</p></div>
                    <div><p className="text-slate-500">Respiratory Rate</p><p className="font-medium">{v.respiratoryRate} /min</p></div>
                    <div><p className="text-slate-500">Weight</p><p className="font-medium">{v.weight} kg</p></div>
                    <div><p className="text-slate-500">Height</p><p className="font-medium">{v.height} cm</p></div>
                  </div>
                  {v.notes && (
                    <div className="mt-4 pt-4 border-t border-slate-100 text-sm">
                      <p className="text-slate-500 mb-1">Notes</p>
                      <p className="text-slate-700">{v.notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}

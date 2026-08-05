'use client';

import Link from 'next/link';
import { FileText, Calendar, FlaskConical, Pill, HeartPulse, ChevronRight } from 'lucide-react';
import {
  useGetPatientByUserQuery,
  useGetPatientMedicalRecordsQuery,
  useGetPatientPrescriptionsQuery,
  useListTestOrdersQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ORDER_STATUS_LABEL, ORDER_STATUS_STYLE } from '@/lib/lab';

export function PatientMedicalHistory({ session }: RoleViewProps) {
  const { data: patient } = useGetPatientByUserQuery(session.user.id);
  const patientId = patient?.id ?? '';

  const { data: records = [] } = useGetPatientMedicalRecordsQuery(patientId, { skip: !patientId });
  const { data: prescriptions = [] } = useGetPatientPrescriptionsQuery(patientId, { skip: !patientId });
  const { data: testOrders = [] } = useListTestOrdersQuery(
    { patientId },
    { skip: !patientId },
  );

  const sorted = {
    records: [...records].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    prescriptions: [...prescriptions].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    testOrders: [...testOrders].sort((a, b) => (a.orderedAt < b.orderedAt ? 1 : -1)),
  };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Medical History"
      subtitle="Your diagnoses, prescriptions and lab reports"
    >
      <div className="space-y-8">
        {/* Summary */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-cyan-50 rounded-lg p-4">
            <p className="text-slate-600 text-sm mb-2">Prescriptions</p>
            <p className="text-3xl font-bold text-cyan-600">{prescriptions.length}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-slate-600 text-sm mb-2">Lab Orders</p>
            <p className="text-3xl font-bold text-green-600">{testOrders.length}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <p className="text-slate-600 text-sm mb-2">Clinical Notes</p>
            <p className="text-3xl font-bold text-purple-600">{records.length}</p>
          </div>
        </div>

        {/* Prescriptions */}
        <Section
          title="Prescriptions"
          icon={<Pill className="w-5 h-5 text-cyan-600" />}
          empty={prescriptions.length === 0}
          emptyText="No prescriptions on record."
        >
          {sorted.prescriptions.map((rx) => (
            <div key={rx.id} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{rx.medicineName}</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {rx.dosage} · {rx.frequency} · {rx.duration}
                  </p>
                  {rx.instructions && (
                    <p className="text-sm text-slate-600 mt-1">{rx.instructions}</p>
                  )}
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {rx.createdAt.split('T')[0]}
                </span>
              </div>
            </div>
          ))}
        </Section>

        {/* Lab Orders */}
        <Section
          title="Lab & Test Orders"
          icon={<FlaskConical className="w-5 h-5 text-green-600" />}
          empty={testOrders.length === 0}
          emptyText="No lab tests ordered yet."
          action={
            testOrders.length > 0 ? (
              <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 font-medium">
                View full reports <ChevronRight className="w-4 h-4" />
              </Link>
            ) : undefined
          }
        >
          {sorted.testOrders.map((order) => (
            <div key={order.id} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex flex-wrap gap-2">
                  {order.items.map((item) => (
                    <span key={item.testId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-sm">
                      <FlaskConical className="w-3 h-3 text-cyan-600" /> {item.name}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ORDER_STATUS_STYLE[order.status]}`}>
                    {ORDER_STATUS_LABEL[order.status]}
                  </span>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {order.orderedAt.split('T')[0]}
                  </span>
                </div>
              </div>
              {(order.status === 'completed' || order.status === 'reviewed') && (
                <div className="mt-2">
                  <Link href={`/report/${order.id}`} className="text-sm text-cyan-600 hover:text-cyan-700 font-medium">
                    View report →
                  </Link>
                </div>
              )}
            </div>
          ))}
        </Section>

        {/* Clinical Notes (MedicalRecord) */}
        <Section
          title="Clinical Notes"
          icon={<HeartPulse className="w-5 h-5 text-purple-600" />}
          empty={records.length === 0}
          emptyText="No clinical notes yet. These are added by your doctor after a visit."
        >
          {sorted.records.map((record) => (
            <div key={record.id} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                <Calendar className="w-3.5 h-3.5" /> {record.createdAt.split('T')[0]}
              </div>
              {record.diagnosis?.trim() && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Diagnosis</p>
                  <p className="text-slate-800 text-sm">{record.diagnosis}</p>
                </div>
              )}
              {record.prescription?.trim() && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Prescription Notes</p>
                  <p className="text-slate-700 text-sm whitespace-pre-line">{record.prescription}</p>
                </div>
              )}
              {record.labReports && record.labReports.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Lab Reports</p>
                  <div className="flex flex-wrap gap-2">
                    {record.labReports.map((lr, i) => (
                      <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs">
                        {lr}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </Section>
      </div>
    </DashboardShell>
  );
}

function Section({
  title,
  icon,
  empty,
  emptyText,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  empty: boolean;
  emptyText: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          {icon} {title}
        </h2>
        {action}
      </div>
      {empty ? (
        <div className="text-center py-10">
          <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-500">{emptyText}</p>
        </div>
      ) : (
        <div className="p-4 space-y-3">{children}</div>
      )}
    </div>
  );
}

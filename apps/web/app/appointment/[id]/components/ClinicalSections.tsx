'use client';

import { FileText, FlaskConical, Pill } from 'lucide-react';

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  ordered:          { label: 'Ordered',          cls: 'bg-blue-100 text-blue-700' },
  sample_collected: { label: 'Sample Collected',  cls: 'bg-amber-100 text-amber-700' },
  in_progress:      { label: 'In Progress',       cls: 'bg-amber-100 text-amber-700' },
  completed:        { label: 'Completed',         cls: 'bg-green-100 text-green-700' },
  reviewed:         { label: 'Reviewed',          cls: 'bg-green-100 text-green-700' },
};

const RESULT_FLAG: Record<string, string> = {
  normal:   'text-slate-700',
  low:      'text-amber-600',
  high:     'text-amber-600',
  critical: 'text-red-600 font-semibold',
};

function SectionHeader({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-5 h-5 text-slate-500" />
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <span className="text-xs text-slate-400 font-normal">({count})</span>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            {head.map((h) => (
              <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">{children}</tbody>
      </table>
    </div>
  );
}

export function ClinicalSections({
  prescriptions,
  vitals,
  medicalRecords,
  testOrders = [],
}: {
  prescriptions: any[];
  vitals: any[];
  medicalRecords: any[];
  testOrders?: any[];
}) {
  return (
    <>
      {testOrders.length > 0 && (
        <div className="mb-8">
          <SectionHeader icon={FlaskConical} title="Lab / Test Orders" count={testOrders.length} />
          <div className="space-y-3">
            {testOrders.map((order) => {
              const status = ORDER_STATUS[order.status] ?? { label: order.status, cls: 'bg-slate-100 text-slate-700' };
              return (
                <div key={order.id} className="rounded-lg border border-slate-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex flex-wrap gap-2">
                      {order.items?.map((item: any) => (
                        <span key={item.testId} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-cyan-50 text-cyan-800 border border-cyan-100">
                          {item.name}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      {order.priority === 'urgent' && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Urgent</span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status.cls}`}>{status.label}</span>
                    </div>
                  </div>
                  {order.clinicalNote && (
                    <p className="mt-2 text-sm text-slate-600">{order.clinicalNote}</p>
                  )}
                  {order.results?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                      {order.results.map((result: any) => (
                        <div key={result.id}>
                          <p className="text-sm font-semibold text-slate-900 mb-1">{result.testName}</p>
                          <ul className="space-y-1">
                            {result.parameters?.map((p: any, idx: number) => (
                              <li key={idx} className="text-sm flex flex-wrap gap-x-2">
                                <span className="text-slate-600">{p.name}:</span>
                                <span className={RESULT_FLAG[p.flag] ?? 'text-slate-700'}>{p.value} {p.unit}</span>
                                <span className="text-slate-400">(ref {p.referenceRange})</span>
                              </li>
                            ))}
                          </ul>
                          {result.remarks && <p className="text-sm text-slate-600 mt-1">{result.remarks}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {prescriptions.length > 0 && (
        <div className="mb-8">
          <SectionHeader icon={Pill} title="Prescriptions" count={prescriptions.length} />
          <Table head={['Medicine', 'Dosage', 'Frequency', 'Duration', 'Instructions']}>
            {prescriptions.map((rx) => (
              <tr key={rx.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-3 px-4 font-medium text-slate-900">{rx.medicineName}</td>
                <td className="py-3 px-4 text-slate-600">{rx.dosage || '—'}</td>
                <td className="py-3 px-4 text-slate-600">{rx.frequency || '—'}</td>
                <td className="py-3 px-4 text-slate-600">{rx.duration || '—'}</td>
                <td className="py-3 px-4 text-slate-500">{rx.instructions || '—'}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {vitals.length > 0 && (
        <div className="mb-8">
          <SectionHeader icon={FileText} title="Vitals" count={vitals.length} />
          <Table head={['Temp', 'Blood Pressure', 'Heart Rate', 'Resp. Rate', 'Weight', 'Height', 'Notes']}>
            {vitals.map((v) => (
              <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-3 px-4 text-slate-600">{v.temperature ? `${v.temperature}°C` : '—'}</td>
                <td className="py-3 px-4 text-slate-600">{v.bloodPressure || '—'}</td>
                <td className="py-3 px-4 text-slate-600">{v.heartRate ? `${v.heartRate} bpm` : '—'}</td>
                <td className="py-3 px-4 text-slate-600">{v.respiratoryRate ? `${v.respiratoryRate}/min` : '—'}</td>
                <td className="py-3 px-4 text-slate-600">{v.weight ? `${v.weight} kg` : '—'}</td>
                <td className="py-3 px-4 text-slate-600">{v.height ? `${v.height} cm` : '—'}</td>
                <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{v.notes || '—'}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {medicalRecords.length > 0 && (
        <div>
          <SectionHeader icon={FileText} title="Medical Records" count={medicalRecords.length} />
          <Table head={['Diagnosis', 'Prescription', 'Lab Reports']}>
            {medicalRecords.map((record) => (
              <tr key={record.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-3 px-4 font-medium text-slate-900">{record.diagnosis}</td>
                <td className="py-3 px-4 text-slate-600">{record.prescription || '—'}</td>
                <td className="py-3 px-4 text-slate-500">
                  {record.labReports?.length > 0 ? record.labReports.join(', ') : '—'}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </>
  );
}

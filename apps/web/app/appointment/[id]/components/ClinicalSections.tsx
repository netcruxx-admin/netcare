'use client';

import { FileText, FlaskConical } from 'lucide-react';

// Maps a test-order status to a badge style + label.
const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  ordered: { label: 'Ordered', cls: 'bg-blue-100 text-blue-700' },
  sample_collected: { label: 'Sample Collected', cls: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  reviewed: { label: 'Reviewed', cls: 'bg-green-100 text-green-700' },
};

const RESULT_FLAG: Record<string, string> = {
  normal: 'text-slate-700',
  low: 'text-amber-600',
  high: 'text-amber-600',
  critical: 'text-red-600 font-semibold',
};

// Read-only clinical history for the visit: prescriptions, vitals, records and
// lab/test orders. Each list renders only when it has rows.
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
  const card = 'bg-white rounded-lg p-6 shadow-sm border border-slate-100';

  return (
    <>
      {testOrders.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <FlaskConical className="w-5 h-5" />
            Lab / Test Orders
          </h2>
          <div className="grid gap-4">
            {testOrders.map((order) => {
              const status = ORDER_STATUS[order.status] ?? { label: order.status, cls: 'bg-slate-100 text-slate-700' };
              return (
                <div key={order.id} className={card}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex flex-wrap gap-2">
                      {order.items?.map((item: any) => (
                        <span key={item.testId} className="inline-flex items-center px-2.5 py-1 rounded-full text-sm bg-cyan-50 text-cyan-800 border border-cyan-100">
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
                    <div className="mt-3">
                      <p className="text-sm text-slate-600">Clinical Note</p>
                      <p className="text-slate-700">{order.clinicalNote}</p>
                    </div>
                  )}

                  {order.results?.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                      {order.results.map((result: any) => (
                        <div key={result.id}>
                          <p className="text-sm font-semibold text-slate-900 mb-1">{result.testName}</p>
                          <ul className="space-y-1">
                            {result.parameters?.map((p: any, idx: number) => (
                              <li key={idx} className="text-sm flex flex-wrap gap-x-2">
                                <span className="text-slate-600">{p.name}:</span>
                                <span className={RESULT_FLAG[p.flag] ?? 'text-slate-700'}>
                                  {p.value} {p.unit}
                                </span>
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
          <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Prescriptions
          </h2>
          <div className="grid gap-4">
            {prescriptions.map((prescription) => (
              <div key={prescription.id} className={card}>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-600">Medicine Name</p>
                    <p className="font-semibold text-slate-900">{prescription.medicineName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Dosage</p>
                    <p className="font-semibold text-slate-900">{prescription.dosage}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Frequency</p>
                    <p className="font-semibold text-slate-900">{prescription.frequency}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Duration</p>
                    <p className="font-semibold text-slate-900">{prescription.duration}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-slate-600">Instructions</p>
                    <p className="font-semibold text-slate-900">{prescription.instructions}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {vitals.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Vitals</h2>
          <div className="grid gap-4">
            {vitals.map((vital) => (
              <div key={vital.id} className={card}>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-slate-600">Temperature</p>
                    <p className="font-semibold text-slate-900">{vital.temperature}°C</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Blood Pressure</p>
                    <p className="font-semibold text-slate-900">{vital.bloodPressure}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Heart Rate</p>
                    <p className="font-semibold text-slate-900">{vital.heartRate} bpm</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Respiratory Rate</p>
                    <p className="font-semibold text-slate-900">{vital.respiratoryRate} breaths/min</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Weight</p>
                    <p className="font-semibold text-slate-900">{vital.weight} kg</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Height</p>
                    <p className="font-semibold text-slate-900">{vital.height} cm</p>
                  </div>
                </div>
                {vital.notes && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <p className="text-sm text-slate-600 mb-2">Notes</p>
                    <p className="text-slate-700">{vital.notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {medicalRecords.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Medical Records</h2>
          <div className="grid gap-4">
            {medicalRecords.map((record) => (
              <div key={record.id} className={card}>
                <div>
                  <p className="text-sm text-slate-600">Diagnosis</p>
                  <p className="font-semibold text-slate-900 mb-4">{record.diagnosis}</p>
                </div>
                {record.prescription && (
                  <div>
                    <p className="text-sm text-slate-600">Prescription</p>
                    <p className="font-semibold text-slate-900 mb-4">{record.prescription}</p>
                  </div>
                )}
                {record.labReports && record.labReports.length > 0 && (
                  <div>
                    <p className="text-sm text-slate-600 mb-2">Lab Reports</p>
                    <ul className="space-y-1">
                      {record.labReports.map((report: string, idx: number) => (
                        <li key={idx} className="text-slate-700 text-sm">• {report}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import { useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Printer, AlertTriangle } from 'lucide-react';
import Image from 'next/image';
import { useDashboardGuard } from '@/hooks/useDashboardGuard';
import {
  useGetDoctorQuery,
  useGetPatientQuery,
  useGetTestOrderQuery,
  useListTestResultsQuery,
} from '@/store/api';
import { ORDER_STATUS_LABEL, FLAG_STYLE, FLAG_LABEL, isAbnormal } from '@/lib/lab';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import { fmtDate } from '@/lib/date';
import { Spinner } from '@/components/ui/spinner';

export default function LabReportPage() {
  const router = useRouter();
  const hospital = useActiveHospital();
  const params = useParams();
  const orderId = params.id as string;

  // The API returns 404 for an order the caller isn't entitled to, so there is
  // no separate access check here.
  const session = useDashboardGuard();
  const { data: order, isLoading, isError } = useGetTestOrderQuery(orderId, {
    skip: !orderId || !session,
  });
  const { data: results = [] } = useListTestResultsQuery({ orderId }, { skip: !order });
  const { data: patient } = useGetPatientQuery(order?.patientId ?? '', { skip: !order });
  const { data: doctor } = useGetDoctorQuery(order?.doctorId ?? '', { skip: !order });

  const patientUser = patient?.user ?? null;
  const doctorUser = doctor?.user ?? null;

  const anyAbnormal = useMemo(
    () => results.some((r) => r.parameters.some((p) => isAbnormal(p.flag))),
    [results],
  );

  if (!session) return null;

  if (isLoading) {
    return (
      <Spinner variant="page" label="Loading report…" />
    );
  }

  if (!order || isError) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-4">
        <p className="text-slate-600">Report not found.</p>
        <button onClick={() => router.back()} className="text-cyan-600 font-semibold">Go back</button>
      </div>
    );
  }

  const reportedAt = results[0]?.reportedAt ? fmtDate(results[0].reportedAt) : '—';
  const reportedBy = results[0]?.reportedBy ?? '—';

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:py-0">
      {/* Toolbar (hidden when printing) */}
      <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-semibold hover:shadow-lg transition">
          <Printer className="w-4 h-4" /> Print / Save PDF
        </button>
      </div>

      {/* Report sheet */}
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow print:shadow-none print:rounded-none">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b-2 border-cyan-600">
          <div className="flex items-center gap-3">
            <Image src="/logo/logo-full.png" alt={hospital.name} width={80} height={80} className="w-20 h-20 object-contain" />
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">LAB REPORT</p>
            <p className="text-xs text-slate-500 font-mono">{order.id}</p>
          </div>
        </div>

        {/* Patient / meta */}
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 px-8 py-5 border-b text-sm">
          <Field label="Patient" value={patientUser?.name ?? '—'} />
          <Field label="Referred by" value={doctorUser ? `Dr. ${doctorUser.name}` : '—'} />
          <Field label="Gender / DOB" value={`${patient?.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : '—'} · ${fmtDate(patient?.dateOfBirth)}`} />
          <Field label="Ordered on" value={fmtDate(order.orderedAt)} />
          <Field label="Phone" value={patient?.phone || '—'} />
          <Field label="Status" value={ORDER_STATUS_LABEL[order.status]} />
          {order.clinicalNote && (
            <div className="sm:col-span-2">
              <Field label="Clinical note" value={order.clinicalNote} />
            </div>
          )}
        </div>

        {anyAbnormal && (
          <div className="mx-8 mt-5 flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-700 text-sm print:hidden">
            <AlertTriangle className="w-4 h-4 shrink-0" /> This report contains one or more results outside the reference range.
          </div>
        )}

        {/* Results */}
        <div className="px-8 py-6 space-y-6">
          {results.length === 0 ? (
            <p className="text-center text-slate-500 py-8">Results are not yet available for this order.</p>
          ) : (
            results.map((res) => (
              <div key={res.id}>
                <h3 className="font-bold text-slate-900 mb-2">{res.testName}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600">
                        <th className="text-left py-2 px-3 font-semibold border-b border-slate-200">Parameter</th>
                        <th className="text-left py-2 px-3 font-semibold border-b border-slate-200">Result</th>
                        <th className="text-left py-2 px-3 font-semibold border-b border-slate-200">Unit</th>
                        <th className="text-left py-2 px-3 font-semibold border-b border-slate-200">Reference Range</th>
                        <th className="text-left py-2 px-3 font-semibold border-b border-slate-200">Flag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {res.parameters.map((p, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 px-3 text-slate-800">{p.name}</td>
                          <td className={`py-2 px-3 font-semibold ${isAbnormal(p.flag) ? 'text-red-600' : 'text-slate-900'}`}>{p.value || '—'}</td>
                          <td className="py-2 px-3 text-slate-500">{p.unit || '—'}</td>
                          <td className="py-2 px-3 text-slate-500">{p.referenceRange || '—'}</td>
                          <td className="py-2 px-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${FLAG_STYLE[p.flag]}`}>{FLAG_LABEL[p.flag]}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {res.remarks && <p className="text-sm text-slate-600 mt-2"><span className="font-semibold">Remarks:</span> {res.remarks}</p>}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t flex flex-wrap items-end justify-between gap-4 text-sm">
          <div>
            <p className="text-slate-500 text-xs">Reported by</p>
            <p className="font-semibold text-slate-900">{reportedBy}</p>
            <p className="text-slate-500 text-xs">{reportedAt}</p>
          </div>
          <p className="text-xs text-slate-400 max-w-xs text-right">
            This is an electronically generated report. Values should be interpreted in clinical context by your physician.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-500 text-xs">{label}</span>
      <p className="font-medium text-slate-900">{value}</p>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Download, Calendar } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { dbOperations } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';

export default function MedicalHistoryPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    const session = authStorage.getSession();
    if (!session || session.user.role !== 'patient') {
      router.push('/login');
    } else {
      setSession(session);
      const patientId = dbOperations.getPatientByUserId(session.user.id)?.id;
      if (patientId) {
        const medicalRecords = dbOperations.getMedicalRecordsByPatientId(patientId);
        setRecords(medicalRecords);
      }
    }
  }, [router]);

  if (!session) {
    return null;
  }

  return (
    <DashboardShell
      role="patient"
      userName={session.user.name}
      title="Medical History"
      subtitle="Your diagnoses, prescriptions and lab reports"
    >
      <div className="space-y-8">
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-cyan-50 rounded-lg p-4">
              <p className="text-slate-600 text-sm mb-2">Prescriptions</p>
              <p className="text-3xl font-bold text-cyan-600">0</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-slate-600 text-sm mb-2">Lab Reports</p>
              <p className="text-3xl font-bold text-green-600">0</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="text-slate-600 text-sm mb-2">Diagnoses</p>
              <p className="text-3xl font-bold text-purple-600">0</p>
            </div>
          </div>

          {records.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 mb-6">No medical records found</p>
              <p className="text-slate-500 text-sm">
                Your medical records will appear here after your appointments
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Recent Records</h2>
              {records.map((record) => (
                <div key={record.id} className="border border-slate-200 rounded-lg p-4 hover:shadow-lg transition">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <FileText className="w-10 h-10 text-cyan-600 flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-semibold text-slate-900">Doctor Notes</h3>
                        <div className="flex items-center gap-2 text-slate-600 text-sm mt-2">
                          <Calendar className="w-4 h-4" />
                          <span>{record.createdAt}</span>
                        </div>
                        <p className="text-slate-700 mt-3">{record.diagnosis}</p>
                      </div>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 text-cyan-600 hover:bg-cyan-50 rounded-lg transition">
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

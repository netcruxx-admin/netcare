'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Stethoscope, Search } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { DashboardShell } from '@/components/DashboardShell';
import { ExportButton } from '@/components/ExportButton';
import { useListDoctorsQuery, useListDepartmentsQuery } from '@/store/api';

export default function AdminDoctorsPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [query, setQuery] = useState('');
  const [specFilter, setSpecFilter] = useState('all');

  useEffect(() => {
    const s = authStorage.getSession();
    if (!s || s.user.role !== 'admin') {
      router.push('/login');
    } else {
      setSession(s);
    }
  }, [router]);

  const { data: doctors = [] } = useListDoctorsQuery();
  const { data: departments = [] } = useListDepartmentsQuery();

  const specializations = useMemo(
    () => [...new Set(doctors.map((d) => d.specialization).filter(Boolean))].sort(),
    [doctors],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return doctors
      .filter((d) => specFilter === 'all' || d.specialization === specFilter)
      .filter((d) => {
        if (!q) return true;
        return (
          (d.user?.name ?? '').toLowerCase().includes(q) ||
          (d.user?.email ?? '').toLowerCase().includes(q) ||
          d.specialization.toLowerCase().includes(q) ||
          d.qualification.toLowerCase().includes(q)
        );
      });
  }, [doctors, query, specFilter]);

  if (!session) return null;

  return (
    <DashboardShell
      role="admin"
      userName={session.user.name}
      title="Doctors"
      subtitle="Manage doctor profiles"
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, specialization…"
            className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <select
          value={specFilter}
          onChange={(e) => setSpecFilter(e.target.value)}
          className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="all">All Specializations</option>
          {specializations.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <ExportButton
          filename="doctors"
          headers={['Name', 'Email', 'Specialization', 'Qualification', 'Experience (yrs)', 'Fee', 'Status']}
          rows={filtered.map((d) => [
            d.user?.name ?? '—',
            d.user?.email ?? '—',
            d.specialization,
            d.qualification,
            d.experienceYears,
            d.consultationFee,
            d.verificationStatus ?? 'verified',
          ])}
        />
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-slate-900">Doctors ({filtered.length})</h3>
        </div>

        {doctors.length === 0 ? (
          <div className="text-center py-16">
            <Stethoscope className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">No doctors found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Name</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Email</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Specialization</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Qualification</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Experience</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Fee</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doctor) => (
                  <tr key={doctor.id} className="border-b hover:bg-slate-50">
                    <td className="py-3 px-6 font-medium text-slate-900">{doctor.user?.name ?? '—'}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{doctor.user?.email ?? '—'}</td>
                    <td className="py-3 px-6 font-medium">{doctor.specialization || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{doctor.qualification || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{doctor.experienceYears} yrs</td>
                    <td className="py-3 px-6 text-slate-600">₹{doctor.consultationFee}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        doctor.verificationStatus === 'verified'
                          ? 'bg-green-100 text-green-700'
                          : doctor.verificationStatus === 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {doctor.verificationStatus ?? 'verified'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {departments.length === 0 && (
        <p className="text-xs text-slate-400 mt-2">Departments loaded: {departments.length}</p>
      )}
    </DashboardShell>
  );
}

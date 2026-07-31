'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FlaskConical } from 'lucide-react';
import { dbOperations, LabTest } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';

export function LabCatalog({ session }: RoleViewProps) {
  const router = useRouter();
  const [tests, setTests] = useState<LabTest[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setTests(dbOperations.getAllLabTests());
  }, [session]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tests.filter((t) => !q || t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  }, [tests, query]);

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Test Catalog" subtitle="Available tests and result templates">
      <div className="space-y-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search test or category…"
            className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Tests ({rows.length})</h3>
          </div>
          {rows.length === 0 ? (
            <div className="text-center py-16">
              <FlaskConical className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No tests found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Test</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Category</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Sample</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Parameters</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">TAT</th>
                    <th className="text-right py-3 px-6 font-semibold text-slate-900">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-6 font-medium text-slate-900">{t.name}</td>
                      <td className="py-3 px-6 text-slate-600">{t.category}</td>
                      <td className="py-3 px-6 text-slate-600">{t.sampleType}</td>
                      <td className="py-3 px-6 text-slate-600">{t.parameters?.length ?? 1}</td>
                      <td className="py-3 px-6 text-slate-600">{t.turnaroundTime}</td>
                      <td className="py-3 px-6 text-right text-slate-600">₹{t.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

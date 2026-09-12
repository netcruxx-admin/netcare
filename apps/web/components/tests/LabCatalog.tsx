'use client';

import { useState } from 'react';
import { Search, FlaskConical, Eye } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { ActionIcon } from '@/components/ActionIcon';
import { RecordDialog } from '@/components/RecordDialog';
import { useListLabTestsPagedQuery } from '@/store/api';
import type { RoleViewProps } from '@/components/RoleView';
import type { LabTest } from '@/lib/types';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export function LabCatalog({ session }: RoleViewProps) {
  const [viewing, setViewing] = useState<LabTest | null>(null);
  const table = useServerTable();
  const { data: testPage, isLoading } = useListLabTestsPagedQuery({
    q: table.q.trim() || undefined,
    limit: table.limit,
    offset: table.offset,
  });
  const rows = testPage?.items ?? [];
  const totalTests = testPage?.total ?? 0;

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Test Catalog" subtitle="Available tests and result templates">
      <div className="space-y-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={table.search}
            onChange={(e) => table.setSearch(e.target.value)}
            placeholder="Search test or category…"
            className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Tests ({totalTests})</h3>
          </div>

          {isLoading ? (
            <Spinner variant="block" />
          ) : rows.length === 0 ? (
            <div className="text-center py-16">
              <FlaskConical className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No tests found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-slate-50">
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Test</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Category</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Sample</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Parameters</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">TAT</TableHead>
                    <TableHead className="text-right py-3 px-6 font-semibold text-slate-900">Price</TableHead>
                    <TableHead className="text-right py-3 px-6 font-semibold text-slate-900">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id} className="border-b hover:bg-slate-50">
                      <TableCell className="py-3 px-6 font-medium text-slate-900 whitespace-normal">{t.name}</TableCell>
                      <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{t.category}</TableCell>
                      <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{t.sampleType}</TableCell>
                      <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{t.parameters?.length ?? 1}</TableCell>
                      <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{t.turnaroundTime}</TableCell>
                      <TableCell className="py-3 px-6 text-right text-slate-600 whitespace-normal">₹{t.price}</TableCell>
                      <TableCell className="py-3 px-6 text-right whitespace-normal">
                        <ActionIcon icon={Eye} label="View" onClick={() => setViewing(t)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                page={table.page}
                pageSize={table.pageSize}
                total={totalTests}
                onPageChange={table.setPage}
              />
            </div>
          )}
        </div>
      </div>
      <RecordDialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ''}
        subtitle={viewing?.category}
        fields={[
          { label: 'Category', value: viewing?.category },
          { label: 'Sample type', value: viewing?.sampleType },
          { label: 'Turnaround', value: viewing?.turnaroundTime },
          { label: 'Price', value: viewing ? `₹${viewing.price}` : '' },
          {
            label: 'Parameters',
            wide: true,
            // The table can only show how many; the names are what tells a
            // technician whether this is the panel they were asked for.
            value: viewing?.parameters?.length
              ? viewing.parameters
                  .map((param) => [param.name, param.unit].filter(Boolean).join(' '))
                  .join(', ')
              : '',
          },
        ]}
      />
    </DashboardShell>
  );
}

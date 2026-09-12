'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Building2, Plus, Ban, RotateCcw, Pencil, Eye, IndianRupee, X } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { OnboardHospitalWizard } from '@/components/hospitals/OnboardHospitalWizard';
import { EditHospitalWizard } from '@/components/hospitals/EditHospitalWizard';
import { ActionIcon } from '@/components/ActionIcon';
import { ConsultationFeesContent } from '@/components/billing/ConsultationFeesContent';
import { RecordDialog } from '@/components/RecordDialog';
import { apiError } from '@/lib/apiError';
import { hasPermission } from '@/lib/auth';
import { fmtDate } from '@/lib/date';
import { useListHospitalsQuery, useUpdateHospitalMutation } from '@/store/api';
import type { HospitalInfo } from '@/store/api';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export function PlatformHospitals({ session }: RoleViewProps) {
  const searchParams = useSearchParams();
  const selectedHospitalId = searchParams.get('h') ?? '';

  const [onboardOpen, setOnboardOpen] = useState(false);
  const [editing, setEditing] = useState<HospitalInfo | null>(null);
  const [toggling, setToggling] = useState<HospitalInfo | null>(null);
  const [viewing, setViewing] = useState<HospitalInfo | null>(null);
  // Whose price list is open. A superadmin has no home tenant, so the hospital
  // being priced has to be named explicitly rather than inferred from a token.
  const [pricing, setPricing] = useState<HospitalInfo | null>(null);

  const { data: allHospitals = [], isLoading, refetch } = useListHospitalsQuery();
  const [updateHospital] = useUpdateHospitalMutation();

  const hospitals = selectedHospitalId
    ? allHospitals.filter((h) => h.id === selectedHospitalId)
    : allHospitals;

  const canManage = hasPermission(session, 'hospitals.manage');
  // Held by the platform *and* by every hospital admin — what to charge is the
  // hospital's decision, and this screen is only where the platform makes it on
  // their behalf (a trial being set up, a hospital that asked us to).
  const canManageFees = hasPermission(session, 'fees.manage');

  const confirmToggle = async () => {
    if (!toggling) return;
    const newStatus = toggling.status === 'active' ? 'suspended' : 'active';
    try {
      await updateHospital({ id: toggling.id, body: { status: newStatus } }).unwrap();
      refetch();
      setToggling(null);
      toast.success(newStatus === 'suspended' ? `${toggling.name} suspended` : `${toggling.name} reactivated`);
    } catch (err) {
      toast.error(apiError(err, 'Failed to update hospital status'));
      setToggling(null);
    }
  };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Hospitals"
      subtitle={selectedHospitalId ? 'Showing 1 hospital' : 'All tenants on the NetCare platform'}
    >
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {hospitals.length} hospital{hospitals.length !== 1 ? 's' : ''}
            {selectedHospitalId && <span className="text-slate-400"> (filtered)</span>}
          </p>
          {canManage && (
            <Button
              onClick={() => setOnboardOpen(true)}
              variant="brand"
              size="sm"
            >
              <Plus className="w-4 h-4" /> Onboard Hospital
            </Button>
          )}
        </div>

        {isLoading ? (
          <Spinner variant="block" />
        ) : hospitals.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No hospitals found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-b border-slate-100">
                  {['Name', 'Subdomain', 'Category', 'Theme', 'Status', 'Created'].map((h) => (
                    <TableHead key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</TableHead>
                  ))}
                  <TableHead className="text-right py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hospitals.map((h) => (
                  <TableRow key={h.id} className={`border-b border-slate-50 transition ${h.status === 'suspended' ? 'bg-slate-50/60 opacity-70' : 'hover:bg-slate-50'}`}>
                    <TableCell className="py-3 px-6 font-medium text-slate-900 whitespace-normal">{h.name}</TableCell>
                    <TableCell className="py-3 px-6 font-mono text-sm text-slate-600 whitespace-normal">{h.subdomain}</TableCell>
                    <TableCell className="py-3 px-6 text-slate-600 capitalize whitespace-normal">{h.category.replace('-', ' ')}</TableCell>
                    <TableCell className="py-3 px-6 whitespace-normal">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full border border-slate-200 inline-block" style={{ background: (h.theme as Record<string, string>)?.primary ?? '#888' }} />
                        <span className="w-5 h-5 rounded-full border border-slate-200 inline-block" style={{ background: (h.theme as Record<string, string>)?.primaryDark ?? '#555' }} />
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-6 whitespace-normal">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${h.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {h.status}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-6 text-slate-500 text-sm whitespace-normal">{fmtDate(h.createdAt)}</TableCell>
                    <TableCell className="py-3 px-6 text-right whitespace-normal">
                      <div className="flex items-center justify-end gap-1">
                        <ActionIcon icon={Eye} label="View" onClick={() => setViewing(h)} />
                        {canManageFees && (
                          <ActionIcon icon={IndianRupee} label="Consultation fees" onClick={() => setPricing(h)} />
                        )}
                        {canManage && (
                          <>
                            <ActionIcon icon={Pencil} label="Edit" onClick={() => setEditing(h)} />
                            {h.status === 'active'
                              ? <ActionIcon icon={Ban} label="Suspend" tone="danger" onClick={() => setToggling(h)} />
                              : <ActionIcon icon={RotateCcw} label="Reactivate" tone="success" onClick={() => setToggling(h)} />
                            }
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Onboard wizard */}
      <OnboardHospitalWizard
        open={onboardOpen}
        onClose={() => setOnboardOpen(false)}
        onCreated={refetch}
      />

      {/* Edit wizard */}
      {editing && (
        <EditHospitalWizard
          open={true}
          hospital={editing}
          onClose={() => setEditing(null)}
          onUpdated={refetch}
        />
      )}

      {/* Consultation fee schedule for one hospital */}
      {pricing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-50 rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-start px-6 py-4 border-b border-slate-200 bg-white rounded-t-xl">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Consultation Fees</h3>
                <p className="text-sm text-slate-500">{pricing.name}</p>
              </div>
              <button onClick={() => setPricing(null)} className="text-slate-400 hover:text-slate-900 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <ConsultationFeesContent hospitalId={pricing.id} />
            </div>
          </div>
        </div>
      )}

      {/* Suspend / Reactivate confirmation */}
      {toggling && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${toggling.status === 'active' ? 'bg-amber-100' : 'bg-green-100'}`}>
                {toggling.status === 'active'
                  ? <Ban className="w-6 h-6 text-amber-600" />
                  : <RotateCcw className="w-6 h-6 text-green-600" />
                }
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">
                  {toggling.status === 'active' ? 'Suspend Hospital' : 'Reactivate Hospital'}
                </h3>
                <p className="text-slate-600 mt-1 text-sm">
                  {toggling.status === 'active'
                    ? <>Suspending <span className="font-semibold text-slate-900">{toggling.name}</span> will block all logins for its users. All data is retained and the hospital can be reactivated at any time.</>
                    : <>Reactivating <span className="font-semibold text-slate-900">{toggling.name}</span> will restore access for all its users.</>
                  }
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setToggling(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                Cancel
              </button>
              <button
                onClick={confirmToggle}
                className={`flex-1 px-4 py-2 rounded font-semibold transition text-white ${toggling.status === 'active' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {toggling.status === 'active' ? 'Suspend' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
      <RecordDialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ''}
        subtitle={viewing?.subdomain}
        fields={[
          { label: 'Subdomain', value: viewing?.subdomain },
          { label: 'Category', value: viewing?.category?.replace('-', ' ') },
          { label: 'Status', value: viewing?.status },
          { label: 'Onboarding', value: viewing?.onboardingStatus },
          { label: 'Legal name', value: viewing?.legalName },
          { label: 'Entity type', value: viewing?.entityType },
          { label: 'Registration no.', value: viewing?.registrationNo },
          { label: 'PAN', value: viewing?.pan },
          { label: 'GSTIN', value: viewing?.gstin },
          { label: 'HFR ID', value: viewing?.hfrId },
          { label: 'NABH', value: viewing?.nabhStatus },
          { label: 'Created', value: viewing?.createdAt ? fmtDate(viewing.createdAt) : '' },
          {
            label: 'Modules',
            wide: true,
            value: Object.entries(viewing?.modules ?? {})
              .filter(([, on]) => on)
              .map(([name]) => name)
              .join(', '),
          },
        ]}
      />
    </DashboardShell>
  );
}

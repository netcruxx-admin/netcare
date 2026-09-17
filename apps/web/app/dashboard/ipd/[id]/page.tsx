'use client';

import { useParams } from 'next/navigation';
import { useDashboardGuard } from '@/hooks/useDashboardGuard';
import { AdmissionWorkspace } from '@/components/admissions/AdmissionWorkspace';

export default function AdmissionWorkspacePage() {
  const params = useParams();
  const admissionId = params.id as string;
  // Not a lib/roles.ts route — access is judged against the record itself
  // (see the comment on alwaysAllowedPathPrefixes), so this calls the guard
  // path-less rather than passing a table path that doesn't exist.
  const session = useDashboardGuard();
  if (!session) return null;
  return <AdmissionWorkspace session={session} admissionId={admissionId} />;
}

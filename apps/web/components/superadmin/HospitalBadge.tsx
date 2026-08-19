'use client';

import type { HospitalInfo } from '@/store/api';

interface Props {
  hospitalId: string | undefined;
  hospitals: HospitalInfo[];
}

export function HospitalBadge({ hospitalId, hospitals }: Props) {
  const hospital = hospitals.find((h) => h.id === hospitalId);
  if (!hospital) return <span className="text-slate-400 text-xs">—</span>;

  const primary = (hospital.theme as Record<string, string>)?.primary ?? '#64748b';

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white whitespace-nowrap"
      style={{ backgroundColor: primary }}
    >
      {hospital.name}
    </span>
  );
}

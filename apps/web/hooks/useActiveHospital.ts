'use client';

import { useGetCurrentHospitalQuery, type HospitalInfo } from '@/store/api';

/**
 * The active tenant, straight from the backend.
 *
 * `GET /hospitals/current` is public and resolves the tenant from the request
 * host's subdomain, so this works on the signed-out pages (landing, login,
 * register, shared report links) as well as inside the dashboard.
 *
 * Returns a blank-but-shaped hospital while the request is in flight so callers
 * can read fields without null-checking every one; `isLoading` is there for the
 * callers that would rather hold rendering until the real name arrives.
 */
const PLACEHOLDER: HospitalInfo = {
  id: '',
  name: '',
  subdomain: '',
  category: '',
  tagline: '',
  currency: 'INR',
  modules: {},
  theme: {},
  status: '',
  createdAt: '',
};

export function useActiveHospital(): HospitalInfo & { isLoading: boolean } {
  const { data, isLoading } = useGetCurrentHospitalQuery();
  return { ...(data ?? PLACEHOLDER), isLoading };
}

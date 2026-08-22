'use client';

import { useGetCurrentHospitalQuery, type HospitalPublicConfig } from '@/store/api';
import { currentSubdomain } from '@/lib/tenant';

/**
 * The active tenant, straight from the backend.
 *
 * `GET /hospitals/current` is public and resolves the tenant from the request
 * host's subdomain, so this works on the signed-out pages (landing, login,
 * register, shared report links) as well as inside the dashboard.
 *
 * Public means narrow: branding and feature flags, no legal identity. A screen
 * that needs the registered detail is by definition a signed-in one and should
 * read `GET /hospitals/me/settings` instead.
 *
 * Returns a blank-but-shaped hospital while the request is in flight so callers
 * can read fields without null-checking every one; `isLoading` is there for the
 * callers that would rather hold rendering until the real name arrives.
 */
const PLACEHOLDER: HospitalPublicConfig = {
  id: '',
  name: '',
  subdomain: '',
  category: '',
  tagline: '',
  currency: 'INR',
  modules: {},
  theme: {},
  logoUrl: '',
  status: '',
};

export function useActiveHospital(): HospitalPublicConfig & { isLoading: boolean } {
  const { data, isLoading } = useGetCurrentHospitalQuery(undefined, { skip: !currentSubdomain() });
  return { ...(data ?? PLACEHOLDER), isLoading };
}

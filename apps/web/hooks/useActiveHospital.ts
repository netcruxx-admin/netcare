'use client';

import { useEffect, useState } from 'react';

import {
  getHospitalConfig,
  type HospitalConfig,
} from '@/lib/hospitalConfig';
import { DEFAULT_HOSPITAL_ID, getCurrentHospitalId } from '@/lib/tenant';

/**
 * The active tenant's config, resolved on the client.
 *
 * SSR-safe: the first render (server + client hydration) uses the default
 * tenant so the markup matches; the real tenant (subdomain / switcher) is
 * resolved in an effect right after mount. Components should read the hospital
 * name/branding/etc. through this hook rather than a static import.
 */
export function useActiveHospital(): HospitalConfig {
  const [id, setId] = useState<string>(DEFAULT_HOSPITAL_ID);

  useEffect(() => {
    setId(getCurrentHospitalId());
  }, []);

  return getHospitalConfig(id);
}

// Session storage and permission checks for the signed-in user.
//
// Authentication itself is the backend's job: POST /auth/login returns the JWT
// and the resolved permission set, and this module only parks that session in
// localStorage for the API client to attach. There is no client-side user
// lookup — the mock one that used to live here is gone.
import { AUTH_SESSION_KEY } from './constants';
import type {
  AuthSession,
  DoctorDetails,
  PatientDetails,
  RegisterDetails,
} from './types';

// Re-export the auth types (definitions live in ./types).
export type { AuthSession, DoctorDetails, PatientDetails, RegisterDetails } from './types';

/**
 * Returns true if the session holds the given permission code.
 *
 * - If `session` is null → false (not authenticated).
 * - If `session.permissions` is undefined → true (old stored session without
 *   permission data; fall back to allowing so existing sessions aren't broken).
 * - If `session.permissions` is an empty array → false (no permissions granted).
 */
export function hasPermission(
  session: AuthSession | null,
  code: string,
): boolean {
  if (!session) return false;
  if (session.permissions === undefined) return true;
  return session.permissions.some((p) => p.code === code);
}

// Helper to store auth in localStorage
export const authStorage = {
  setSession: (session: AuthSession) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    }
  },

  getSession: (): AuthSession | null => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(AUTH_SESSION_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return null;
        }
      }
    }
    return null;
  },

  clearSession: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_SESSION_KEY);
    }
  },
};

import {
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { AUTH_SESSION_KEY } from '@/lib/constants';
import { getCurrentHospitalId } from '@/lib/tenant';

// The transport, and the silent renewal that keeps a short access token from
// being something the user ever notices.
//
// Access tokens now last minutes rather than a week, which is what makes a
// revoked sign-in stop working almost immediately. The cost is that a normal
// session will hit 401 several times an hour, so the client has to renew
// without bothering anyone: a 401 triggers one refresh and the original request
// is replayed against the new token.
//
// The mutex below is not an optimisation — it is required for correctness.
// Refresh tokens rotate on every use, and the server treats a second
// presentation of an already-used one as theft and revokes the whole session
// family. A dashboard firing six queries at once would, without serialisation,
// send six refreshes with the same token and log the user out. So the first
// caller refreshes and the rest wait on that same promise.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

interface StoredSession {
  token?: string;
  refreshToken?: string;
  [key: string]: unknown;
}

function readSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function writeTokens(token: string, refreshToken: string) {
  const session = readSession();
  if (!session) return;
  localStorage.setItem(
    AUTH_SESSION_KEY,
    JSON.stringify({ ...session, token, refreshToken }),
  );
}

function endSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_SESSION_KEY);
  // A full navigation rather than a router push: the session is gone, so every
  // cached query in memory is about to 401 too, and reloading is the honest
  // way to clear them.
  if (window.location.pathname !== '/') window.location.href = '/';
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  prepareHeaders: (headers) => {
    if (typeof window !== 'undefined') {
      const session = readSession();
      if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);
      // Attach the tenant hint so the backend scopes correctly. Only set if
      // not already provided per-request (e.g. superadmin editing a record
      // that belongs to a specific hospital), and only when we actually have
      // one — sending an empty or invented id would name a hospital we have
      // no reason to believe in.
      const tenantHint = getCurrentHospitalId();
      if (tenantHint && !headers.has('X-Hospital-Id')) {
        headers.set('X-Hospital-Id', tenantHint);
      }
    }
    return headers;
  },
});

/** The refresh in flight, if any. Every concurrent 401 awaits this one promise
 *  rather than starting its own — see the note above on rotation. */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  const session = readSession();
  if (!session?.refreshToken) return false;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as {
      token?: string;
      refreshToken?: string;
    };
    if (!data.token || !data.refreshToken) return false;
    writeTokens(data.token, data.refreshToken);
    return true;
  } catch {
    // A network failure is not a dead session — leave the tokens alone so the
    // next attempt can succeed rather than signing the user out over a blip.
    return false;
  }
}

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status !== 401) return result;

  // /auth/refresh returning 401 means the session is genuinely over; retrying
  // it would loop.
  const url = typeof args === 'string' ? args : args.url;
  if (url.includes('/auth/refresh') || url.includes('/auth/login')) return result;

  if (!refreshInFlight) {
    refreshInFlight = refreshOnce().finally(() => {
      refreshInFlight = null;
    });
  }
  const refreshed = await refreshInFlight;

  if (!refreshed) {
    endSession();
    return result;
  }

  // Replayed with the new token, which prepareHeaders now reads from storage.
  result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401) endSession();
  return result;
};

/**
 * Helpers for superadmin API calls that explicitly set X-Hospital-Id,
 * bypassing the subdomain-based tenant resolution used by regular pages.
 */
import { AUTH_SESSION_KEY } from './constants';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

function getToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return '';
    return (JSON.parse(raw) as { token?: string }).token ?? '';
  } catch {
    return '';
  }
}

function buildHeaders(hospitalId: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
    'X-Hospital-Id': hospitalId,
  };
}

export async function superadminPost<T>(
  path: string,
  hospitalId: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(hospitalId),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error((err as { detail?: string }).detail ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}

export async function superadminGet<T>(
  path: string,
  hospitalId: string,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: buildHeaders(hospitalId),
  });
  if (!res.ok) throw new Error('Request failed');
  return res.json() as Promise<T>;
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authStorage } from '@/lib/auth';
import { useMeQuery } from '@/store/api';

export function ProtectedRoute({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: 'patient' | 'doctor' | 'admin' | 'lab' | 'nurse';
}) {
  const router = useRouter();
  const session = authStorage.getSession();

  // Validate the stored JWT against the real backend.
  // Skip the network call entirely if there's no token (avoids a pointless 401).
  const { error } = useMeQuery(undefined, { skip: !session?.token });

  useEffect(() => {
    // No session in localStorage → redirect immediately
    if (!session) {
      router.push('/login');
      return;
    }

    // Role mismatch
    if (requiredRole && session.user.role !== requiredRole) {
      router.push('/login');
      return;
    }

    // Backend rejected the token (expired / tampered) → clear and redirect
    if (error) {
      authStorage.clearSession();
      router.push('/login');
    }
  }, [session, error, router, requiredRole]);

  // Don't render children if there's clearly no valid session
  if (!session) return null;
  if (requiredRole && session.user.role !== requiredRole) return null;

  return <>{children}</>;
}

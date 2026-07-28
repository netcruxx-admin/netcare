'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authStorage } from '@/lib/auth';

export function ProtectedRoute({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: 'patient' | 'doctor' | 'admin' | 'lab' | 'nurse';
}) {
  const router = useRouter();

  useEffect(() => {
    const session = authStorage.getSession();

    if (!session) {
      router.push('/login');
      return;
    }

    if (requiredRole && session.user.role !== requiredRole) {
      router.push('/login');
    }
  }, [router, requiredRole]);

  return <>{children}</>;
}

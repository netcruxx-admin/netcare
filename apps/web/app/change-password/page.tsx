'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';
import { authStorage } from '@/lib/auth';
import { resolveHomePath } from '@/lib/roles';

// The forced first change.
//
// Outside /dashboard on purpose: the shell fetches nav, hospital config and
// permissions, and this account is refused all of it until the password is
// replaced — so rendering the dashboard around this form would fill the screen
// with failed requests behind it.
export default function ChangePasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const session = authStorage.getSession();
    if (!session?.isAuthenticated) {
      router.replace('/login');
      return;
    }
    // Reaching this page with nothing to change means a stale link or a back
    // button — send them where they were going.
    if (!session.mustChangePassword) {
      router.replace(resolveHomePath(session.user.role, session.role?.homePath));
      return;
    }
    setReady(true);
  }, [router]);

  const onDone = () => {
    const session = authStorage.getSession();
    router.replace(
      session ? resolveHomePath(session.user.role, session.role?.homePath) : '/login',
    );
  };

  if (!ready) return null;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-cyan-50 via-white to-teal-50">
      <div className="border-b-2 border-cyan-100 bg-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-2">
          <Image
            src="/logo/logo-full.png"
            alt="NetCare"
            width={80}
            height={80}
            className="h-20 w-20 object-contain"
          />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-cyan-100 bg-white p-8 shadow-2xl">
          <div className="text-center">
            <h1 className="bg-gradient-to-r from-cyan-600 to-brand-teal bg-clip-text text-2xl font-bold text-transparent">
              Choose your password
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              One step before you can use your account.
            </p>
          </div>
          <ChangePasswordForm forced onDone={onDone} />
        </div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import type { Role } from '../registrationSchemas';
import { useActiveHospital } from '@/hooks/useActiveHospital';

// Public sign-up creates patients only. A staff account carries access to other
// people's records, so it is provisioned by the hospital (POST /users) rather
// than self-served — the backend rejects anything else here.
const ROLE_OPTIONS: { type: Role; title: string; description: string; icon: string }[] = [
  { type: 'patient', title: 'Patient', description: 'Book appointments and manage health records', icon: '👤' },
];

export function RoleStep({ onSelect }: { onSelect: (role: Role) => void }) {
  const hospital = useActiveHospital();
  return (
    <>
      <div className="text-center">
        <h2 className="text-3xl font-bold text-slate-900">Create Account</h2>
        <p className="text-slate-600 mt-2">Join NetCare as</p>
      </div>

      <p className="text-center text-sm text-slate-500">
        Staff member? Your hospital administrator creates clinical and
        administrative accounts — ask them to set yours up.
      </p>

      <div className="space-y-3">
        {ROLE_OPTIONS.map((option) => (
          <button
            key={option.type}
            onClick={() => onSelect(option.type)}
            className="w-full p-4 border-2 border-cyan-100 rounded-lg hover:border-cyan-500 hover:bg-cyan-50 transition text-left"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">{option.icon}</span>
              <div>
                <h3 className="font-semibold text-slate-900">{option.title}</h3>
                <p className="text-sm text-slate-600">{option.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="text-center">
        <p className="text-slate-600 text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-cyan-600 font-semibold hover:text-cyan-700">
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}

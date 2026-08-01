'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LogOut, Menu, X, Search } from 'lucide-react';
import Image from 'next/image';
import { authStorage } from '@/lib/auth';
import type { HospitalModules } from '@/lib/hospitalConfig';
import {
  doctorRole,
  navRoutesForRole,
  portalTitleForRole,
  routeLabel,
  superadminRole,
  type PatientContext,
} from '@/lib/roles';
import { useGetCurrentHospitalQuery, useListHospitalsQuery, useMeQuery } from '@/store/api';
import { NotificationBell } from '@/components/NotificationBell';
import { CommandPalette } from '@/components/CommandPalette';

export function DashboardShell({
  role,
  userName,
  title,
  subtitle,
  children,
}: {
  /** Role code of the signed-in user; drives the sidebar via the route table. */
  role: string;
  userName: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState<{ id: string; name: string; role: string } | null>(null);

  // Live permissions from the server — refetches whenever the component mounts or
  // the window refocuses, so nav updates immediately after a permission change.
  const { data: meData } = useMeQuery(undefined, { refetchOnMountOrArgChange: true, refetchOnFocus: true });
  const specialization = '';
  const patientCtx: PatientContext = { specializations: [], hasPregnancy: false, hasBaby: false };

  // Hospital selector for superadmin — preserves ?h= across nav clicks.
  const { data: allHospitals = [] } = useListHospitalsQuery(undefined, { skip: role !== superadminRole });
  const selectedHospitalId = searchParams.get('h') ?? '';

  const handleHospitalChange = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set('h', id);
    else params.delete('h');
    router.push(`${pathname}?${params.toString()}`);
  };

  // Active tenant branding from the real backend (skipped for superadmin).
  const { data: hospitalData } = useGetCurrentHospitalQuery(undefined, { skip: role === superadminRole });
  const hospital = role === superadminRole
    ? { id: '', name: 'NetCare Platform', theme: { primary: '#0f172a', primaryDark: '#1e293b' }, modules: {} as HospitalModules }
    : {
        id: hospitalData?.id ?? '',
        name: hospitalData?.name ?? '…',
        theme: {
          primary: (hospitalData?.theme as Record<string, string>)?.primary ?? '#0891b2',
          primaryDark: (hospitalData?.theme as Record<string, string>)?.primaryDark ?? '#0d9488',
        },
        modules: (hospitalData?.modules ?? {}) as HospitalModules,
      };

  // Paint the active tenant's brand colours so each hospital looks distinct.
  const brandGradient = {
    backgroundImage: `linear-gradient(to bottom right, ${hospital.theme.primary}, ${hospital.theme.primaryDark})`,
  };
  const brandText = {
    backgroundImage: `linear-gradient(to right, ${hospital.theme.primary}, ${hospital.theme.primaryDark})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
  } as React.CSSProperties;

  // Load the current user (for notifications + command palette) after mount.
  useEffect(() => {
    const s = authStorage.getSession();
    if (!s) return;
    setSessionUser({ id: s.user.id, name: s.user.name, role: s.user.role });
  }, []);

  // Cmd/Ctrl+K opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Enabled modules come from the real hospital config fetched from the backend.
  const modules = hospital.modules;

  // The sidebar is the route table filtered to this role — no menu is defined
  // here, so adding a screen means adding one route in lib/roles.ts.
  const navItems = navRoutesForRole(role, {
    modules,
    specialization,
    patientContext: patientCtx,
    permissions: meData?.permissions,
  }).map((route) => ({
    label: routeLabel(route, role),
    href: route.path,
    icon: route.icon,
  }));

  const isActive = (href: string) => pathname === href;

  // Build an href that carries the ?h= param forward so selecting a hospital
  // persists when clicking nav items.
  const navHref = (href: string) =>
    selectedHospitalId ? `${href}?h=${selectedHospitalId}` : href;

  const handleLogout = () => {
    authStorage.clearSession();
    router.push('/');
  };

  const SidebarContent = (
    <>
      <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-100">
        <Image src="/logo/logo-icon.png" alt="Logo" width={50} height={50} className="w-12 h-12 object-contain shrink-0" />
        <div className="min-w-0">
          <p style={brandText} className="font-bold leading-tight">
            {hospital.name}
          </p>
          <p className="text-xs text-slate-500 truncate">{role === doctorRole && specialization ? specialization : portalTitleForRole(role)}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {/* Hospital filter — superadmin only */}
        {role === superadminRole && allHospitals.length > 0 && (
          <div className="mb-3 px-1">
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5 px-2">
              Filter by Hospital
            </label>
            <select
              value={selectedHospitalId}
              onChange={(e) => handleHospitalChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-slate-400 focus:bg-white transition"
            >
              <option value="">All Hospitals</option>
              {allHospitals.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
        )}

        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={navHref(item.href)}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                active
                  ? 'bg-gradient-to-r from-cyan-500 to-teal-600 text-white shadow'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-700 font-semibold shrink-0">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{userName}</p>
            <p className="text-xs text-slate-500 capitalize">{role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="mt-1 w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between bg-white border-b border-slate-200 px-4 h-14">
        <button
          onClick={() => setOpen(true)}
          className="p-2 -ml-2 text-slate-600 hover:text-slate-900"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          <Image src="/logo/logo-icon.png" alt="Logo" width={30} height={30} className="w-8 h-8 object-contain" />
          <span style={brandText} className="font-bold">
            {hospital.name}
          </span>
        </div>
        <div className="flex items-center">
          <button
            onClick={() => setCmdOpen(true)}
            className="p-2 text-slate-500 hover:text-slate-900"
            aria-label="Search"
          >
            <Search className="w-5 h-5" />
          </button>
          {sessionUser && <NotificationBell user={sessionUser} />}
        </div>
      </div>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-white border-r border-slate-200 h-screen sticky top-0">
          {SidebarContent}
        </aside>

        {/* Mobile drawer */}
        {open && (
          <div className="lg:hidden fixed inset-0 z-40">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
            />
            <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col shadow-xl">
              <button
                onClick={() => setOpen(false)}
                className="absolute right-3 top-4 p-1 text-slate-500 hover:text-slate-900"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
              {SidebarContent}
            </aside>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <header className="hidden lg:flex items-center justify-between bg-white border-b border-slate-200 px-8 h-16">
            <div>
              <h1 className="text-lg font-bold text-slate-900">{title}</h1>
              {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCmdOpen(true)}
                className="flex items-center gap-2 text-sm text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <Search className="w-4 h-4" />
                <span>Search…</span>
                <kbd className="ml-2 text-[10px] font-sans bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-500">⌘K</kbd>
              </button>
              {sessionUser && <NotificationBell user={sessionUser} />}
              <span className="text-sm text-slate-600">
                Welcome, <span className="font-semibold text-slate-900">{userName}</span>
              </span>
            </div>
          </header>

          <main className="p-4 sm:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">{children}</div>
          </main>
        </div>
      </div>

      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        role={role}
        navItems={navItems.map((n) => ({ label: n.label, href: n.href }))}
      />
    </div>
  );
}

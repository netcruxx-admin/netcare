'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Heart,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  CalendarPlus,
  Clock,
  FileText,
  HeartPulse,
  CreditCard,
  User,
  CheckCircle,
  Building2,
  Stethoscope,
  Users,
  CalendarDays,
  UserRound,
  CalendarRange,
  Pill,
  FlaskConical,
  ClipboardList,
  FileBarChart,
  Settings,
  Baby,
  Search,
  Video,
  Globe,
  ShieldCheck,
} from 'lucide-react';
import { authStorage } from '@/lib/auth';
import type { HospitalModules } from '@/lib/hospitalConfig';
import { useGetCurrentHospitalQuery, useListHospitalsQuery } from '@/store/api';
import { NotificationBell } from '@/components/NotificationBell';
import { CommandPalette } from '@/components/CommandPalette';

type Role = 'patient' | 'doctor' | 'admin' | 'lab' | 'nurse' | 'superadmin';

// A patient's care context, derived from their own data — used to show only the
// sidebar items relevant to the care they're actually receiving.
interface PatientContext {
  specializations: string[]; // specializations of doctors they have appointments with
  hasPregnancy: boolean;
  hasBaby: boolean;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** If set, this item only shows when the module is enabled in hospitalConfig. */
  module?: keyof HospitalModules;
  /** For doctors: keywords matched (case-insensitive substring) against the
   *  doctor's specialization. If set, the item only shows for matching
   *  departments (e.g. "Newborns" → neonatology / paediatrics). Items without
   *  this tag show for every doctor. */
  specialties?: string[];
  /** For patients: shown only when this returns true for the patient's care
   *  context (e.g. "Pregnancy" only if they see a gynaecologist / have a
   *  pregnancy record). Items without this show for every patient. */
  patientVisible?: (ctx: PatientContext) => boolean;
}

const MENUS: Record<Role, { title: string; items: NavItem[] }> = {
  superadmin: {
    title: 'NetCare Platform',
    items: [
      { label: 'Overview', href: '/dashboard/platform', icon: LayoutDashboard },
      { label: 'Hospitals', href: '/dashboard/platform/hospitals', icon: Building2 },
      { label: 'Patients', href: '/dashboard/platform/patients', icon: UserRound },
      { label: 'Doctors', href: '/dashboard/platform/doctors', icon: Stethoscope },
      { label: 'Appointments', href: '/dashboard/platform/appointments', icon: CalendarDays },
      { label: 'Departments', href: '/dashboard/platform/departments', icon: Globe },
      { label: 'Users', href: '/dashboard/platform/users', icon: Users },
      { label: 'Roles', href: '/dashboard/platform/roles', icon: ShieldCheck },
    ],
  },
  patient: {
    title: 'Patient Portal',
    items: [
      { label: 'Dashboard', href: '/dashboard/patient', icon: LayoutDashboard },
      { label: 'Book Appointment', href: '/dashboard/patient/book', icon: CalendarPlus },
      { label: 'Pregnancy', href: '/dashboard/patient/pregnancy', icon: Baby, module: 'anc', patientVisible: (c) => c.hasPregnancy || c.specializations.some((s) => /obstetric|gynec|gynaec|maternal/.test(s)) },
      { label: 'My Baby', href: '/dashboard/patient/baby', icon: Baby, module: 'anc', patientVisible: (c) => c.hasBaby || c.specializations.some((s) => /neonat|pediatric|paediatric|child/.test(s)) },
      { label: 'Video Consult', href: '/dashboard/patient/video-consult', icon: Video, module: 'telemedicine' },
      { label: 'Schedule', href: '/dashboard/patient/schedule', icon: CalendarRange },
      { label: 'Appointment History', href: '/dashboard/patient/appointments', icon: Clock },
      { label: 'Medical Records', href: '/dashboard/patient/records', icon: FileText, module: 'medicalRecords' },
      { label: 'Test Reports', href: '/dashboard/patient/reports', icon: FileBarChart, module: 'lab' },
      { label: 'Medical History', href: '/dashboard/patient/medical-history', icon: HeartPulse, module: 'medicalRecords' },
      { label: 'Payments', href: '/dashboard/patient/payments', icon: CreditCard, module: 'payments' },
      { label: 'Profile', href: '/dashboard/patient/profile', icon: User },
    ],
  },
  doctor: {
    title: 'Doctor Portal',
    items: [
      { label: 'Dashboard', href: '/dashboard/doctor', icon: LayoutDashboard },
      { label: 'Appointments', href: '/dashboard/doctor/appointments', icon: CalendarDays },
      { label: 'Schedule', href: '/dashboard/doctor/schedule', icon: CalendarRange },
      { label: 'My Patients', href: '/dashboard/doctor/patients', icon: UserRound },
      { label: 'Pregnancies', href: '/dashboard/doctor/pregnancies', icon: Baby, module: 'anc', specialties: ['obstetric', 'gynec', 'gynaec', 'maternal'] },
      { label: 'Newborns', href: '/dashboard/doctor/newborns', icon: Baby, module: 'anc', specialties: ['neonat', 'pediatric', 'paediatric', 'child'] },
      { label: 'Video Consults', href: '/dashboard/doctor/video-consults', icon: Video, module: 'telemedicine' },
      { label: 'Lab Orders', href: '/dashboard/doctor/lab-orders', icon: ClipboardList, module: 'lab' },
      { label: 'Prescriptions', href: '/dashboard/doctor/prescriptions', icon: Pill, module: 'pharmacy' },
      { label: 'Completed Visits', href: '/dashboard/doctor/completed', icon: CheckCircle },
      { label: 'Profile', href: '/dashboard/doctor/profile', icon: User },
    ],
  },
  admin: {
    title: 'Admin Panel',
    items: [
      { label: 'Overview', href: '/dashboard/admin', icon: LayoutDashboard },
      { label: 'Appointments', href: '/dashboard/admin/appointments', icon: CalendarDays },
      { label: 'Schedule', href: '/dashboard/admin/schedule', icon: CalendarRange },
      { label: 'Patients', href: '/dashboard/admin/patients', icon: UserRound },
      { label: 'Departments', href: '/dashboard/admin/departments', icon: Building2 },
      { label: 'Doctors', href: '/dashboard/admin/doctors', icon: Stethoscope },
      { label: 'Medicines', href: '/dashboard/admin/medicines', icon: Pill, module: 'pharmacy' },
      { label: 'Tests', href: '/dashboard/admin/tests', icon: FlaskConical, module: 'lab' },
      { label: 'Users', href: '/dashboard/admin/users', icon: Users },
      { label: 'Hospital Setup', href: '/dashboard/admin/setup', icon: Settings },
    ],
  },
  lab: {
    title: 'Laboratory',
    items: [
      { label: 'Dashboard', href: '/dashboard/lab', icon: LayoutDashboard },
      { label: 'Test Orders', href: '/dashboard/lab/orders', icon: ClipboardList },
      { label: 'Reports', href: '/dashboard/lab/reports', icon: FileBarChart },
      { label: 'Test Catalog', href: '/dashboard/lab/catalog', icon: FlaskConical },
    ],
  },
  nurse: {
    title: 'Nursing Station',
    items: [
      { label: 'Dashboard', href: '/dashboard/nurse', icon: LayoutDashboard },
      { label: 'Appointments', href: '/dashboard/nurse/appointments', icon: CalendarDays },
      { label: 'Patients', href: '/dashboard/nurse/patients', icon: UserRound },
      { label: 'Record Vitals', href: '/dashboard/nurse/vitals', icon: HeartPulse, module: 'nursing' },
      { label: 'Profile', href: '/dashboard/nurse/profile', icon: User },
    ],
  },
};

export function DashboardShell({
  role,
  userName,
  title,
  subtitle,
  children,
}: {
  role: Role;
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
  const specialization = '';
  const patientCtx: PatientContext = { specializations: [], hasPregnancy: false, hasBaby: false };

  // Hospital selector for superadmin — preserves ?h= across nav clicks.
  const { data: allHospitals = [] } = useListHospitalsQuery(undefined, { skip: role !== 'superadmin' });
  const selectedHospitalId = searchParams.get('h') ?? '';

  const handleHospitalChange = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set('h', id);
    else params.delete('h');
    router.push(`${pathname}?${params.toString()}`);
  };

  // Active tenant branding from the real backend (skipped for superadmin).
  const { data: hospitalData } = useGetCurrentHospitalQuery(undefined, { skip: role === 'superadmin' });
  const hospital = role === 'superadmin'
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

  const menu = MENUS[role];

  // Enabled modules come from the real hospital config fetched from the backend.
  const modules = hospital.modules;

  // Show a nav item when (a) its module is enabled, and (b) for doctors, its
  // specialty tag matches the doctor's department (untagged items always show).
  const spec = specialization.toLowerCase();
  const navItems = menu.items.filter((item) => {
    if (item.module && !modules[item.module]) return false;
    if (item.specialties && role === 'doctor') {
      return item.specialties.some((k) => spec.includes(k));
    }
    if (item.patientVisible && role === 'patient') {
      return item.patientVisible(patientCtx);
    }
    return true;
  });

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
        <div style={brandGradient} className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0">
          <Heart className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p style={brandText} className="font-bold leading-tight">
            {hospital.name}
          </p>
          <p className="text-xs text-slate-500 truncate">{role === 'doctor' && specialization ? specialization : menu.title}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {/* Hospital filter — superadmin only */}
        {role === 'superadmin' && allHospitals.length > 0 && (
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
          <div style={brandGradient} className="w-7 h-7 rounded-md flex items-center justify-center">
            <Heart className="w-4 h-4 text-white" />
          </div>
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

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
} from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { dbOperations } from '@/lib/db';
import { getAllHospitals, type HospitalConfig, type HospitalModules } from '@/lib/hospitalConfig';
import { getEnabledModules } from '@/lib/hospitalCategories';
import { setCurrentHospitalId } from '@/lib/tenant';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import { NotificationBell } from '@/components/NotificationBell';
import { CommandPalette } from '@/components/CommandPalette';

type Role = 'patient' | 'doctor' | 'admin' | 'lab' | 'nurse';

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
      { label: 'Onboard Hospital', href: '/dashboard/platform', icon: Building2 },
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
  const [open, setOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState<{ id: string; name: string; role: Role } | null>(null);
  // The logged-in doctor's specialization, used to tailor the sidebar by
  // department. Empty for non-doctors.
  const [specialization, setSpecialization] = useState('');
  // The patient's care context, used to tailor the patient sidebar.
  const [patientCtx, setPatientCtx] = useState<PatientContext>({ specializations: [], hasPregnancy: false, hasBaby: false });

  // Active tenant (branding) + all tenants (for the switcher).
  const hospital = useActiveHospital();
  const [hospitals, setHospitals] = useState<HospitalConfig[]>([]);
  useEffect(() => {
    setHospitals(getAllHospitals());
  }, []);

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

  // Switch tenants (demo tool): clear the session and land on the target
  // hospital's login, since accounts are per-tenant.
  const switchHospital = (id: string) => {
    setCurrentHospitalId(id);
    authStorage.clearSession();
    window.location.href = '/login';
  };

  // Load the current user (for notifications + command palette) after mount.
  useEffect(() => {
    const s = authStorage.getSession();
    if (!s) return;
    setSessionUser({ id: s.user.id, name: s.user.name, role: s.user.role as Role });
    if (s.user.role === 'doctor') {
      setSpecialization(dbOperations.getDoctorByUserId(s.user.id)?.specialization ?? '');
    } else if (s.user.role === 'patient') {
      const patientId = dbOperations.getPatientByUserId(s.user.id)?.id;
      if (patientId) {
        const specializations = dbOperations
          .getAppointmentsByPatientId(patientId)
          .map((a) => dbOperations.getDoctorById(a.doctorId)?.specialization?.toLowerCase() ?? '')
          .filter(Boolean);
        setPatientCtx({
          specializations,
          hasPregnancy: !!dbOperations.getActivePregnancyByPatientId(patientId),
          hasBaby: dbOperations.getBabiesByMother(patientId).length > 0,
        });
      }
    }
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

  // Enabled modules come from the active hospital category. Read after mount so
  // a category switch (stored in localStorage) re-shapes the nav live; the
  // initial value matches SSR to avoid a hydration mismatch.
  const [modules, setModules] = useState<HospitalModules>(() => getEnabledModules());
  useEffect(() => {
    setModules(getEnabledModules());
  }, [pathname]);

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
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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
              {hospitals.length > 1 && (
                <select
                  value={hospital.id}
                  onChange={(e) => switchHospital(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 text-slate-700 hover:bg-slate-100 transition"
                  aria-label="Switch hospital"
                  title="Switch hospital (demo)"
                >
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              )}
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

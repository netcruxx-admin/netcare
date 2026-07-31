/**
 * Roles and dashboard routing — the single source for both.
 *
 * Roles live in the backend `roles` table and are managed at runtime, so the
 * frontend must not scatter role names through the codebase. Everything that
 * depends on "which roles exist" or "who may see which screen" reads from the
 * variables in this file: the sidebar, the per-page access guard, the login
 * redirect and the role pickers.
 *
 * Routes are role-agnostic (`/dashboard/patients`, not `/dashboard/doctor/patients`).
 * A route lists the roles allowed to open it; the page then renders the view for
 * whichever role is signed in. That is what removes the folder-per-role layout
 * and the access check copy-pasted into every page.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Baby,
  Building2,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  CheckCircle,
  ClipboardList,
  Clock,
  CreditCard,
  FileBarChart,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  Pill,
  Settings,
  ShieldCheck,
  Stethoscope,
  User,
  UserRound,
  Users,
  Video,
} from 'lucide-react';
import type { HospitalModules } from './hospitalConfig';
import type { AuthSession } from './types';

// -----------------------------------------------------------------------------
// Role codes
// -----------------------------------------------------------------------------

// The role codes the shipped screens are written for. Referenced through these
// variables so a rename is one edit, and so no other file spells them out.
export const superadminRole = 'superadmin';
export const adminRole = 'admin';
export const doctorRole = 'doctor';
export const nurseRole = 'nurse';
export const labRole = 'lab';
export const patientRole = 'patient';

/** Roles the product ships with. The backend refuses to delete these, and the
 *  Roles screen greys out their delete buttons to match. */
export const builtInRoleCodes = [
  superadminRole,
  adminRole,
  doctorRole,
  nurseRole,
  labRole,
  patientRole,
];

/** Tabs on the login form — roles with a self-service sign-in path. Not the set
 *  of valid roles: anyone holding a runtime-created role signs in without a tab. */
export const loginRoleTabs = [patientRole, doctorRole, adminRole, labRole, nurseRole];

/** Sidebar heading per role. Falls back to a generic title for custom roles. */
export const portalTitles: Record<string, string> = {
  [superadminRole]: 'NetCare Platform',
  [adminRole]: 'Admin Panel',
  [doctorRole]: 'Doctor Portal',
  [nurseRole]: 'Nursing Station',
  [labRole]: 'Laboratory',
  [patientRole]: 'Patient Portal',
};
export const fallbackPortalTitle = 'Dashboard';

export function portalTitleForRole(role: string): string {
  return portalTitles[role] ?? fallbackPortalTitle;
}

// -----------------------------------------------------------------------------
// Dashboard routes
// -----------------------------------------------------------------------------

/** A patient's care context, used to hide screens for care they aren't receiving. */
export interface PatientContext {
  specializations: string[];
  hasPregnancy: boolean;
  hasBaby: boolean;
}

export interface DashboardRoute {
  /** URL under /dashboard. Contains no role segment. */
  path: string;
  /** Sidebar label, and the fallback page title. */
  label: string;
  icon: LucideIcon;
  /** Roles allowed to open this route. Empty means nobody — never omit it. */
  roles: string[];
  /** Per-role label override, where roles name the same screen differently. */
  labelByRole?: Record<string, string>;
  /** Hidden unless the hospital has this module enabled. */
  module?: keyof HospitalModules;
  /** Doctors only: shown when the doctor's specialization matches a keyword. */
  specialties?: string[];
  /** Patients only: shown when the patient's care context matches. */
  patientVisible?: (ctx: PatientContext) => boolean;
  /** Keep out of the sidebar (still routable, e.g. detail pages). */
  hideInNav?: boolean;
}

/** Hospital staff who work with patient records. */
export const staffRoles = [adminRole, doctorRole, nurseRole];
/** Staff who deliver care directly and share the same profile form. */
export const clinicalRoles = [doctorRole, nurseRole];
const allRoles = [superadminRole, adminRole, doctorRole, nurseRole, labRole, patientRole];

/**
 * Every dashboard route, once.
 *
 * There is no role in any path: `/dashboard/appointments` serves five roles, and
 * the page picks the view for whoever is signed in. `module` gates a route on a
 * hospital feature for all of its roles; `specialties` only ever narrows doctors
 * and `patientVisible` only ever narrows patients, so one entry can carry all
 * three without them interfering.
 *
 * Ordered as the sidebar reads — landing page, day-to-day work, then account and
 * administration last. Each role sees this order filtered to its own routes.
 */
export const dashboardRoutes: DashboardRoute[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: allRoles,
    labelByRole: { [superadminRole]: 'Overview', [adminRole]: 'Overview' },
  },

  // ── Booking and scheduling ────────────────────────────────────────────────
  {
    path: '/dashboard/book',
    label: 'Book Appointment',
    icon: CalendarPlus,
    roles: [adminRole, patientRole],
    // Admins reach booking from the appointments screen, not the sidebar.
    hideInNav: true,
  },
  {
    path: '/dashboard/appointments',
    label: 'Appointments',
    icon: CalendarDays,
    roles: [superadminRole, adminRole, doctorRole, nurseRole, patientRole],
    labelByRole: { [patientRole]: 'Appointment History' },
  },
  {
    path: '/dashboard/schedule',
    label: 'Schedule',
    icon: CalendarRange,
    roles: [adminRole, doctorRole, patientRole],
  },

  // ── People ────────────────────────────────────────────────────────────────
  {
    path: '/dashboard/patients',
    label: 'Patients',
    icon: UserRound,
    roles: [superadminRole, ...staffRoles],
    labelByRole: { [doctorRole]: 'My Patients', [superadminRole]: 'All Patients' },
  },
  {
    path: '/dashboard/doctors',
    label: 'Doctors',
    icon: Stethoscope,
    roles: [superadminRole, adminRole],
  },

  // ── Clinical work ─────────────────────────────────────────────────────────
  {
    path: '/dashboard/pregnancies',
    label: 'Pregnancies',
    icon: Baby,
    roles: [doctorRole, patientRole],
    labelByRole: { [patientRole]: 'Pregnancy' },
    module: 'anc',
    specialties: ['obstetric', 'gynec', 'gynaec', 'maternal'],
    patientVisible: (c) =>
      c.hasPregnancy || c.specializations.some((s) => /obstetric|gynec|gynaec|maternal/.test(s)),
  },
  {
    path: '/dashboard/babies',
    label: 'Newborns',
    icon: Baby,
    roles: [doctorRole, patientRole],
    labelByRole: { [patientRole]: 'My Baby' },
    module: 'anc',
    specialties: ['neonat', 'pediatric', 'paediatric', 'child'],
    patientVisible: (c) =>
      c.hasBaby || c.specializations.some((s) => /neonat|pediatric|paediatric|child/.test(s)),
  },
  {
    path: '/dashboard/video-consults',
    label: 'Video Consults',
    icon: Video,
    roles: [doctorRole, patientRole],
    labelByRole: { [patientRole]: 'Video Consult' },
    module: 'telemedicine',
  },
  {
    path: '/dashboard/vitals',
    label: 'Record Vitals',
    icon: HeartPulse,
    roles: [nurseRole],
    module: 'nursing',
  },
  {
    path: '/dashboard/prescriptions',
    label: 'Prescriptions',
    icon: Pill,
    roles: [doctorRole],
    module: 'pharmacy',
  },
  { path: '/dashboard/completed', label: 'Completed Visits', icon: CheckCircle, roles: [doctorRole] },

  // ── Records and lab ───────────────────────────────────────────────────────
  {
    path: '/dashboard/records',
    label: 'Medical Records',
    icon: FileText,
    roles: [patientRole],
    module: 'medicalRecords',
  },
  {
    path: '/dashboard/medical-history',
    label: 'Medical History',
    icon: HeartPulse,
    roles: [patientRole],
    module: 'medicalRecords',
  },
  {
    path: '/dashboard/lab-orders',
    label: 'Lab Orders',
    icon: ClipboardList,
    roles: [doctorRole, labRole],
    labelByRole: { [labRole]: 'Test Orders' },
    module: 'lab',
  },
  {
    path: '/dashboard/reports',
    label: 'Reports',
    icon: FileBarChart,
    roles: [labRole, patientRole],
    labelByRole: { [patientRole]: 'Test Reports' },
    module: 'lab',
  },
  {
    path: '/dashboard/tests',
    label: 'Tests',
    icon: FlaskConical,
    roles: [adminRole, labRole],
    labelByRole: { [labRole]: 'Test Catalog' },
    module: 'lab',
  },
  {
    path: '/dashboard/payments',
    label: 'Payments',
    icon: CreditCard,
    roles: [patientRole],
    module: 'payments',
  },

  // ── Account ───────────────────────────────────────────────────────────────
  {
    path: '/dashboard/profile',
    label: 'Profile',
    icon: User,
    roles: [...clinicalRoles, patientRole],
  },

  // ── Administration ────────────────────────────────────────────────────────
  { path: '/dashboard/hospitals', label: 'Hospitals', icon: Building2, roles: [superadminRole] },
  {
    path: '/dashboard/departments',
    label: 'Departments',
    icon: Building2,
    roles: [superadminRole, adminRole],
  },
  {
    path: '/dashboard/medicines',
    label: 'Medicines',
    icon: Pill,
    roles: [adminRole],
    module: 'pharmacy',
  },
  { path: '/dashboard/users', label: 'Users', icon: Users, roles: [superadminRole, adminRole] },
  { path: '/dashboard/roles', label: 'Roles', icon: ShieldCheck, roles: [superadminRole] },
  { path: '/dashboard/setup', label: 'Hospital Setup', icon: Settings, roles: [adminRole] },
];

/**
 * Routes only the platform owner may open, kept as a plain list so the edge
 * middleware can import it without pulling in the route table's icons. Keep it
 * in step with the superadmin-only entries above.
 */
export const platformOnlyPaths = ['/dashboard/hospitals', '/dashboard/roles'];

/**
 * Paths any signed-in user may open, matched exactly. `/dashboard` is here
 * because every role lands there and the page picks their view — it must NOT be
 * treated as a prefix, or every route beneath it would be open to everyone.
 */
export const alwaysAllowedPaths = ['/dashboard'];

/** Subtrees any signed-in user may open — detail pages reached from a link,
 *  which authorize against the record itself rather than the role. */
export const alwaysAllowedPathPrefixes = ['/dashboard/consult'];

// -----------------------------------------------------------------------------
// Lookups
// -----------------------------------------------------------------------------

export function findRoute(path: string): DashboardRoute | undefined {
  return dashboardRoutes.find((r) => r.path === path);
}

/**
 * Whether a role may open a path. Unknown paths are allowed — the route table
 * governs the dashboard screens it lists, and is not a URL whitelist.
 */
export function canRoleAccessPath(role: string, path: string): boolean {
  if (alwaysAllowedPaths.includes(path)) return true;
  if (alwaysAllowedPathPrefixes.some((p) => path === p || path.startsWith(`${p}/`))) return true;
  const route = findRoute(path);
  if (!route) return true;
  return route.roles.includes(role);
}

/** Sidebar label for a route, honouring any per-role override. */
export function routeLabel(route: DashboardRoute, role: string): string {
  return route.labelByRole?.[role] ?? route.label;
}

/**
 * Sidebar entries for a role: its routes, minus ones whose module is disabled,
 * whose specialty doesn't match the doctor, or that don't apply to this patient.
 */
export function navRoutesForRole(
  role: string,
  options: {
    modules: HospitalModules;
    specialization?: string;
    patientContext?: PatientContext;
  },
): DashboardRoute[] {
  const { modules, specialization = '', patientContext } = options;
  const spec = specialization.toLowerCase();

  return dashboardRoutes.filter((route) => {
    if (!route.roles.includes(role)) return false;
    if (route.hideInNav) return false;
    if (route.module && !modules[route.module]) return false;
    if (route.specialties && role === doctorRole) {
      return route.specialties.some((keyword) => spec.includes(keyword));
    }
    if (route.patientVisible && role === patientRole && patientContext) {
      return route.patientVisible(patientContext);
    }
    return true;
  });
}

// -----------------------------------------------------------------------------
// Landing routes
// -----------------------------------------------------------------------------

/** Where everyone lands: `/dashboard` renders the view for the signed-in role,
 *  so there is no longer a per-role landing URL to map to. */
export const genericHomePath = '/dashboard';

/**
 * Resolve a role's dashboard.
 *
 * A role may still declare its own `homePath` in the backend catalog (useful for
 * pointing a custom role at a specific screen); otherwise everyone goes to the
 * role-agnostic landing route. Old per-role paths are rewritten rather than
 * trusted, so sessions and role rows created before the routes were collapsed
 * don't send anyone to a URL that no longer exists.
 */
export function resolveHomePath(roleCode: string, homePath?: string | null): string {
  if (!homePath) return genericHomePath;
  const stale = builtInRoleCodes.some(
    (code) => homePath === `/dashboard/${code}` || homePath === '/dashboard/platform',
  );
  return stale ? genericHomePath : homePath;
}

export function homePathForSession(session: AuthSession): string {
  return resolveHomePath(session.user.role, session.role?.homePath);
}

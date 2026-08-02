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
 * A route declares the **permission** it needs; the page then renders the view
 * for whichever role is signed in. That is what removes the folder-per-role
 * layout and the access check copy-pasted into every page.
 *
 * Access is decided by permissions, never by role name. A role invented by the
 * superadmin at runtime works the moment its grants are ticked — there is no
 * list of role codes here for anyone to remember to update. The role codes below
 * exist only to label the shipped roles' curated menus and pick their views.
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
import type { HospitalModules } from './types';
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
  /**
   * The capability this screen needs. **This is the access decision** — hold it
   * and you may open the route, whatever your role is called. Omitted only for
   * routes open to anyone signed in (see `openToAnySignedInUser`).
   */
  permission?: string;
  /**
   * Which shipped roles have a *view* built for this screen. This is a fact
   * about the UI, not about authority: it never grants access and never denies
   * it. It exists so the six built-in roles keep their curated sidebar — an
   * admin holds `appointments.read` but has no use for the doctor's "Completed
   * Visits" screen. A role that is not one of the shipped six is not narrowed
   * by it, so a superadmin-created role sees every screen its grants unlock.
   */
  viewRoles: string[];
  /**
   * Keep this screen out of the nav for roles outside `viewRoles`, even when
   * they hold the permission. For screens with no generic form — a doctor's own
   * completed visits, a clinician's profile record — where offering the link to
   * a role with no view would only lead to the "not available" notice.
   *
   * It hides a menu entry; it does not deny access. The permission still does
   * that, here and at the API.
   */
  viewRolesOnly?: boolean;
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
 * the page picks the view for whoever is signed in. `permission` is the gate;
 * `module` gates a route on a hospital feature for everyone; `specialties` only
 * ever narrows doctors and `patientVisible` only ever narrows patients, so one
 * entry can carry all of them without them interfering.
 *
 * Ordered as the sidebar reads — landing page, day-to-day work, then account and
 * administration last. Each user sees this order filtered to their own grants.
 */
export const dashboardRoutes: DashboardRoute[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    viewRoles: allRoles,
    labelByRole: { [superadminRole]: 'Overview', [adminRole]: 'Overview' },
  },

  { path: '/dashboard/hospitals', label: 'Hospitals', icon: Building2, viewRoles: [superadminRole], permission: 'hospitals.manage' },

  // ── Booking and scheduling ────────────────────────────────────────────────
  {
    path: '/dashboard/book',
    label: 'Book Appointment',
    icon: CalendarPlus,
    viewRoles: [superadminRole, adminRole, patientRole],
    permission: 'appointments.create',
    // Admins and superadmin reach booking from the appointments screen, not the sidebar.
    hideInNav: true,
  },
  {
    path: '/dashboard/appointments',
    label: 'Appointments',
    icon: CalendarDays,
    viewRoles: [superadminRole, adminRole, doctorRole, nurseRole, patientRole],
    permission: 'appointments.read',
    labelByRole: { [patientRole]: 'Appointment History' },
  },
  {
    path: '/dashboard/schedule',
    label: 'Schedule',
    icon: CalendarRange,
    viewRoles: [adminRole, doctorRole, patientRole],
    permission: 'schedule.read',
  },

  // ── People ────────────────────────────────────────────────────────────────
  {
    path: '/dashboard/patients',
    label: 'Patients',
    icon: UserRound,
    viewRoles: [superadminRole, ...staffRoles],
    permission: 'patients.read',
    labelByRole: { [doctorRole]: 'My Patients', [superadminRole]: 'All Patients' },
  },
  {
    path: '/dashboard/doctors',
    label: 'Doctors',
    icon: Stethoscope,
    viewRoles: [superadminRole, adminRole],
    permission: 'doctors.read',
  },

  // ── Clinical work ─────────────────────────────────────────────────────────
  {
    path: '/dashboard/pregnancies',
    label: 'Pregnancies',
    icon: Baby,
    viewRoles: [doctorRole, patientRole],
    permission: 'pregnancies.read',
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
    viewRoles: [doctorRole, patientRole],
    permission: 'babies.read',
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
    viewRoles: [doctorRole, patientRole],
    permission: 'video_consults.join',
    labelByRole: { [patientRole]: 'Video Consult' },
    module: 'telemedicine',
  },
  {
    path: '/dashboard/vitals',
    label: 'Record Vitals',
    icon: HeartPulse,
    viewRoles: [nurseRole],
    permission: 'vitals.record',
    module: 'nursing',
  },
  {
    path: '/dashboard/prescriptions',
    label: 'Prescriptions',
    icon: Pill,
    viewRoles: [doctorRole],
    permission: 'prescriptions.read',
    module: 'pharmacy',
  },
  // A doctor's own finished visits. Every role holding appointments.read would
  // otherwise be offered it, and there is no version of the screen for them.
  { path: '/dashboard/completed', label: 'Completed Visits', icon: CheckCircle, viewRoles: [doctorRole], permission: 'appointments.read', viewRolesOnly: true },

  // ── Records and lab ───────────────────────────────────────────────────────
  {
    path: '/dashboard/records',
    label: 'Medical Records',
    icon: FileText,
    viewRoles: [patientRole],
    permission: 'medical_records.read',
    module: 'medicalRecords',
  },
  {
    path: '/dashboard/medical-history',
    label: 'Medical History',
    icon: HeartPulse,
    viewRoles: [patientRole],
    permission: 'medical_records.read',
    module: 'medicalRecords',
  },
  {
    path: '/dashboard/lab-orders',
    label: 'Lab Orders',
    icon: ClipboardList,
    viewRoles: [doctorRole, labRole],
    permission: 'lab_orders.read',
    labelByRole: { [labRole]: 'Test Orders' },
    module: 'lab',
  },
  {
    path: '/dashboard/reports',
    label: 'Reports',
    icon: FileBarChart,
    viewRoles: [labRole, patientRole],
    permission: 'lab_reports.read',
    labelByRole: { [patientRole]: 'Test Reports' },
    module: 'lab',
  },
  {
    path: '/dashboard/tests',
    label: 'Tests',
    icon: FlaskConical,
    viewRoles: [adminRole, labRole],
    permission: 'lab_tests.manage',
    labelByRole: { [labRole]: 'Test Catalog' },
    module: 'lab',
  },
  {
    path: '/dashboard/payments',
    label: 'Payments',
    icon: CreditCard,
    viewRoles: [patientRole],
    permission: 'payments.read',
    module: 'payments',
  },

  // ── Account ───────────────────────────────────────────────────────────────
  {
    path: '/dashboard/profile',
    label: 'Profile',
    icon: User,
    viewRoles: [...clinicalRoles, patientRole],
    permission: 'profile.manage',
    // The forms here edit a doctor/nurse/patient record. A role with none of
    // those has nothing to edit yet — PUT /users/me exists but has no screen.
    viewRolesOnly: true,
  },

  // ── Administration ────────────────────────────────────────────────────────
  {
    path: '/dashboard/departments',
    label: 'Departments',
    icon: Building2,
    viewRoles: [superadminRole, adminRole],
    permission: 'departments.read',
  },
  {
    path: '/dashboard/medicines',
    label: 'Medicines',
    icon: Pill,
    viewRoles: [adminRole],
    permission: 'medicines.manage',
    module: 'pharmacy',
  },
  { path: '/dashboard/users', label: 'Users', icon: Users, viewRoles: [superadminRole, adminRole], permission: 'users.read' },
  { path: '/dashboard/roles', label: 'Roles', icon: ShieldCheck, viewRoles: [superadminRole], permission: 'roles.manage' },
  { path: '/dashboard/setup', label: 'Hospital Setup', icon: Settings, viewRoles: [adminRole], permission: 'hospital.settings.manage' },
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

/** A resolved grant as the server reports it on the session. */
export type PermissionGrant = { code: string; scope?: string | null };

/** Whether the session holds a capability at all. */
export function hasPermission(
  permissions: PermissionGrant[] | undefined,
  code: string,
): boolean {
  return !!permissions?.some((p) => p.code === code);
}

/**
 * The scope a capability was granted at — 'own', 'all', or undefined when the
 * capability isn't held. Screens use this to decide how much to show, rather
 * than asking what the user's role is called.
 */
export function permissionScope(
  permissions: PermissionGrant[] | undefined,
  code: string,
): string | undefined {
  const grant = permissions?.find((p) => p.code === code);
  if (!grant) return undefined;
  return grant.scope ?? undefined;
}

/**
 * Whether a signed-in user may open a path.
 *
 * The permission decides — not the role. That is what makes a role the
 * superadmin invented at runtime work without a code change: grant it
 * `patients.read` and /dashboard/patients opens for it.
 *
 * Unknown paths are allowed: the route table governs the dashboard screens it
 * lists and is not a URL whitelist. It is also only the client's copy of the
 * decision — the API enforces the same permission again on every request, so a
 * user who forces their way to a screen still sees nothing they may not read.
 */
export function canAccessPath(
  permissions: PermissionGrant[] | undefined,
  path: string,
): boolean {
  if (alwaysAllowedPaths.includes(path)) return true;
  if (alwaysAllowedPathPrefixes.some((p) => path === p || path.startsWith(`${p}/`))) return true;
  const route = findRoute(path);
  if (!route) return true;
  if (!route.permission) return true;
  // No permission data yet (a session stored before grants were resolved):
  // don't lock the user out of their own dashboard over a missing field. The
  // API is still enforcing, and useDashboardGuard re-checks once /auth/me lands.
  if (!permissions) return true;
  return hasPermission(permissions, route.permission);
}

/** Sidebar label for a route, honouring any per-role override. */
export function routeLabel(route: DashboardRoute, role: string): string {
  return route.labelByRole?.[role] ?? route.label;
}

/**
 * Sidebar entries: the routes this user's permissions unlock, minus ones whose
 * module is disabled, whose specialty doesn't match the doctor, or that don't
 * apply to this patient.
 *
 * Permissions decide *whether* a screen is reachable. `viewRoles` only decides
 * whether it is worth putting in a shipped role's menu — an admin holds
 * `appointments.read` but the doctor's "Completed Visits" screen is not their
 * workflow. A role that isn't one of the shipped six is not narrowed that way,
 * so a superadmin can invent "receptionist", tick five permissions, and get a
 * working sidebar with no code change.
 */
export function navRoutesForRole(
  role: string,
  options: {
    /** A module the hospital hasn't enabled is simply absent, which reads as
     *  off — the safe direction for a feature flag. */
    modules: Partial<HospitalModules>;
    specialization?: string;
    patientContext?: PatientContext;
    /** Resolved grants from the session. Without them nothing is shown beyond
     *  the always-open routes — an empty menu is the safe direction to fail. */
    permissions?: PermissionGrant[];
  },
): DashboardRoute[] {
  const { modules, specialization = '', patientContext, permissions } = options;
  const spec = specialization.toLowerCase();
  const isShippedRole = builtInRoleCodes.includes(role);

  return dashboardRoutes.filter((route) => {
    if (route.hideInNav) return false;
    if (route.module && !modules[route.module]) return false;
    if (route.permission && !hasPermission(permissions, route.permission)) return false;
    // Curated menu for the shipped roles; everything earned for the rest,
    // except screens that exist in no generic form.
    if ((isShippedRole || route.viewRolesOnly) && !route.viewRoles.includes(role)) return false;
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

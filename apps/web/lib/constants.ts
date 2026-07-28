// -----------------------------------------------------------------------------
// App-wide constants — cross-cutting config values with no logic of their own:
// localStorage keys, the DB schema version, the default tenant, shared scalars.
//
// Domain data tables (vaccine schedules, WHO percentiles, ANC milestones,
// status-style maps, the hospital registry / category templates) deliberately
// stay with the module whose logic owns them, not here.
// -----------------------------------------------------------------------------

// -- localStorage keys --------------------------------------------------------
export const DB_KEY = 'hospital_db';
export const DB_VERSION_KEY = 'hospital_db_version';
export const AUTH_SESSION_KEY = 'auth_session';
export const ACTIVE_HOSPITAL_KEY = 'active_hospital_id';
export const CUSTOM_HOSPITALS_KEY = 'custom_hospitals';
export const ACTIVE_CATEGORY_KEY = 'hospital_active_category';
export const NOTIF_READ_KEY = 'notif_read';

// -- Database ------------------------------------------------------------------
// Bump when the seed shape changes so older localStorage snapshots are discarded
// and re-seeded (otherwise stale demo data lingers in the browser).
// v3: every row carries a hospitalId (multi-tenant scoping).
// v4: pregnancy records + ANC visits (maternity ANC tracker).
// v5: video-consultation slots + appointment `mode`.
// v6: babies + growth measurements + immunizations (newborn module).
// v7: department-based doctor logins + a Pediatric Care doctor.
// v8: doctor names renamed to signal their department.
// v10: multi-tenant — every built-in tenant is seeded; by-id reads are scoped.
export const DB_VERSION = 10;

// -- Tenancy -------------------------------------------------------------------
/** The tenant used when none is resolved from subdomain / switch. */
export const DEFAULT_HOSPITAL_ID = 'hosp-1';

// -- Shared scalars ------------------------------------------------------------
export const MS_PER_DAY = 86_400_000;

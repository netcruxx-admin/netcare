// -----------------------------------------------------------------------------
// App-wide constants — cross-cutting values with no logic of their own.
//
// Domain data tables (vaccine schedules, WHO percentiles, ANC milestones,
// status-style maps, the hospital registry / category templates) deliberately
// stay with the module whose logic owns them, not here.
// -----------------------------------------------------------------------------

// -- localStorage keys --------------------------------------------------------
// The signed-in session (JWT + the permission set the server resolved for it).
// This is the only thing the app keeps in the browser; all domain data comes
// from the API.
export const AUTH_SESSION_KEY = 'auth_session';

// Last-known brand colours per tenant subdomain, so the dashboard shell can
// paint the right colour on its very first frame instead of the generic
// default while GET /hospitals/current is still in flight.
export const HOSPITAL_THEME_CACHE_PREFIX = 'hospital_theme:';

// -- Shared scalars ------------------------------------------------------------
export const MS_PER_DAY = 86_400_000;

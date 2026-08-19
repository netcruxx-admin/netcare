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

// -- Shared scalars ------------------------------------------------------------
export const MS_PER_DAY = 86_400_000;

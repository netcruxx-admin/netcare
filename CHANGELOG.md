# Changelog

Notable changes to CarbonHealth. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added — regulatory compliance foundation (India)

Three obligations that a hospital management system sold in India cannot ship
without, each closing a gap where the product previously had nothing at all.

#### Audit trail — who accessed which record

`audit_logs`, written by middleware around every request.

- Required by the **EHR Standards for India 2016**, which adopt ISO 27789 and
  make *reading* a health record an auditable event, not just writing one; by
  **DPDP 2023**, which requires a breach to be reconstructable; and by the
  **CERT-In Directions (April 2022)**, which require logs retained in India for
  180 days.
- Assembled from the dependencies every endpoint already passes through —
  `get_current_user` supplies who, `require_permission` supplies under what
  authority, `get_tenant_id` supplies whose data. No router participates, so a
  new router is audited the day it is written.
- **403s are recorded**, because recording happens before the permission check.
  A denied access attempt is the most interesting line in a medico-legal review
  and never reaches a handler.
- Request bodies and query strings are never stored. Rows name records by id.
- `GET /audit-logs` is read-only, gated on a new `audit.read` permission held by
  admin and superadmin. Clinicians are excluded: the trail is personnel data
  about colleagues as much as it is a compliance record.
- Every response now carries `X-Request-Id`, tying a user's report to its row.

#### Consent — asking before processing, and keeping the proof

`consent_purposes` (a code-owned, versioned catalog) and `consents` (one answer
per person per purpose, stamped with the notice version they saw).

- **DPDP 2023** requires notice before collection and consent that is specific,
  itemised, unconditional and withdrawable — none of which a boolean on the user
  row can represent.
- Seven purposes seeded with real notice text. Three required (treatment,
  billing, service messages); marketing, anonymised research, ABHA linking and
  telemedicine are separately refusable. Bundling them would have made every
  consent collected invalid.
- **`POST /auth/register` now refuses a sign-up missing any required purpose**,
  and rolls the whole account back — user row included — when someone under 18
  signs up with no guardian named (**DPDP s.9**).
- Booking a **video** appointment records a per-consultation consent under the
  **Telemedicine Practice Guidelines 2020**, marked
  `implied_patient_initiated` when the patient booked it themselves and written
  not at all when staff did — they have not been asked yet.
- Withdrawal is a write, never a delete, and requires no permission: DPDP
  requires it to be as easy as granting, so it does not route through staff.
- Frontend: a consent step on the sign-up wizard rendering the fetched notice,
  and a `ConsentSettings` panel on the patient profile.

#### Sessions — sign-ins the server can end

`sessions`, with short-lived access tokens bound to a revocable row.

- A JWT cannot be recalled. Signed for seven days it stayed valid for seven
  days — after a dismissal, a password reset, or a hospital suspension.
  Permissions were already immune (resolved per request in `authz.py`);
  identity was not.
- Access tokens are now **15 minutes** and carry a `sid` claim checked on every
  request. Refresh tokens are opaque, stored hashed, and rotate on every use.
- Rotation makes a stolen refresh token *visible*: presenting an already-used
  one is treated as theft and revokes the whole session family.
- Sessions are cut on role change, password reset, user deletion, hospital
  suspension or deletion, `POST /auth/logout`, and `POST /auth/logout-all`.
  Suspension previously blocked new sign-ins while leaving everyone already
  inside for up to a week.
- Login throttling counts recent failures out of the audit trail rather than a
  separate counter, so the lockout rests on the same evidence an investigator
  reads. Both thresholds are scoped to the source address, so no one can lock a
  user out of their own account by failing on their behalf.
- Frontend renews silently on 401, serialising concurrent refreshes — without
  that, parallel dashboard queries would each refresh with the same token and
  trip the theft detection.

### Fixed

- **Refresh-token rotation was not atomic.** `sessions.exchange()` did a
  read-then-write, so two simultaneous refreshes both passed the "not yet
  rotated" check and both minted live sessions — meaning a thief racing the real
  client would succeed rather than be detected. Now claimed with a conditional
  `UPDATE ... WHERE rotated_at IS NULL`.

### Changed

- `AuthResponse` gained `refreshToken` and `expiresIn`. `/auth/me` mints a token
  off the existing session and returns no refresh token, so polling it cannot
  fan out sessions.
- `RegisterRequest` gained `consents`, `guardianName`, `guardianRelationship`,
  and now forwards `dateOfBirth` / `gender` / `bloodGroup`.

### Breaking

- **Every user is signed out once.** Tokens minted before this have no `sid`
  claim and are rejected. Accepting them would have left exactly the
  unrevocable credential the change removes.
- **`JWT_EXPIRE_MINUTES` is gone**, replaced by `ACCESS_TOKEN_MINUTES` (15) and
  `REFRESH_TOKEN_DAYS` (7). An existing `.env` still setting the old name is
  ignored and silently gets the new defaults — update it.
- **Any client posting to `/auth/register` without `consents` now gets a 400.**
  The web app is updated; anything else calling that endpoint is not.

### Migration notes

- Three migrations, applied in order: `f7a3c02e8d41` (audit trail),
  `a1d4e7b02f95` (consent), `b5e91c73a0d8` (sessions).
- **Patients created before this have no consent rows**, so the profile panel
  shows every switch off. A backfill decision is needed: recording a
  migration-time consent is defensible for `treatment` and `billing` and weak
  for the optional purposes, so prompting on next login is the safer choice.
- **Wire an alert to audit-write failures before go-live.** A failed audit write
  logs to stderr and lets the request succeed — a clinician who cannot open a
  chart because the audit table is full is worse than a gap in the trail — but
  silent audit loss is what an inspection looks for.
- Nothing purges. `audit.purge_older_than()` and `sessions.purge_expired()`
  exist and are called by nothing; retention floors conflict (CERT-In 180 days,
  NMC three years for the underlying record, medico-legal cases longer), so the
  number is the operator's to choose.
- The audit trail is not yet tamper-evident. The API is read-only, but a
  database user with `UPDATE`/`DELETE` can still edit rows; append-only
  enforcement is what turns a trail into evidence.

### Still open before ABDM / NABH

ABHA / HFR / HPR identifiers, ICD-10 and LOINC coding, the retention and erasure
lifecycle with patient record export, drug-schedule classification, NMC
registration verification, and a PCPNDT guard on the ANC module.

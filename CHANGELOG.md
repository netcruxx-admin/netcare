# Changelog

Notable changes to CarbonHealth. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed — department_id crossed tenants

`b2d4f6a8c0e1` added `department_id` to `DoctorUpdate` and `UserCreate` without
a guard, so a hospital could file its own doctor under another hospital's
department. Both handlers now call `assert_body_in_tenant()`. Caught by
`test_every_fk_carrying_schema_has_a_guarded_handler`, which derives the risky
schemas from `schemas.py` — nobody had to write a case for `department_id`.

### Fixed — cross-tenant data leak (critical)

**Hospital A could read hospital B's patient name and phone number.**

Tenant scoping protected what a caller could *read*; nothing checked what they
could *reference*. Creates took foreign keys straight from the request body, so
hospital A could file an appointment in its own tenant naming hospital B's
`patient_id` — and `patient_display()` / `doctor_display()` were not
tenant-scoped either, so those ids were then resolved to real names and phone
numbers and rendered into A's appointment list. Confirmed live in a test before
the fix: `'patientName': 'Patient beta', 'patientPhone': '9000000000'`.

Fixed at both layers, because either alone leaves a hole:

- `tenancy.assert_in_tenant()` — refuses a single id that is not the caller's.
- `tenancy.assert_body_in_tenant()` — walks every foreign key on a request body
  against a central `field -> model` map, recursing into nested models and lists
  (a test order carries its test ids inside `items`, which a top-level-only
  guard sails past). Applied to **18 handlers**.
- `patient_display()`, `doctor_display()` and `attach_patient_names()` now take
  a tenant and filter on it, so the disclosure is blocked even where a foreign
  id reaches a row by some other route.

Why it went unnoticed: most creates splat `**body.model_dump()` onto the model,
so the foreign key never appears in the router source at all. Grepping for
`body.patient_id` finds nothing while the id still lands on the row. And with a
single tenant the bug is invisible by construction.

### Added — test suite (first tests in the project)

**`npm test`** — 48 tests against a throwaway database, built entirely through
the public API so a break in provisioning fails the suite rather than hiding
behind hand-made fixtures.

- **Tenant isolation** (25): two fully-populated hospitals, one `maternity` and
  one `multi-specialty` — which doubles as proof that category is a provisioning
  template and not a runtime branch. Collections, detail routes, writes,
  caller-supplied filters, free-text search, login, cross-tenant tokens, the
  audit trail and consent records are each checked for leakage. Reads run as the
  **nurse**, deliberately: a doctor's `own` scope filters by ownership before
  tenancy is reached, which would mask a leak rather than expose it.
- **Foreign-key scoping** (12), including a static-analysis test that derives the
  risky request schemas from `schemas.py` and asserts every consuming handler
  calls a guard — so the next endpoint cannot quietly reopen the hole.
- **Onboarding departments** (8).

Every runtime test was verified by disabling the guard and confirming it fails.
That caught two tests passing on a wrong path (`/lab-orders` does not exist; the
route is `/test-orders`) which had been proving nothing.

### Added — department selection at onboarding

Departments were seeded from the category template with no choice offered. That
is defensible for `maternity` and wrong for `multi-specialty`, which implies
almost nothing about which units a hospital runs — and a seeded department
nobody staffs is still bookable, so reception could put a patient into an empty
one.

- `departments` on `HospitalCreate`: omit it and the template seeds exactly as
  before; send a list and it replaces the template outright.
- Refuses an empty list, blank-only names, and case-insensitive duplicates. A
  hospital with no departments cannot take a booking at all.
- `GET /hospitals/meta/onboarding?category=…` now returns
  `suggestedDepartments`, so the wizard pre-ticks from one copy of the rule
  rather than restating the template in TypeScript.
- New wizard step: pre-ticked suggestions, untickable, with custom departments
  allowed — no catalog to validate against, since a hospital should not wait for
  us to have heard of a speciality before it can have one.

### Fixed — production deployment blockers

- **`next build` failed outright.** `/login` used `useSearchParams()` with no
  Suspense boundary, so the production build exited 1 and there was no
  deployable artifact. Split into a boundary with a fallback that mirrors the
  page chrome.
- **Subdomain routing did not work on a real domain.** `middleware.ts` only
  recognised `.localhost`, and its platform-console redirect hardcoded
  `hostname = 'localhost'` — which would have redirected production users to
  their own machine. Rewritten to derive the platform host by dropping the
  tenant label, so it works on `hospA.netcare.co.in` and locally without
  branching. The `x-hospital-subdomain` cookie it set was read nowhere and is
  gone.
- **The apex resolved as a tenant.** All three resolvers read `netcare.co.in` as
  a hospital called "netcare" — harmless only until someone onboards that
  subdomain, at which point the platform's own front door starts resolving to a
  real hospital. `ROOT_DOMAIN` / `NEXT_PUBLIC_ROOT_DOMAIN` now name the apex.
  The host cannot infer it: a three-label host is either an apex on a compound
  suffix (`netcare.co.in`) or a tenant on a simple one (`hospa.netcare.in`).
- `Hospital.category` no longer defaults to `"maternity"`. The category decides
  modules, departments and licences, so a row arriving without one would have
  silently become a maternity hospital.

### Changed

- `alembic.ini` gained `path_separator = os` (silences an Alembic 1.16 warning).
- `pytest` and `httpx2` added to `requirements.txt` — the isolation suite is not
  optional, since with one tenant every isolation bug is invisible.

### Deployment note

`resolve_public_tenant` reads the **request host**, so the API must be reachable
on the tenant's own hostname — `hospA.netcare.co.in/api/...` behind a path
proxy. Serving it from `api.netcare.co.in` resolves every request to the label
"api", which is no hospital, and **no tenant user can sign in**.

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

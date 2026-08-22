# Changelog

Notable changes to CarbonHealth. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added — a hospital's own logo, on their own subdomain

Every tenant saw the NetCare mark. `DashboardShell` and the login page both
hardcoded `/logo/logo-icon.png`, and the only way to record a logo at all was a
free-text "Logo URL" field pointing at something hosted elsewhere.

`PUT /hospitals/me/logo` uploads one, `DELETE` clears it, both gated on
`hospital.profile.manage` with the tenant taken from the token. Uploading again
replaces rather than accumulates, and the old file is deleted only after the new
row is committed — the other order risks losing the bytes while the row still
points at them. Images only: the document allowlist accepts PDF, which is right
for a scan of a licence and wrong for an `<img>` on every page.

**The logo had to become public.** A tenant's login page shows it before anyone
has signed in, so there is no session to read a profile with. `HospitalOut` now
carries `logo_url`, populated from the profile by `GET /hospitals/current` — the
endpoint that already resolves a tenant from the host subdomain. Branding assets
are resolved through `storage.public_url()` on the way out, like documents.

Screens fall back to the platform mark when a hospital has not uploaded one, so
an unbranded tenant still looks finished. The settings screen's logo control
sits outside the Formik form on purpose: a file uploads the moment it is chosen,
and pairing it with a Save button would misstate when the change lands.

Nine tests, including that a nurse cannot change it and that one hospital never
receives another's.

### Fixed — a negative restock drove stock below zero

`POST /inventory/restock` took any integer. Restocking `-100` returned 201, left
stock at `-90`, and filed the movement under `restock` — a trail saying the
opposite of what happened, and a figure that makes low-stock lists and any
valuation meaningless.

Restock quantity must now be at least 1, and an adjustment may not be zero (it
would write a movement recording that nothing happened). Removing stock is an
adjustment, which says *which* kind — `expired`, `returned`, `adjustment` —
and still floors at zero.

The inventory screen already enforced both rules. Only the API was open, so
anything not going through that form could corrupt the count.

### Added — the pharmacist has a dashboard, and prescriptions reach the queue

**A prescription can be dispensed.** `prescriptions` and `medication_orders`
were two disconnected systems: a doctor's prescription was something the
pharmacist could look at and not act on, and getting it dispensed meant
retyping the drug, dose and frequency as a new order. `medication_orders`
now carries `prescription_id` (`a4d9e21b6c37`), and the pharmacist's
prescriptions screen has a *Send to dispense queue* action.

It asks two things the prescription cannot answer: which catalogue medicine
this is (stock moves against that item, and the name match is only a guess) and
how many units — a prescription records the dose, not the count. Rows already
queued show as such, and the server refuses the same prescription twice, since
queueing it twice would dispense it twice and take the stock twice. Cancelling
an order frees it again.

**A hardcoded role check became a permission.** `create_medication_order`
raised *"Only doctors may raise medication orders"* for any caller without a
Doctor row — so `medication_orders.manage`, granted to pharmacist, returned 403.
The permission is now the authorization; whose name goes on the order is a
separate question with a separate answer: the caller's own id when they are a
doctor (always, over anything the body claims), an explicit `doctorId`
otherwise, and 422 if neither.

**A pharmacist dashboard.** Every other role had one; pharmacists fell through
to `GenericDashboard` — a grid of links, functional but generic. Now: to
dispense / dispensed / low stock / out of stock, a restocking panel, and the
queue oldest-first. Low stock sits above the queue deliberately — with
dispensing now refusing on short stock, finding out at the counter is worse
than knowing before the patient arrives.

**Two grants the screens already assumed.** `/dashboard/inventory` listed admin
in its route table while admin held no inventory grant, so the nav item was
filtered out and the URL redirected; admin now holds `inventory.read`, with
restock and write-off still gated on `inventory.manage`. And superadmin can
manage medicines, which it could not while supporting a tenant.

### Fixed — dispensing moved stock by one unit, whatever the order said

An order for "500mg, twice daily, 5 days" — ten tablets — deducted **one** from
stock. `dispense_order` had `med.stock - 1` hardcoded, because there was nothing
else to deduct: dosage, frequency and duration are free text for the label and
no column held a number. Inventory drifted on the first dispense and never
recovered, and everything built on that figure (low-stock alerts, reorder
levels) was wrong by roughly an order of magnitude.

`medication_orders.quantity` (`f3c81a05d7b2`) is that number. Existing rows get
1, which is what dispensing them would have done anyway, so no history changes.

Two behaviours changed with it:

  * **Short stock is refused, not ignored.** The old guard was
    `if med.stock > 0`, which marked the order dispensed while moving no stock
    and writing no inventory row — a discrepancy with nothing to explain it. It
    now answers 409 naming both numbers.
  * **Expired stock is refused.** `Medicine.expiry_date` existed and nothing
    consulted it. A blank expiry still dispenses: nobody recording one is not
    the same as it having passed.

The status is set *after* the stock check, so a refusal leaves the order
pending and dispensable once the shelf is restocked.

### Added — a hospital admin can see their own record and edit what they own

`/dashboard/hospital-settings` existed but only configured the lunch break, and
everything else about a hospital was gated on `hospitals.manage` — the
platform's permission. An admin had no way to read their own address, let alone
correct a phone number.

Two capabilities (`e5b73c02a94f`), split because reading and writing are
different questions:

  * `hospital.profile.read` — see everything recorded about your own hospital,
    **including the parts only the platform can change**. Being unable to edit
    the GSTIN is not a reason to be unable to read it; noticing it is wrong is
    the first step to asking for it to be fixed.
  * `hospital.profile.manage` — edit address, contacts, owner and medical
    director, facilities and bed counts, scheduling, branding assets, and the
    hospital's own name and tagline.

Both endpoints take the tenant from the caller's token and carry **no id in the
URL**, so there is nothing to point at another hospital.

What stays with the platform, and why:

  * **Legal identity** (registration no, PAN, GSTIN, HFR, NABH) and the
    licences. These are attestations, not claims: `verified_at`/`verified_by`
    record that we checked them against the uploaded scans. If they could be
    edited afterwards, `verified_at` would assert "we checked this" about a
    value that has since changed. Changing one is a re-submission.
  * **subdomain, category, modules, status, onboarding_status** — the subdomain
    *is* the tenancy, and the rest is what the hospital is paying for.
  * **invoice/MRN prefixes and financial year start.** Nothing reads these yet,
    which is exactly why they are locked now: once numbering is wired up a
    mid-flight prefix change splits the series, and a GST invoice number must be
    sequential and unique within the financial year. Cheaper to never grant than
    to withdraw.

`schemas.HospitalSelfUpdate` **is** the allowlist — written out field by field
rather than derived from `HospitalProfileBase`, because a subclass that excluded
fields would silently re-admit them the next time the base grew one. Nine tests
send the forbidden fields anyway and assert the values did not move.

The screen shows registered identity read-only at the top, the editable
sections below, and licences, documents and plan read-only at the bottom. The
form is wrapped in a disabled fieldset for a caller holding read but not manage,
so they get a real view instead of a dead form.

Not included, deliberately: letting an admin upload a renewed licence scan. It
is a genuine workflow, but done properly it has to push `onboarding_status` back
to `documents_submitted` so the platform re-verifies, rather than quietly
swapping a file behind a `verified` badge.

### Fixed — storage tests asserted a design that is no longer on the branch

`tests/test_storage_r2.py` was written against a storage seam where the stored
URL and the served URL were different strings. The implementation that landed
in `fa6e598` keeps them the same and adds `public_url()` only to rescue legacy
`r2://` rows, so five tests failed and `npm test` was red.

They now assert what the code does: a public bucket stores the public URL and
`public_url()` is identity; a legacy `r2://` row is signed on the way out, or
resolved against `R2_PUBLIC_URL` when one is set; a failed signature falls back
to the stored value rather than raising through the handler; the size ceiling,
the empty-file refusal and the content-type allowlist each upload nothing when
they trip.

Two behaviours are deliberately left as they are, and are worth a look rather
than a test that blesses them:

  * with `R2_PUBLIC_URL` unset, `save_upload` stores
    `https://{account}.r2.cloudflarestorage.com/{bucket}/{key}` and notes that
    it "requires bucket to be public" — on a private bucket that is a link
    which always 401s, stored permanently in the database;
  * `delete_file` returns early without deleting when `R2_PUBLIC_URL` is empty,
    so the object outlives the row it belonged to.

Neither bites while the bucket is public. Both bite the day it is not.

### Added — a View action on every table that had none

Ten list screens offered Edit and Delete but no way to simply look at a row, so
anything that did not fit in the columns was reachable only by opening the edit
form. `components/RecordDialog.tsx` is one read-only detail dialog they all
share: label/value pairs, long text spanning both columns, Escape and backdrop
to close.

Deliberately not the edit modal in a disabled state. A greyed-out form reads as
"you may not touch this" when the point is only to look — and it means a role
holding read but not manage gets a real view rather than a dead form.

Empty fields are shown as `—` rather than dropped: "Expiry —" says the field
exists and is blank, while omitting the row leaves the reader wondering whether
the system tracks it at all.

Covered: medicines, lab tests, lab catalog, inventory, departments, doctors
(hospital + platform), users (hospital + platform), hospitals. Each dialog
carries the fields the table has no room for — a medicine's lot number and
expiry, a doctor's licence and council, a hospital's PAN/GSTIN/HFR and enabled
modules, a lab test's parameter template.

One behaviour change worth noting: on six of these tables the whole Actions
column was gated behind `canManage`, so a read-only viewer saw no column at
all. The column now always renders, with View always present and Edit/Delete
still gated.

### Changed — department CRUD is the platform's too

`departments.manage` moved from `admin` to `superadmin` (`d7a2c5f81e64`), and
`/dashboard/departments` is now a platform screen. Departments are the spine of
booking — appointments are filed into them, doctors belong to them — so renaming
or deleting one on a live tenant reaches records already pointing at it.

`departments.read` **stayed** with admin, and that distinction is the whole
change. The department list is read by the admin overview, the appointments
board, the doctors list and both doctor modals, and those modals write
`department_id`. Revoking read to hide one screen would have broken creating a
doctor. So the route now gates on `departments.manage` rather than
`departments.read`, which is the capability the screen actually exercises.

- `components/departments/AdminDepartments.tsx` deleted; `PlatformDepartments`
  already ran cross-tenant against `/superadmin/departments` and needs no `?h=`.
- `/dashboard/departments` joined `platformOnlyPaths` and the inlined copy in
  `middleware.ts`.
- Six tests, written as real requests rather than grant lookups — hiding a
  screen in the route table proves nothing while the URL is still typeable and
  the API is still listening. Admin gets 403 on create/rename/delete and 200 on
  the list; superadmin runs the full cycle; a cross-tenant id still refuses
  without confirming it exists.

### Changed — Hospital Setup is the platform's screen now

`/dashboard/setup` picks a hospital's category template and **replaces its
entire department list**, deleting departments that live appointments are booked
into. That is a provisioning decision, so `hospital.settings.manage` moved from
`admin` to `superadmin` (`c4e8b1d90f36`, granting before revoking so the
capability is never held by nobody).

Hospital admins lose the category picker and the template bulldozer. They keep
`departments.read` and `departments.manage`, so they still run their own
departments from `/dashboard/departments` — the move takes away the wholesale
rewrite, not day-to-day department management.

Because a platform user has no tenant of their own, the screen had to change
shape as well as ownership:

- The target hospital comes from the sidebar's `?h=` selector rather than the
  host subdomain. `useActiveHospital()` reads `GET /hospitals/current`, which
  resolves from the host and ignores `X-Hospital-Id` in production by design —
  on the platform's apex domain it would have rendered blank.
- With no hospital chosen, the screen says so instead of firing department
  queries the backend answers with a 400.
- Applying a template now asks first, naming the hospital and the number of
  departments about to be deleted. The operator running it is not the hospital
  that loses them.
- `/dashboard/setup` joined `platformOnlyPaths` (and the inlined copy in
  `middleware.ts`), so reaching it from a tenant subdomain redirects to the
  platform host — where the selector it depends on actually exists.
- `components/setup/AdminSetup.tsx` → `HospitalSetup.tsx`.

Four tests pin the grant, including that admins kept department management —
the grant lives in data, so nothing in the source would otherwise stop a later
migration moving it back.

### Added — Cloudflare R2 storage backend

`STORAGE_BACKEND=r2` puts uploaded registration documents in a Cloudflare R2
bucket over its S3-compatible API; `local` (the default) is unchanged and still
dev-only. Everything above `app/storage.py` was already written not to care.

The one thing that *is* new above the seam: on R2 the URL stored in the database
and the URL handed to a browser are different strings. Stored is an opaque,
stable `r2://folder/name`; outgoing is a presigned link with a 15-minute life,
attached by `storage.public_url()` in the four places that return a document or
licence row. Deliberately not the same string — a stored URL that expires is a
document nobody can open again, and a stored URL that never expires is a scan of
a medical licence readable by anyone who ever saw the link.

The bucket stays **private** by default. `R2_PUBLIC_BASE_URL` opts into an
unsigned public custom domain, which is right for a logo and wrong for a PAN
card.

Consequences worth knowing:

- `PATCH /hospitals/{id}/licences/{id}` now **ignores** a client-supplied
  `document_url`. Which scan backs a licence is set by the upload that produced
  it; echoing a signed URL back would have stored a link that expires.
- The app refuses to boot on `STORAGE_BACKEND=r2` with incomplete credentials,
  rather than failing on the first upload halfway through an onboarding.
- `/files` is only mounted when this process actually serves the bytes.
- 11 tests stub boto3 and pin the contract: stored URLs stay opaque, outgoing
  ones get signed, the size ceiling uploads nothing when it trips, and a
  signature failure costs one row rather than the whole page.

### Fixed — multi-file document upload dropped every file but one

Step 7 of onboarding handed `onAdd` the live `FileList` off the input and then
cleared `input.value` on the next line, which empties that same FileList. The
copy (`Array.from`) happened inside the `setDocuments` updater, which React runs
later — by then there was nothing left to copy. The handler now snapshots to an
array before resetting, and the prop type is `File[]` so a live list cannot
cross that boundary again. Same bug, same fix, in `EditHospitalWizard`.

Also replaced `crypto.randomUUID()` in both wizards' key generation: it is
undefined outside a secure context, so attaching any document threw the moment
the app was opened over http on a LAN address — which is how the wizard gets
tested from a phone.

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

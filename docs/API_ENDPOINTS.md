# CarbonHealth — API Endpoint Record

Every backend endpoint, the permission that guards it, and which frontend screen
calls it. Also records what the frontend still needs that does not exist yet.

**Status as of 2026-08-02.** 101 endpoints implemented; 12 endpoints outstanding
across 6 capabilities (§4), of which 3 capabilities are launch-blocking.
Regenerate the route/permission table with:

```bash
grep -rn "@router\.\(get\|post\|put\|patch\|delete\)" apps/api/app/routers/
```

---

## 1. How authorization works

Three independent questions, answered separately on every request:

| Question | Answered by | Where |
|---|---|---|
| **Tenant** — whose data? | `hospital_id` from the JWT | `scoped(db, Model, tenant_id)` in `tenancy.py` |
| **Identity** — who is calling? | `get_current_user()` | `auth.py` |
| **Capability** — may they? | `require_permission("patients.read")` | `authz.py` |

Notes that matter when reading the tables below:

- **Permissions are data, not code.** No role name appears in `authz.py`. A
  superadmin can create a role and tick its permissions with no code change.
- **Scope lives on the grant, not the permission.** `patients.read` + `own` and
  `patients.read` + `all` are the same permission at different breadths. The
  handler receives the granted scope and narrows its own query.
- **Effective permissions = role grants ∩ the hospital's enabled modules**,
  resolved per request. Never read from the JWT, so a revoked grant takes effect
  on the very next call.
- **A record that does not exist, or is not yours, returns 404 — never 403.**
  A 403 would confirm the id exists.
- Two guards separated by a comma below (e.g. `patients.manage, profile.manage`)
  mean `require_any_permission(...)`: either one admits you, and the handler
  enforces ownership when only the narrower one matched.

### Tenant resolution

| Request type | Resolver | Rule |
|---|---|---|
| Authenticated | `get_tenant_id` | Locked to `user.hospital_id` from the DB. `X-Hospital-Id` is **ignored** except for a platform superadmin, who must name a target hospital. |
| Pre-login | `resolve_public_tenant` | Host subdomain only in production. `X-Hospital-Id` is honoured **in development only** — on a pre-login request that header is attacker-controlled. |

In production an unrecognised host resolves to **no tenant** rather than falling
back to a default; `/auth/register` refuses outright rather than guessing which
hospital an account belongs to.

### Response conventions

**Nulls never fail a read.** Response models inherit `OutModel`, which coerces a
NULL column to the field's declared default (or the empty value for its type).
Most nullable columns are declared non-optional because the app always writes
`""`/`0` through the ORM — but that is a client-side SQLAlchemy default, not a
`server_default`, so a direct SQL insert, a bulk insert in a migration, or an
imported row writes a real NULL. Without the coercion one such row would 500 the
*entire* list endpoint rather than just that record. Request models deliberately
do **not** inherit this: input stays strict.

### Pagination, search and filtering

**Every collection endpoint** — all 35 of them, including the sub-resources and
the cross-tenant `/superadmin/*` lists — accepts the same three params, from one
shared `list_params` dependency so the convention cannot drift:

| Param | Meaning |
|---|---|
| `q` | Free-text search, case-insensitive substring, applied **server-side** |
| `limit` | Page size. Omit for everything. Capped at `MAX_PAGE_SIZE` (200) |
| `offset` | Rows to skip |

Every response sets **`X-Total-Count`**: rows matching the filters across the
whole result, ignoring the page. It is in the CORS `expose_headers`, or the
browser would hide it from JS.

`limit` defaults to *unlimited*, deliberately. Many screens use these lists as
lookup tables rather than tables — resolving an id to a name — and a default page
size would drop names from the UI rather than page them. Pagination is opt-in per
caller: screens rendering a long table pass a limit, screens building a map do
not. It also means adding all of this changed no existing response.

Search and filtering run on the server for the same reason paging does: once a
page is 50 of 10,000 rows, filtering what already arrived would search one page
and present it as the whole result. Where the searchable text lives on another
table, `q` reaches through the join — `/doctors?q=` and `/users?q=` match the
linked user's name and email, not just the doctor row.

**Search is never a way around a permission.** `q` narrows a query that has
already been tenant-scoped and scope-filtered, so a patient searching the whole
tenant still sees only their own records, and one hospital cannot find another's
rows by name.

#### Filters by endpoint

| Endpoint | Filters (beyond `q` / `limit` / `offset`) |
|---|---|
| `/patients` | `withStats` |
| `/doctors` | `specialization`, `verificationStatus` |
| `/users` | `role` |
| `/appointments` | `patientId`, `doctorId`, `status`†, `departmentId`, `date` |
| `/test-orders` | `patientId`, `doctorId`, `appointmentId`, `status`† |
| `/test-results` | `orderId`† |
| `/vitals`, `/medical-records` | `patientId`, `appointmentId` |
| `/prescriptions` | `patientId`, `appointmentId`, `doctorId` |
| `/payments` | `patientId`, `appointmentId`, `status` |
| `/medicines`, `/lab-tests` | `category` |
| `/permissions` | `resource`, `module` |
| `/hospitals` | `status`, `category` |
| `/schedule-blocks` | `doctorId`, `date`, `type` |
| `/video-slots` | `doctorId`, `date`, `status` |
| `/pregnancies` | `patientId`, `status` |
| `/anc-visits` | `pregnancyId` |
| `/babies` | `motherPatientId` |
| `/superadmin/*` | `hospitalId`, `withStats` (patients) (+ `status` on appointments, `role` on users) |

Endpoints not listed take only the three shared params.

† **Comma-separated.** `?status=completed,reviewed` matches either; so does
`?orderId=ord-1,ord-2`. This exists because screens that mean a *set* were
otherwise fetching everything and discarding rows client-side — the reports
screen wants exactly the two published states, the vitals screen wants anything
but cancelled, and a detail page wants the results for the handful of orders it
is showing.

#### Server-resolved display fields

A paginated table cannot fetch every patient in the hospital just to turn an id
into a name — that would undo the paging it just gained. So the server answers
the question on the row:

| Response | Added fields |
|---|---|
| `AppointmentOut` | `patientName`, `patientPhone`, `doctorName`, `hasVitals` |
| `TestOrderOut` | `patientName`, `hasResults`, `abnormal`, `reportedAt`, `reportedBy` |
| `PrescriptionOut`, `VitalsOut` | `patientName` |
| `PregnancyOut` | `patientName`, `visitCount`, `latestVisit` |
| `BabyOut` | `motherName` |
| `PatientOut` | `visitCount`, `lastVisit`, `nextVisit` — only with `?withStats=true` |

All resolved in batched queries over the rows on the page, never per row. The
same rule drives which ones exist: each replaced a screen that was downloading a
whole table to derive one column. `hasVitals` replaced fetching every vitals
row; `abnormal` and `hasResults` replaced fetching every lab result;
`latestVisit` replaced fetching every antenatal visit.

Where the searchable text lives on the joined row, `q` follows the same joins —
searching `/prescriptions`, `/vitals`, `/pregnancies` or `/babies` by the
patient's (or mother's) name works, because that is the name the screen shows.

#### How the frontend consumes it

| File | Role |
|---|---|
| `store/api.ts` | `*Paged` endpoint per collection. Same URL as the unpaged hook; `transformResponse` reads `X-Total-Count` into `{ items, total }` |
| `hooks/useServerTable.ts` | Owns `search` / `q` / `page` for one table, and **resets to page 1 whenever the result set changes** |
| `hooks/useDebounced.ts` | Holds the search box back 300 ms, so a word is one request rather than one per letter |
| `components/TablePagination.tsx` | The pager. `total` is the server's count, not the rows on screen |
| `components/ExportButton.tsx` | `getRows` refetches the whole filtered set on click, so "Export CSV" does not silently export 20 of 5,000 |

Every table screen passes its filters to `useServerTable` as `filterKey`. That is
the one rule worth stating: **changing a filter must reset the page.** Staying on
page 4 of a result that now has one page shows an empty table and reads as a
broken filter. It happens in the hook rather than in each screen's `onChange`,
where it is easy to forget on the fifth filter.

**21 screens** are server-paged. 19 use `useServerTable`: platform patients /
doctors / appointments / departments / users; hospital patients, users, doctors,
medicines, tests; doctor and nurse appointments; doctor lab orders, lab reports,
test catalog; prescriptions; vitals; pregnancies; newborns. Two — `AdminAppointments`
and the lab's `LabOrders` — were converted before the hook existed and still hold
the equivalent state inline; they behave the same, they just duplicate it.

The unpaged hooks remain, and should: pickers, modals and `RoleModal`-style
lookups want the whole (small) list, and `/roles` is a six-row catalog that would
gain nothing from a pager.

---

## 2. Endpoints by module

Legend: **PUBLIC** = no auth. **(auth only)** = any signed-in user, no specific
permission.

Every `GET` returning a list also accepts `q` / `limit` / `offset` and sets
`X-Total-Count` — see §1 for the per-endpoint filters. Not repeated per row.

### Auth

| Method | Path | Permission | Called by |
|---|---|---|---|
| POST | `/auth/register` | PUBLIC | `/register` |
| POST | `/auth/login` | PUBLIC | `/login` |
| GET | `/auth/me` | (auth only) | `DashboardShell`, `useDashboardGuard` |

`POST /auth/register` accepts `role: "patient"` only (`RegisterRole =
Literal["patient"]`). Staff accounts carry access to other people's records and
are provisioned through `POST /users` by someone holding `users.manage`.

### Hospitals

| Method | Path | Permission | Called by |
|---|---|---|---|
| GET | `/hospitals/current` | PUBLIC | `useActiveHospital` → landing, `/login`, `/register`, `/report/[id]`, `/appointment/[id]`, `/dashboard/setup`, `DashboardShell` |
| GET | `/hospitals` | `hospitals.manage` | `/dashboard/hospitals`, superadmin tenant pickers |
| POST | `/hospitals` | `hospitals.manage` | `/dashboard/hospitals` (onboarding) |
| GET | `/hospitals/{id}` | `hospitals.manage` | — not called |
| PATCH | `/hospitals/{id}` | `hospitals.manage` | `/dashboard/hospitals` |
| DELETE | `/hospitals/{id}` | `hospitals.manage` | — not called |

`GET /hospitals/current` is public by design: branding and module flags are
needed to render the signed-out pages.

### Roles & permissions

| Method | Path | Permission | Called by |
|---|---|---|---|
| GET | `/roles` | `roles.manage` | `/dashboard/roles` |
| GET | `/roles/assignable` | `users.manage` | `/dashboard/users` (role picker) |
| GET | `/roles/{code}` | `roles.manage` | — not called |
| POST | `/roles` | `roles.manage` | `/dashboard/roles` |
| PUT | `/roles/{code}` | `roles.manage` | `/dashboard/roles` |
| DELETE | `/roles/{code}` | `roles.manage` | `/dashboard/roles` |
| GET | `/permissions` | `roles.manage` | `/dashboard/roles` (permission matrix) |

### Users

| Method | Path | Permission | Called by |
|---|---|---|---|
| GET | `/users` | `users.read` | `/dashboard/users` |
| POST | `/users` | `users.manage` | `/dashboard/users` |
| PUT | `/users/me` | `profile.manage` | `/dashboard/profile` |
| PUT | `/users/{id}` | `users.manage` | `/dashboard/users` |
| DELETE | `/users/{id}` | `users.manage` | `/dashboard/users` |

`PUT /users/me` is name/email/phone only — deliberately not role or password, so
self-service can never widen your own access.

### Patients

| Method | Path | Permission | Called by |
|---|---|---|---|
| GET | `/patients` | `patients.read` | `/dashboard/patients` (paged), `/book`, `/vitals`, `/prescriptions`, `/reports`, `/schedule`, `/pregnancies`, `/babies`, `/completed`, `/video-consults` |
| GET | `/patients/by-user/{userId}` | `patients.read` | `/dashboard/medical-history`, `/babies`, `/pregnancies`, `/book`, `/video-consults` |
| GET | `/patients/{id}` | `patients.read` | `/patient/[id]`, `/consult/[id]`, `/appointment/[id]`, `/report/[id]` |
| PUT | `/patients/{id}` | `patients.manage`, `profile.manage` | `/dashboard/patients`, `/dashboard/profile` |
| DELETE | `/patients/{id}` | `patients.manage` | `/dashboard/patients` |
| GET | `/patients/{id}/appointments` | `appointments.read` | `/patient/[id]`, `/dashboard` |
| GET | `/patients/{id}/medical-records` | `medical_records.read` | `/dashboard/medical-history` |
| GET | `/patients/{id}/payments` | `payments.read` | `/dashboard/payments` |
| GET | `/patients/{id}/prescriptions` | `prescriptions.read` | `/dashboard/records`, `/patient/[id]` |
| GET | `/patients/{id}/vitals` | `vitals.read` | `/dashboard/records`, `/patient/[id]` |

`patients.read` with scope `own` means two things at once: the patient record you
*are*, plus any patient you have an appointment with. Without the second arm a
doctor with an `own` grant would see an empty patient list.

### Doctors

| Method | Path | Permission | Called by |
|---|---|---|---|
| GET | `/doctors` | `doctors.read` | `/dashboard/doctors`, `/book`, `/schedule`, `/vitals`, `/reports`, `/patient/[id]`, `/video-consults` |
| GET | `/doctors/by-user/{userId}` | `doctors.read` | `/dashboard/profile`, `/appointments`, `/patients`, `/schedule`, `/pregnancies`, `/video-consults` |
| GET | `/doctors/{id}` | `doctors.read` | `/consult/[id]`, `/appointment/[id]`, `/report/[id]` |
| PUT | `/doctors/{id}` | `doctors.manage`, `profile.manage` | `/dashboard/doctors`, `/dashboard/profile` |
| DELETE | `/doctors/{id}` | `doctors.manage` | `/dashboard/doctors` |
| GET | `/doctors/{id}/appointments` | `appointments.read` | — not called |
| GET | `/doctors/{id}/availability` | `appointments.create` | `/dashboard/book` |

`GET /doctors/{id}/availability` exists because a patient booking a slot needs to
know which times are taken, but may not read other people's appointments. It
answers the question — returning taken times and schedule blocks — rather than
handing over the records.

### Appointments

| Method | Path | Permission | Called by |
|---|---|---|---|
| GET | `/appointments` | `appointments.read` | `/dashboard/appointments` (paged), `/dashboard`, `/completed`, `/schedule`, `/vitals`, `/video-consults` |
| GET | `/appointments/stats` | `appointments.read` | `/dashboard/appointments` (summary tiles) |
| POST | `/appointments` | `appointments.create` | `/dashboard/book`, `/video-consults` |
| GET | `/appointments/{id}` | `appointments.read` | `/appointment/[id]`, `/consult/[id]` |
| PUT | `/appointments/{id}` | `appointments.manage` | `/dashboard/appointments`, `/appointment/[id]`, `/consult/[id]` |
| DELETE | `/appointments/{id}` | `appointments.manage` | `/dashboard/appointments`, `/appointment/[id]` |

The client never sends `rescheduled` — the server raises that flag when the date
or time moves. Facts about what happened are the server's to write.

### Departments

| Method | Path | Permission | Called by |
|---|---|---|---|
| GET | `/departments` | `departments.read` | `/dashboard/departments`, `/book`, `/profile`, `/setup`, `/patient/[id]`, `/video-consults` |
| POST | `/departments` | `departments.manage` | `/dashboard/departments`, `/dashboard/setup` |
| PUT | `/departments/{id}` | `departments.manage` | `/dashboard/departments` |
| DELETE | `/departments/{id}` | `departments.manage` | `/dashboard/departments`, `/dashboard/setup` |

### Clinical records

| Method | Path | Permission | Called by |
|---|---|---|---|
| GET | `/medical-records` | `medical_records.read` | `/appointment/[id]` |
| POST | `/medical-records` | `medical_records.manage` | `/consult/[id]` |
| GET | `/prescriptions` | `prescriptions.read` | `/dashboard/prescriptions`, `/appointment/[id]` |
| POST | `/prescriptions` | `prescriptions.manage` | `/dashboard/appointments` |
| GET | `/vitals` | `vitals.read` | `/dashboard/vitals`, `/appointments`, `/dashboard`, `/appointment/[id]` |
| POST | `/vitals` | `vitals.record` | `/dashboard/vitals`, `/dashboard/appointments` |

### Payments

| Method | Path | Permission | Called by |
|---|---|---|---|
| GET | `/payments` | `payments.read` | `/dashboard` |
| POST | `/payments` | `payments.manage` | — **not called** |
| PUT | `/payments/{id}` | `payments.manage` | — **not called** |

**This module is effectively unwired.** See §4 item 1.

### Lab

| Method | Path | Permission | Called by |
|---|---|---|---|
| GET | `/lab-tests` | `lab_tests.read` | `/dashboard/tests`, `/lab-orders`, `/appointments` |
| POST | `/lab-tests` | `lab_tests.manage` | `/dashboard/tests` |
| PUT | `/lab-tests/{id}` | `lab_tests.manage` | `/dashboard/tests` |
| DELETE | `/lab-tests/{id}` | `lab_tests.manage` | `/dashboard/tests` |
| GET | `/test-orders` | `lab_orders.read` | `/dashboard/lab-orders` (paged), `/reports`, `/dashboard`, `/patient/[id]`, `/appointment/[id]` |
| POST | `/test-orders` | `lab_orders.create` | `/dashboard/appointments` |
| GET | `/test-orders/{id}` | `lab_orders.read` | `/report/[id]` |
| PUT | `/test-orders/{id}` | `lab_orders.process` | `/dashboard/lab-orders` |
| PUT | `/test-orders/{id}/review` | `lab_orders.review` | `/dashboard/lab-orders` |
| DELETE | `/test-orders/{id}` | `lab_orders.process` | `/dashboard/lab-orders` |
| GET | `/test-results` | `lab_reports.read` | `/dashboard/lab-orders`, `/reports`, `/patient/[id]`, `/report/[id]`, `/appointment/[id]` |
| POST | `/test-results` | `lab_orders.process` | `/dashboard/lab-orders` |

`lab_orders.review` is the ordering clinician's sign-off — a narrower act than
the lab's own processing, so it is a separate permission rather than a widening
of `lab_orders.process`. Result timestamps are set server-side.

### Medicines

| Method | Path | Permission | Called by |
|---|---|---|---|
| GET | `/medicines` | `medicines.read` | `/dashboard/medicines`, `/appointments`, `/appointment/[id]` |
| POST | `/medicines` | `medicines.manage` | `/dashboard/medicines` |
| PUT | `/medicines/{id}` | `medicines.manage` | `/dashboard/medicines` |
| DELETE | `/medicines/{id}` | `medicines.manage` | `/dashboard/medicines` |

### Scheduling & telemedicine

| Method | Path | Permission | Called by |
|---|---|---|---|
| GET | `/schedule-blocks` | `schedule.read` | `/dashboard/schedule`, `/book`, `/appointments` |
| POST | `/schedule-blocks` | `schedule.manage` | `/dashboard/schedule` |
| DELETE | `/schedule-blocks/{id}` | `schedule.manage` | `/dashboard/schedule` |
| GET | `/video-slots` | `video_consults.join` | `/dashboard/video-consults` |
| POST | `/video-slots` | `schedule.manage` | `/dashboard/video-consults` |
| POST | `/video-slots/{id}/book` | `video_consults.join` | `/dashboard/video-consults` |
| DELETE | `/video-slots/{id}` | `schedule.manage` | `/dashboard/video-consults` |

Booking a video slot raises the invoice server-side.

### Maternity & newborn

| Method | Path | Permission | Called by |
|---|---|---|---|
| GET | `/pregnancies` | `pregnancies.read` | `/dashboard/pregnancies` |
| POST | `/pregnancies` | `pregnancies.manage` | `/dashboard/pregnancies` |
| GET | `/pregnancies/{id}` | `pregnancies.read` | — not called |
| PUT | `/pregnancies/{id}` | `pregnancies.manage` | — **not called** (no edit UI) |
| GET | `/anc-visits` | `pregnancies.read` | `/dashboard/pregnancies` |
| POST | `/anc-visits` | `pregnancies.manage` | `/dashboard/pregnancies` |
| GET | `/babies` | `babies.read` | `/dashboard/babies` |
| POST | `/babies` | `babies.manage` | `/dashboard/babies` |
| GET | `/babies/{id}` | `babies.read` | — not called |
| GET | `/babies/{id}/growth` | `babies.read` | `/dashboard/babies` |
| POST | `/babies/{id}/growth` | `babies.manage` | `/dashboard/babies` |
| GET | `/babies/{id}/immunizations` | `babies.read` | `/dashboard/babies` |
| POST | `/babies/{id}/immunizations` | `babies.manage` | `/dashboard/babies` |
| PUT | `/babies/{id}/immunizations/{immId}/given` | `babies.manage` | `/dashboard/babies` |

### Platform (cross-tenant)

| Method | Path | Permission | Called by |
|---|---|---|---|
| GET | `/superadmin/overview` | `platform.read` | `/dashboard` |
| GET | `/superadmin/patients` | `platform.read` | `/dashboard/patients` |
| GET | `/superadmin/doctors` | `platform.read` | `/dashboard/doctors` |
| GET | `/superadmin/appointments` | `platform.read` | `/dashboard/appointments` |
| GET | `/superadmin/departments` | `platform.read` | `/dashboard/departments` |
| GET | `/superadmin/users` | `platform.read` | `/dashboard/users` |
| PUT | `/superadmin/patients/{id}` | `patients.manage` | — not called |

---

## 3. Endpoints by page

Every screen and the endpoints behind it. All data goes through
`apps/web/store/api.ts` (RTK Query); no component reads a store directly.

### Public

| Page | Endpoints |
|---|---|
| `/` (landing) | `GET /hospitals/current` |
| `/login` | `GET /hospitals/current`, `POST /auth/login` |
| `/register` | `GET /hospitals/current`, `POST /auth/register` |
| `/appointment/[id]` | `GET /appointments/{id}`, `/doctors/{id}`, `/patients/{id}`, `/medical-records`, `/prescriptions`, `/vitals`, `/test-orders`, `/test-results`, `/medicines`, `/hospitals/current` · `PUT`+`DELETE /appointments/{id}` |
| `/patient/[id]` | `GET /patients/{id}` + `/appointments`, `/prescriptions`, `/vitals` · `GET /departments`, `/doctors`, `/test-orders`, `/test-results` |
| `/report/[id]` | `GET /test-orders/{id}`, `/test-results`, `/patients/{id}`, `/doctors/{id}`, `/hospitals/current` |

### Dashboard

| Page | Endpoints |
|---|---|
| `/dashboard` | `/superadmin/overview`, `/appointments`, `/patients`, `/doctors`, `/departments`, `/payments`, `/vitals`, `/test-orders`, `/hospitals`, `/hospitals/current`, `/doctors/by-user/{id}`, `/patients/{id}/appointments` |
| `/dashboard/appointments` | **paged** `/appointments` + `/appointments/stats`, `/doctors`, `/departments`, `/schedule-blocks` · `PUT`+`DELETE /appointments/{id}` · `POST /vitals` |
| `/dashboard/book` | `POST /appointments` · `/doctors/{id}/availability`, `/departments`, `/doctors`, `/patients`, `/patients/by-user/{id}`, `/hospitals`, `/schedule-blocks` |
| `/dashboard/completed` | `/appointments`, `/patients` |
| `/dashboard/consult/[id]` | `/appointments/{id}`, `/doctors/{id}`, `/patients/{id}` · `POST /medical-records` · `PUT /appointments/{id}` |
| `/dashboard/patients` | **paged** `/patients?withStats=true` — one request, nothing else |
| `/dashboard/doctors` | `/doctors`, `PUT`+`DELETE /doctors/{id}`, `/departments`, `/hospitals`, `/superadmin/doctors` |
| `/dashboard/users` | `/users` (list/create/update/delete), `/roles/assignable`, `/hospitals`, `/superadmin/users` |
| `/dashboard/roles` | `/roles` (list/create/update/delete), `/permissions` |
| `/dashboard/hospitals` | `/hospitals`, `PATCH /hospitals/{id}` |
| `/dashboard/departments` | `/departments` (list/create/update/delete), `/hospitals`, `/superadmin/departments` |
| `/dashboard/payments` | `GET /patients/{id}/payments` |
| `/dashboard/profile` | `PUT /users/me`, `/doctors/by-user/{id}`, `PUT /doctors/{id}`, `/departments` |
| `/dashboard/lab-orders` | **paged** `/test-orders` (+ update/delete/review), `/test-results` (list/upsert), `/lab-tests` |
| `/dashboard/tests` | `/lab-tests` (list/create/update/delete) |
| `/dashboard/reports` | `/test-orders`, `/test-results`, `/patients`, `/doctors` |
| `/dashboard/records` | `/patients/{id}/prescriptions`, `/patients/{id}/vitals` |
| `/dashboard/medical-history` | `/patients/by-user/{id}`, `/patients/{id}/medical-records` |
| `/dashboard/prescriptions` | `/prescriptions`, `/patients` |
| `/dashboard/medicines` | `/medicines` (list/create/update/delete) |
| `/dashboard/vitals` | `/vitals` (list/create), `/appointments`, `/patients`, `/doctors` |
| `/dashboard/schedule` | `/schedule-blocks` (list/create/delete), `/appointments`, `/doctors`, `/patients`, `/doctors/by-user/{id}` |
| `/dashboard/video-consults` | `/video-slots` (list/create/book/delete), `/appointments`, `/patients`, `/doctors`, `/departments` |
| `/dashboard/pregnancies` | `/pregnancies` (list/create), `/anc-visits` (list/create), `/patients`, `/patients/by-user/{id}`, `/doctors/by-user/{id}` |
| `/dashboard/babies` | `/babies` (list/create), `/babies/{id}/growth`, `/babies/{id}/immunizations` (+ mark-given), `/patients` |
| `/dashboard/setup` | `/hospitals/current`, `/departments` (list/create/delete) |

### Cross-cutting

| Component | Endpoints |
|---|---|
| `DashboardShell` | `GET /auth/me` (refetch on mount + focus), `/hospitals/current`, `/hospitals` |
| `useDashboardGuard` | `GET /auth/me` |
| `useActiveHospital` | `GET /hospitals/current` |

`/auth/me` is refetched on mount and window focus, so a permission change made
by a superadmin updates the sidebar without a re-login.

---

## 4. Outstanding — endpoints the frontend needs that do not exist

### Launch-blocking

**1. Payments capture — `POST /payments/{id}/intent`, `POST /payments/webhook`**

Checkout is currently a `setTimeout` in `PatientPayments.tsx` that closes the
modal and persists nothing; every payment stays `pending` forever. `POST
/payments` and `PUT /payments/{id}` exist but are never called, and no invoice is
raised for an in-person appointment at all — `Payment` rows are only created by
video-slot booking. Status must move via a gateway webhook, never a client-sent
`status: "completed"`. *Blocked on: choosing a gateway.*

**2. Password management — `POST /auth/forgot-password`, `POST
/auth/reset-password`, `PUT /users/me/password`**

No reset flow exists anywhere in the codebase. `PUT /users/me` deliberately
excludes password. One forgotten password is currently an unresolvable support
ticket. *Blocked on: choosing an email provider.*

**3. Notifications — `GET /notifications`, `PUT /notifications/read`**

The notification bell was removed because its only data source was a localStorage
mock that returned an empty list for every user. Can be derived server-side from
existing records with no new table and no new permission (self-scoped).
*Not blocked on anything.*

### Needed for real clinical use

**4. File uploads — `POST /uploads` + signed-URL read**

`Patient.documents[]` and `MedicalRecord.labReports[]` exist in the schema, but
there is no upload UI or endpoint. Scans and reports cannot be attached.

**5. Identity verification — `POST /verifications/aadhaar`, `/doctor`, `/nurse`**

The Aadhaar and medical/nursing-council lookups were hardcoded fixtures in the
bundle and have been deleted, along with the registration step that displayed
"Verified with UIDAI". A real integration must be a backend proxy, and
`verificationStatus` must be written from the provider response, never from the
client payload.

**6. Video session — room/token generation**

`/dashboard/video-consults` and `/consult/[id]` create and join records, but
there is no video transport behind them.

### Hardening

7. **Token refresh / revocation** — 7-day JWT in `localStorage`, no logout invalidation.
8. **Rate limiting** on `/auth/login` — no lockout, no throttle.
9. **Dashboard tiles still aggregate client-side** — the six `home/*` overview
   screens fetch whole collections to count them. Every *table* screen now pages
   and searches on the server (see below), but the tiles need `/stats`-style
   endpoints of their own; `GET /appointments/stats` is the pattern to copy.

### Implemented but never called

No backend work needed; these are missing UI, not missing endpoints.

| Endpoint | Missing UI |
|---|---|
| `POST /payments` | invoice creation (see item 1) |
| `PUT /pregnancies/{id}` | pregnancy edit |
| `DELETE /hospitals/{id}` | hospital delete |
| `GET /doctors/{id}/appointments` | superseded by `/appointments?doctorId=` |
| `GET /patients` (unpaged) | still used by the pickers, modals and dashboard tiles as a lookup table; no table screen calls it any more |
| `GET /hospitals/{id}`, `GET /roles/{code}`, `GET /babies/{id}`, `GET /pregnancies/{id}`, `PUT /superadmin/patients/{id}` | detail reads the UI gets from list endpoints |

---

## 5. Deployment checklist

Set before `ENVIRONMENT=production` — the app **refuses to boot** if the first
three are still on demo defaults (`check_production_config` in `main.py`).

| Variable | Why |
|---|---|
| `JWT_SECRET` | Default is published in this repo |
| `SUPERADMIN_PASSWORD` | Default `password123` grants cross-tenant access to every hospital's records |
| `CORS_ORIGINS` | Must name real tenant origins; the `*.localhost` regex is dropped in production |
| `SUPERADMIN_EMAIL` | Optional but recommended |
| `DATABASE_URL` | — |

**Manual step:** the seeder is idempotent and skips when the account already
exists. If the production DB was ever booted before these changes,
`superadmin@platform.com` already exists there with `password123` and must be
rotated by hand. The same applies to hospital admins created by
`provision_hospital`, which defaults to `password123`.

### Resetting to a clean database

Drops everything and rebuilds schema + the permission catalog from migrations,
then seeds a single superadmin. The catalog is migration-owned, not seed data —
truncating those tables would leave the superadmin with no permissions.

```bash
cd apps/api
alembic downgrade base && alembic upgrade head
# superadmin is created on next app boot, or:
python -c "from app.database import SessionLocal; from app.seed import seed_database; \
           db=SessionLocal(); seed_database(db); db.close()"
```

On a fresh database there are no hospitals. Sign in as superadmin on the bare
host and onboard the first one — until then, tenant-scoped pages have no tenant
to resolve, which is the intended behaviour.

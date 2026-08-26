# CarbonHealth — Claude Context

## What This Project Is
CarbonHealth is a multi-tenant Hospital Management Software (HMS) SaaS. Multiple hospitals buy access and each hospital gets its own isolated subdomain (e.g., `cityhospital.netcare.co.in`). Patients, doctors, admins, nurses, and lab technicians at Hospital A cannot see any data from Hospital B.

## Monorepo Structure
```
carbonhealth/
├── apps/
│   ├── web/   → Next.js 15 frontend (TypeScript, Tailwind, Radix UI)
│   └── api/   → FastAPI backend (Python, PostgreSQL, SQLAlchemy, Alembic)
```

## Tech Stack
- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Radix UI, Formik, Recharts
- **Backend:** FastAPI, PostgreSQL, SQLAlchemy 2, Alembic, PyJWT, bcrypt, Pydantic v2
- **Package manager:** pnpm (workspaces)

## Current Status — PHASE 0/1 (Integrated)
The frontend runs on the real API — the localStorage mock is gone entirely. Every backend router is
tenant-scoped and permission-guarded, the route table gates on `permission` rather than role lists,
the sidebar is built from `session.permissions`, and `/auth/me` is refetched so a revoked grant
updates the menu without a re-login.

Tests exist: `npm test` runs the backend suite (tenant isolation, foreign-key scoping, onboarding
departments, R2 storage, the platform-only grants) against a throwaway database. There are no
frontend tests yet — `npx tsc --noEmit` in `apps/web` is the only automated check there, and
`next.config.mjs` currently sets `typescript.ignoreBuildErrors`, so a type error will not fail a
production build.

## User Roles
- `superadmin` — Platform owner (us, CarbonHealth). Can onboard new hospitals.
- `admin` — Hospital admin. Manages their hospital's doctors, patients, departments.
- `doctor` — Sees their appointments, patients, prescriptions, lab orders.
- `nurse` — Records vitals, coordinates appointments.
- `lab` — Manages lab test orders and results.
- `patient` — Books appointments, views medical records and payments.

## Three Independent Questions
Every request answers these separately — do not collapse them:
1. **Tenant** — whose data? `hospital_id` from the JWT, applied by `scoped(db, Model, tenant_id)`.
2. **Identity** — who is calling? `get_current_user()`.
3. **Capability** — may they? `require_permission("patients.read")`, which returns the granted **scope**.

## Multi-Tenancy Architecture
- Every DB table has a `hospital_id` column (Foreign Key)
- `hospital_id` is baked into the JWT token at login time — cannot be spoofed
- Subdomain determines which hospital: `sunrise.netcare.co.in` → hospital with subdomain `sunrise`
- Backend uses `get_tenant_id()` FastAPI dependency + `scoped(db, Model, tenant_id)` helper to filter all queries
- Frontend resolves tenant via `apps/web/lib/tenant.ts`

## Authorization (roles are data, not code)
- `permissions` — the catalog of capabilities. Code owns it; new rows arrive by migration.
- `role_permissions` — which role holds which permission, **and at what scope**. Superadmin owns this.
- Scope lives on the *grant*, not the permission: `patients.read` + `own` vs `all`.
- Effective permissions = role grants ∩ the hospital's enabled modules, resolved per request in
  `app/authz.py` — never read from the JWT, so a revoked grant takes effect immediately.
- A superadmin can create a role and tick its permissions; no code change is needed for either
  backend enforcement or frontend navigation.
- **No role code appears in `authz.py`.** If you find yourself writing `if role == "doctor"`, the
  answer is a permission.
- `hospital.settings.manage` (`c4e8b1d90f36`) and `departments.manage` (`d7a2c5f81e64`) are
  **superadmin's**, not a hospital admin's. Both reach provisioning decisions: the first picks a
  category template and replaces a hospital's whole department list, the second edits the
  departments that appointments are already filed into and doctors already belong to.
- `departments.read` deliberately **stayed with admin** when `departments.manage` left. The list is
  not the screen: the admin overview, the appointments board, the doctors list and both doctor
  modals read it, and the modals write `department_id`. Revoking read to hide one screen would have
  broken creating a doctor. When you move a capability, check what else reads it first.
- **Deleting is a platform capability** (`x9y0z1a2b3c4`). `<resource>.delete` is its own
  permission — `patients.delete`, `doctors.delete`, `users.delete`, `appointments.delete`,
  `vitals.delete`, `prescriptions.delete`, `medicines.delete`, `lab_tests.delete`,
  `lab_orders.delete` — granted to superadmin alone. It used to ride on `*.manage`, which made
  "let an admin add a doctor" and "let an admin erase a doctor" the same decision. `*.manage`
  still covers create and edit, and hospital admins keep it.
  - Not included, on purpose: schedule blocks, video slots, FCM tokens and hospital
    logo/letterhead. Those are people removing **their own** things — a doctor clearing their own
    availability — not record deletion, and they stayed with their current holders.
  - `departments` and `roles` needed no new row: `departments.manage` (`d7a2c5f81e64`) and
    `roles.manage` were already superadmin's, so their deletes already were.
  - The frontend gates the button on `*.delete` and the endpoint enforces it; `tests/
    test_delete_is_platform_only.py` asserts both halves — the admin's 403 **and** that the
    admin can still edit, so the split never quietly costs them the rest of the job.

### Rules that keep coming up
- A record that does not exist *or* is not yours returns **404**, never 403 — a 403 confirms the id exists.
- Never widen a permission because a button 403s. Ask who should really hold that capability
  (this is where `lab_orders.review`, `PUT /users/me`, and `GET /doctors/{id}/availability` came from).
- Facts about what happened are the server's to write, not the client's: invoices, `rescheduled`,
  result timestamps.
- When a client needs a *fact* derived from records it may not read, answer the question rather than
  hand over the records — `GET /doctors/{id}/availability` returns taken times with no patient on them.
- Stock moves by `medication_orders.quantity`, never by a number parsed out of "twice daily for 5
  days". Dispensing refuses on short stock and on expired stock rather than moving what is not
  there — a silent skip leaves a discrepancy with no inventory row to explain it.
- The prescriber on a medication order is the caller when the caller is a doctor, and an explicit
  `doctorId` otherwise. A doctor's own id always wins over the body: whose name is on an order is a
  fact about what happened.

## Backend: Fully Wired
All routers are tenant-scoped and permission-guarded: auth, hospitals, departments, appointments,
patients, doctors, users, roles, permissions, medical_records, prescriptions, payments, vitals,
lab (tests/orders/results), medicines, schedule blocks, video slots, maternity (pregnancy/ANC/baby/
growth/immunization).

## Hospital Registration (the tenant record)
A hospital is five tables, split by access shape rather than tidiness:

| Table | Holds | Read |
|-------|-------|------|
| `hospitals` | runtime config (name, subdomain, category, modules, theme) **+ legal identity** (legal name, entity type, registration no, PAN, GSTIN, HFR id, NABH) **+ `onboarding_status`** | every request |
| `hospital_profiles` | address, contacts, medical director, bed counts, on-site services, operational config (MRN/invoice format, slot length), branding assets | once per screen |
| `hospital_licences` | one row per statutory licence, each with its own expiry | expiry sweeps |
| `hospital_documents` | uploaded scans; metadata only, bytes behind `file_url` | on demand |
| `hospital_subscriptions` | plan, limits, billing contact — **ours, not theirs** | billing only |

- `status` (active/suspended) and `onboarding_status` (pending/documents_submitted/verified/rejected)
  are **different axes**. A verified hospital can be suspended for non-payment. Never collapse them.
- Which licences apply is a rule, not a list: `licences_for(category, modules)` in
  `app/licences.py`. The frontend fetches it from `GET /hospitals/meta/onboarding` rather than
  restating it — one copy of the rule.
- Nothing in registration is *required* to create a tenant. Trials and demos exist before the
  paperwork does; the wizard records how far it got in `onboarding_status` instead of blocking.
- `verified_at` / `verified_by` are written by the server on the status transition — facts about
  what happened are not the client's to send.
- Uploads go through `app/storage.py`, the one seam that knows whether a file is on local disk or
  in a bucket. `STORAGE_BACKEND=local` is dev-only (`UPLOAD_DIR`, served at `/files`);
  `STORAGE_BACKEND=r2` is Cloudflare R2 for production.
- What is **stored** in `file_url` and what is **served** to a browser are different strings on R2:
  the stored one is an opaque, stable `r2://folder/name`, and `storage.public_url()` signs it on the
  way out. Anything returning a document or licence row must call it — never write its result back.
- Tenant FKs are `ON DELETE CASCADE` as of `d1a4f8c62b93`. Before that `DELETE /hospitals/{id}`
  failed on any hospital that had ever been provisioned. `audit_logs` still carries no FK by design.

## Frontend: Route Architecture
- **One route per screen**, not one per role: `/dashboard/appointments`, never `/dashboard/admin/appointments`.
- `apps/web/lib/roles.ts` is the single source for role codes, the route table, and nav — the only
  file to touch when routing changes.
- `components/RoleView.tsx` picks the view for the caller's role; `hooks/useDashboardGuard.ts` is
  the single entitlement check.
- All data goes through `store/api.ts` (RTK Query). No component reads a store directly.

## Frontend: Mock is Gone
`lib/db.ts` no longer exists and nothing imports it — the whole app is on the real API.
`lib/doctorRegistry.ts`, `lib/nurseRegistry.ts` and `lib/aadhaarRegistry.ts` are gone too.
`lib/auth.ts` is **not** gone — it holds `authStorage` and `hasPermission` and is imported in ~28
files. (`lib/types.ts` still mentions the old `@/lib/db` import path in a comment;
that is history, not a dependency.)

Keep: `lib/tenant.ts`, `lib/anc.ts`, `lib/baby.ts`, `lib/schedule.ts`, `lib/types.ts`, `lib/lab.ts`,
`lib/apiError.ts`

## Sign-in (what actually exists on a fresh database)
`app/seed.py` seeds **one** account — the platform superadmin, from
`SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` (default `netcruxx@gmail.com` /
`password123`, refused in production). It seeds nothing else, despite what this
section used to claim: there are no `admin@example.com` / `doctor@example.com`
demo logins.

Every other account comes from the real flow:

1. Sign in as the superadmin on the platform host and onboard a hospital — the
   wizard's last step creates that hospital's first **admin**.
2. That admin creates doctors, nurses, lab and pharmacist accounts from
   `/dashboard/users`. The role list there is read live from the catalog, so
   any role a superadmin invents appears without a deploy.

The login page offers a role tab per built-in role; the tab is a hint for the
user, not a filter — what you can open is decided by grants, not by which tab
you picked.

## Dev Setup
```bash
# Backend (run from apps/api/)
cp .env.example .env        # set DATABASE_URL and JWT_SECRET
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload   # runs on localhost:8000

# Frontend (run from apps/web/)
cp .env.local.example .env.local
pnpm install
pnpm dev                        # runs on localhost:3000
```

Or from monorepo root:
```bash
pnpm setup     # installs everything + runs migrations
pnpm dev:all   # starts both frontend and backend
```

## Key Files Reference
| File | Purpose |
|------|---------|
| `apps/api/app/tenancy.py` | Tenant resolution + scoped() query helper |
| `apps/api/app/authz.py` | **Permission resolution, scope filters, require_permission** |
| `apps/api/app/auth.py` | JWT encode/decode, password hashing, current-user dependency |
| `apps/api/app/models.py` | All SQLAlchemy ORM models |
| `apps/api/app/schemas.py` | All Pydantic request/response schemas |
| `apps/api/app/seed.py` | Demo data seeder (idempotent) |
| `apps/api/app/provisioning.py` | Hospital onboarding — creates tenant + profile + licences + subscription + first admin in one transaction |
| `apps/api/app/licences.py` | **Licence/document catalog + wizard enumerations** (states, councils, entity types) |
| `apps/api/app/storage.py` | Upload seam — local disk in dev, object storage in prod |
| `apps/web/components/hospitals/OnboardHospitalWizard.tsx` | **The 8-step onboarding form** |
| `apps/web/components/hospitals/onboarding/config.ts` | Wizard shape, per-step validation, payload builder |
| `apps/web/lib/roles.ts` | **Role codes, route table, nav — the one file for routing** |
| `apps/web/store/api.ts` | Every API call (RTK Query) |
| `apps/web/lib/types.ts` | All TypeScript interfaces (mirror of the backend schemas) |
| `apps/web/lib/apiError.ts` | Reads FastAPI `detail` out of an error |
| `apps/web/hooks/useDashboardGuard.ts` | The single route entitlement check |
| `apps/web/components/RoleView.tsx` | Picks the view for the caller's role |
| `apps/web/lib/tenant.ts` | Frontend subdomain resolution |
| `apps/web/components/DashboardShell.tsx` | Master layout with permission-driven sidebar |

## Product Roadmap Summary
- **Phase 0:** Fix backend tenant scoping → create `lib/api.ts` → wire real auth → replace dashboard data
- **Phase 1:** Hospital onboarding page → subdomain routing in middleware
- **Phase 2:** Lab module, Medicine catalog, Scheduling, Maternity tables in backend
- **Phase 3:** Email notifications, Payments (Razorpay), File uploads, Pagination, Superadmin panel
- **Phase 4:** Telemedicine, WhatsApp, Mobile app

Full roadmap: `/PRODUCT_ROADMAP.md`

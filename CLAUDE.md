# CarbonHealth — Claude Context

## What This Project Is
CarbonHealth is a multi-tenant Hospital Management Software (HMS) SaaS. Multiple hospitals buy access and each hospital gets its own isolated subdomain (e.g., `cityhospital.carbonhealth.com`). Patients, doctors, admins, nurses, and lab technicians at Hospital A cannot see any data from Hospital B.

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
The frontend runs on the real API. Every screen but the two demo-data buttons in `AdminSetup` has
been moved off the localStorage mock (`apps/web/lib/db.ts`), and every backend router is both
tenant-scoped and permission-guarded.

Next up: frontend permission gating (route table `roles: []` → `permission`, nav built from
`session.permissions`), `/auth/me` refresh so a revoked grant updates the sidebar without a
re-login, then tests.

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
- Subdomain determines which hospital: `sunrise.carbonhealth.com` → hospital with subdomain `sunrise`
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

### Rules that keep coming up
- A record that does not exist *or* is not yours returns **404**, never 403 — a 403 confirms the id exists.
- Never widen a permission because a button 403s. Ask who should really hold that capability
  (this is where `lab_orders.review`, `PUT /users/me`, and `GET /doctors/{id}/availability` came from).
- Facts about what happened are the server's to write, not the client's: invoices, `rescheduled`,
  result timestamps.
- When a client needs a *fact* derived from records it may not read, answer the question rather than
  hand over the records — `GET /doctors/{id}/availability` returns taken times with no patient on them.

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
  in a bucket. Local disk is dev-only (`UPLOAD_DIR`, served at `/files`).
- Tenant FKs are `ON DELETE CASCADE` as of `d1a4f8c62b93`. Before that `DELETE /hospitals/{id}`
  failed on any hospital that had ever been provisioned. `audit_logs` still carries no FK by design.

## Frontend: Route Architecture
- **One route per screen**, not one per role: `/dashboard/appointments`, never `/dashboard/admin/appointments`.
- `apps/web/lib/roles.ts` is the single source for role codes, the route table, and nav — the only
  file to touch when routing changes.
- `components/RoleView.tsx` picks the view for the caller's role; `hooks/useDashboardGuard.ts` is
  the single entitlement check.
- All data goes through `store/api.ts` (RTK Query). No component reads a store directly.

## Frontend: Remaining Mock
`lib/db.ts` survives only for the two demo-data buttons in `components/setup/AdminSetup.tsx`.
Everything else is on the real API. `lib/auth.ts`, `lib/doctorRegistry.ts`, `lib/nurseRegistry.ts`
and `lib/aadhaarRegistry.ts` are gone.

Keep: `lib/tenant.ts`, `lib/anc.ts`, `lib/baby.ts`, `lib/schedule.ts`, `lib/types.ts`, `lib/lab.ts`,
`lib/apiError.ts`

## Demo Credentials (auto-seeded by backend on first run)
| Role        | Email                    | Password     |
|-------------|--------------------------|--------------|
| superadmin  | superadmin@platform.com  | password123  |
| admin       | admin@example.com        | password123  |
| doctor      | doctor@example.com       | password123  |
| patient     | patient@example.com      | password123  |
| nurse       | nurse@example.com        | password123  |
| lab         | lab@example.com          | password123  |

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

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

## Current Status — PHASE 0 (Not Started)
The frontend and backend have NEVER been connected. The frontend currently runs on a fake localStorage mock database (`apps/web/lib/db.ts`). The backend is a real FastAPI + PostgreSQL API that is not yet called by the frontend.

**The #1 priority is connecting frontend to backend.**

## User Roles
- `superadmin` — Platform owner (us, CarbonHealth). Can onboard new hospitals.
- `admin` — Hospital admin. Manages their hospital's doctors, patients, departments.
- `doctor` — Sees their appointments, patients, prescriptions, lab orders.
- `nurse` — Records vitals, coordinates appointments.
- `lab` — Manages lab test orders and results.
- `patient` — Books appointments, views medical records and payments.

## Multi-Tenancy Architecture
- Every DB table has a `hospital_id` column (Foreign Key)
- `hospital_id` is baked into the JWT token at login time — cannot be spoofed
- Subdomain determines which hospital: `sunrise.carbonhealth.com` → hospital with subdomain `sunrise`
- Backend uses `get_tenant_id()` FastAPI dependency + `scoped(db, Model, tenant_id)` helper to filter all queries
- Frontend resolves tenant via `apps/web/lib/tenant.ts`

## Backend: What's Fully Working
- `POST /auth/login`, `POST /auth/register`, `GET /auth/me`
- `GET/POST/PATCH /hospitals` (superadmin only)
- `GET /hospitals/current` (public, resolves by subdomain)
- `GET/POST/PUT/DELETE /departments` (tenant-scoped, admin only for writes)
- `GET/POST/PUT /appointments` (tenant-scoped)

## Backend: What Exists But Is NOT Tenant-Scoped Yet (Data Leak Risk)
- `routers/patients.py` — missing `get_tenant_id()` and `scoped()` calls
- `routers/doctors.py` — same
- `routers/medical_records.py` — same
- `routers/prescriptions.py` — same
- `routers/payments.py` — same
- `routers/vitals.py` — same

## Backend: What's Not Built Yet
- Lab orders & results (tables + routes)
- Medicine catalog (table + routes)
- Doctor scheduling / slots (table + routes)
- Maternity / ANC / Baby / Immunization (tables + routes)

## Frontend: What Needs to Be Created
- `apps/web/lib/api.ts` — HTTP client wrapper (fetch with Authorization + X-Hospital-Id headers)
- `apps/web/app/onboard/page.tsx` — Hospital onboarding / signup page (MISSING — hospitals can't sign up yet)
- `apps/web/middleware.ts` — Read subdomain from Host header, pass as X-Hospital-Id to all API calls

## Frontend: Files to Delete After Backend Integration
Once real API is wired up, delete these mock files:
- `apps/web/lib/db.ts`
- `apps/web/lib/auth.ts`
- `apps/web/lib/doctorRegistry.ts`
- `apps/web/lib/nurseRegistry.ts`
- `apps/web/lib/aadhaarRegistry.ts`

Keep: `lib/tenant.ts`, `lib/anc.ts`, `lib/baby.ts`, `lib/schedule.ts`, `lib/types.ts`

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
| `apps/api/app/auth.py` | JWT encode/decode, password hashing, role guards |
| `apps/api/app/models.py` | All SQLAlchemy ORM models |
| `apps/api/app/schemas.py` | All Pydantic request/response schemas |
| `apps/api/app/seed.py` | Demo data seeder (idempotent) |
| `apps/api/app/provisioning.py` | Hospital onboarding logic |
| `apps/web/lib/types.ts` | All TypeScript interfaces (update to match backend) |
| `apps/web/lib/tenant.ts` | Frontend subdomain resolution |
| `apps/web/components/DashboardShell.tsx` | Master layout with role-based sidebar |
| `apps/web/app/login/page.tsx` | Login page (needs subdomain + real API wired up) |

## Product Roadmap Summary
- **Phase 0:** Fix backend tenant scoping → create `lib/api.ts` → wire real auth → replace dashboard data
- **Phase 1:** Hospital onboarding page → subdomain routing in middleware
- **Phase 2:** Lab module, Medicine catalog, Scheduling, Maternity tables in backend
- **Phase 3:** Email notifications, Payments (Razorpay), File uploads, Pagination, Superadmin panel
- **Phase 4:** Telemedicine, WhatsApp, Mobile app

Full roadmap: `apps/web/PRODUCT_ROADMAP.md`

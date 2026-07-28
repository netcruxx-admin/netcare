# Medicare HMS — Product Roadmap

> **Purpose:** This document gives every team member a clear picture of where the product stands today, what the critical gaps are, and the exact order of work to take the product to production.

---

## 1. Current State (What You Have)

### Frontend (`/medicare`)
- Full Next.js 15 app with complete UI for all 5 roles: Patient, Doctor, Admin, Lab, Nurse
- Multi-tenant architecture exists (subdomain-based switching) but runs on **mock localStorage data only**
- No real API calls — all data is fake in-memory database
- No real authentication — tokens are just base64-encoded JSON
- Rich features built: appointments, vitals, prescriptions, lab orders, payments, ANC/maternity tracking, scheduling

### Backend (`/medicare-backend`)
- FastAPI + PostgreSQL backend with proper JWT auth
- Multi-tenant schema: every table has `hospital_id`
- `hospital_id` is baked into JWT tokens (correct approach)
- **Fully working:** Auth, Hospitals (superadmin), Departments, Appointments
- **Partially working (no tenant scoping):** Patients, Doctors, Medical Records, Prescriptions, Payments, Vitals
- **Not built yet:** Lab orders, Medicine catalog, Lab test catalog, Scheduling/slots, Maternity tables

### The Core Problem
**The frontend and backend have never been connected.** The frontend talks to `lib/db.ts` (localStorage). The backend exists as a standalone API. Nothing is integrated.

---

## 2. Critical Architecture Issues to Fix

### Issue 1: No Hospital Login / Onboarding Flow
**The problem:** When a hospital admin visits your app, there is no way to sign up as a hospital. The current login page asks for Patient / Doctor / Admin roles, but doesn't ask "which hospital are you from?"

**What needs to exist:**
- A **Hospital Onboarding page** where a new hospital signs up (pays, enters hospital name, subdomain, category)
- After onboarding, the hospital gets its own subdomain (e.g., `city-hospital.yourdomain.com`)
- All their staff (admin, doctors, nurses, lab) then register under that subdomain
- The login page on that subdomain automatically scopes all auth to that hospital

### Issue 2: Same Patient Cannot Exist at Two Hospitals
**The problem:** The backend correctly isolates data by `hospital_id`, but the current login flow doesn't enforce "you can only log into the hospital you registered with."

**What needs fixing:** When a user logs in at `hospital-a.yourdomain.com`, they must only see Hospital A's data. This is already in the backend JWT design — it just needs to be wired up.

### Issue 3: Frontend is Not Connected to Backend
**The problem:** Every page in the frontend reads/writes to `lib/db.ts` (localStorage). To go to production, every page needs to call the real API instead.

---

## 3. Roadmap — Exact Order of Work

---

### PHASE 0 — Foundation (Do This First, Before Any Feature Work)
**Goal: Connect frontend to backend. Without this, nothing else matters.**

#### 0.1 — Backend: Fix Tenant Scoping on All Routers
All routes that are missing `get_tenant_id()` dependency are a data leak. Fix these first.

**Files to fix in backend:**
- `routers/patients.py` — add `tenant_id = Depends(get_tenant_id)` to all endpoints, wrap queries with `scoped(db, Patient, tenant_id)`
- `routers/doctors.py` — same
- `routers/medical_records.py` — same
- `routers/prescriptions.py` — same
- `routers/payments.py` — same
- `routers/vitals.py` — same

**Priority:** CRITICAL. Without this, Hospital A can accidentally read Hospital B's patients.

**Estimate:** 1–2 days

---

#### 0.2 — Frontend: Create API Client Layer
Replace all `lib/db.ts` calls with real HTTP calls. Do NOT touch any UI code yet.

**Create `lib/api.ts`:**
```
Base URL: NEXT_PUBLIC_API_URL env variable
Headers: Authorization: Bearer <token from localStorage>
X-Hospital-Id: <current tenant id>
```

Create one function per backend endpoint. Example:
```ts
export const api = {
  auth: { login, register, me },
  appointments: { list, get, create, update },
  patients: { get, update, appointments, records },
  doctors: { list, get, appointments },
  departments: { list, create, update, delete },
  // etc.
}
```

**Estimate:** 2–3 days

---

#### 0.3 — Frontend: Replace Auth with Real API
**Files to change:**
- `lib/auth.ts` — replace `authOperations.login()` with `api.auth.login()` call
- `app/login/page.tsx` — after login, store real JWT from backend response
- `app/register/page.tsx` — call `api.auth.register()` instead of mock
- `components/ProtectedRoute.tsx` — validate token against `api.auth.me()` on load

**The key change:** Login page on `hospital-a.yourdomain.com` must auto-detect subdomain and pass it to the backend so the backend knows which hospital to authenticate against. The backend already supports this via the `Host` header / `X-Hospital-Id`.

**Estimate:** 2–3 days

---

#### 0.4 — Frontend: Replace Each Dashboard's Data with Real API
Do one dashboard at a time, in this order (simplest to most complex):

1. **Admin Dashboard** — connects to `/departments`, `/doctors`, `/patients` (read-only list views)
2. **Patient Dashboard** — connects to `/appointments`, `/patients/{id}` (profile + appointments)
3. **Doctor Dashboard** — connects to `/appointments`, `/patients`, `/prescriptions`, `/vitals`
4. **Lab Dashboard** — wait until Lab tables are built in backend (Phase 2)
5. **Nurse Dashboard** — connects to `/appointments`, `/vitals`

**Estimate:** 1–2 weeks

---

### PHASE 1 — Multi-Tenancy & Hospital Onboarding
**Goal: Make it work correctly as a multi-hospital SaaS.**

#### 1.1 — Hospital Registration / Onboarding Flow

**Backend (already has the endpoint):** `POST /hospitals` (superadmin only) provisions a new hospital.

**Frontend — Create new page: `app/onboard/page.tsx`**
- Form: Hospital Name, Subdomain, Category (maternity / dental / eye / diagnostic / multi-specialty), Admin Name, Admin Email, Admin Password
- Calls the platform superadmin endpoint to create the hospital
- On success, shows: "Your hospital portal is ready at `{subdomain}.yourdomain.com`"

**This is the missing piece.** Currently you have no way for a new hospital to sign up.

**Estimate:** 3–4 days

---

#### 1.2 — Subdomain Routing

**For local development:** Already works via `hospital-a.localhost:3000`

**For production:** 
- Use a wildcard DNS record: `*.yourdomain.com → your server`
- In Next.js middleware (`middleware.ts`), read the subdomain from the `Host` header and set it as a cookie/header so all API calls include `X-Hospital-Id`

**Estimate:** 2 days

---

#### 1.3 — Login Page: Remove Hardcoded Hospital, Use Subdomain

**File: `app/login/page.tsx`**

Current: Login page has demo hospital hardcoded (hosp-1)

Change to:
- On load, read subdomain from URL (e.g., `city-hospital.yourdomain.com` → `city-hospital`)
- Fetch hospital info: `GET /hospitals/current` (already exists in backend)
- Show hospital name/logo on login page
- All auth calls automatically scoped to this hospital

**Estimate:** 1 day

---

### PHASE 2 — Complete Backend Features
**Goal: Build the backend endpoints the frontend needs but backend is missing.**

#### 2.1 — Lab Module (Backend)

**Tables to create (via Alembic migration):**
```sql
lab_tests (id, hospital_id, name, category, parameters JSON, price, turnaround_days)
test_orders (id, hospital_id, appointment_id, patient_id, doctor_id, test_id, status, clinical_notes, ordered_at)
test_results (id, hospital_id, order_id, parameters JSON, notes, result_at, reviewed_by)
```

**Routes to create:** `routers/lab.py`
- `GET /lab/tests` — catalog (tenant-scoped)
- `POST /lab/tests` — admin creates test
- `POST /lab/orders` — doctor orders test
- `GET /lab/orders` — lab tech sees pending orders
- `PUT /lab/orders/{id}` — update status (sample_collected → in_progress → completed)
- `POST /lab/results` — lab tech enters results

**Estimate:** 3–4 days

---

#### 2.2 — Medicine Catalog (Backend)

**Table:**
```sql
medicines (id, hospital_id, name, form, strength, price, stock, created_at)
```

**Routes:** `routers/medicines.py`
- `GET /medicines` — list (tenant-scoped)
- `POST /medicines` — admin creates
- `PUT /medicines/{id}` — admin updates
- `DELETE /medicines/{id}` — admin deletes

**Estimate:** 1–2 days

---

#### 2.3 — Doctor Scheduling (Backend)

**Table:**
```sql
schedule_blocks (id, hospital_id, doctor_id, date, start_time, end_time, block_type, reason)
```

**Routes:** `routers/schedule.py`
- `GET /doctors/{id}/slots?date=` — returns available slots
- `POST /schedule/blocks` — doctor blocks time
- `DELETE /schedule/blocks/{id}` — remove block

**Estimate:** 2–3 days

---

#### 2.4 — Maternity / ANC Module (Backend)

**Tables:**
```sql
pregnancies (id, hospital_id, patient_id, doctor_id, lmp_date, edd, status, risk_level)
anc_visits (id, hospital_id, pregnancy_id, visit_date, gestational_age, vitals JSON, notes, next_visit)
babies (id, hospital_id, pregnancy_id, patient_id, birth_date, birth_weight, gender, delivery_type)
immunizations (id, hospital_id, baby_id, vaccine_name, due_date, given_date, status)
```

**Routes:** `routers/maternity.py`

**Estimate:** 4–5 days

---

### PHASE 3 — Production Readiness
**Goal: Make it deployable and sellable.**

#### 3.1 — Email Notifications
- Patient gets email when appointment is confirmed/cancelled
- Doctor gets email for new appointments
- Use: **Resend** or **SendGrid** (simple API, free tier)
- Backend: Add `POST /notifications/send` internal helper, call from appointment creation

**Estimate:** 2 days

---

#### 3.2 — Real Payment Integration
- Currently frontend only tracks payment status (pending/completed)
- Integrate **Razorpay** (if India) or **Stripe** (international)
- Flow: Patient sees "Pay Now" → opens Razorpay modal → on success, backend marks payment completed

**Estimate:** 3–4 days

---

#### 3.3 — File Uploads (Documents & Reports)
- Patients need to upload insurance documents
- Lab results may need PDF attachment
- Use: **AWS S3** or **Cloudflare R2** (cheaper)
- Backend: Add `POST /upload` endpoint returning signed URL

**Estimate:** 2–3 days

---

#### 3.4 — Pagination on All List Endpoints
All backend list endpoints currently return all rows. At scale this will crash.

Add `?page=1&limit=20` to: `/appointments`, `/patients`, `/doctors`, `/prescriptions`, etc.

**Estimate:** 1–2 days

---

#### 3.5 — Superadmin Panel (Platform Dashboard)
This is YOUR dashboard as the company that sells to hospitals.

**What you need to see:**
- All hospitals (list, status, plan)
- Per-hospital stats (user count, appointments this month)
- Onboard new hospital
- Suspend/reactivate a hospital

The backend already has `GET /hospitals` and `PATCH /hospitals/{id}` (superadmin-only). Build the frontend at `app/platform/page.tsx`.

**Estimate:** 3–4 days

---

### PHASE 4 — Growth Features (After Revenue)

| Feature | What it means |
|---|---|
| Telemedicine | Video calls via Daily.co or Jitsi SDK |
| WhatsApp Notifications | Appointment reminders via Twilio or Interakt |
| Doctor KYC | Verify doctor license via NMC API (India) |
| Aadhaar Verification | For patient identity via Sandbox.co.in |
| Mobile App | React Native with same API |
| Analytics Dashboard | Per-hospital revenue, appointment trends |
| Billing / Invoices | PDF invoice generation with hospital letterhead |
| OPD Queue Management | Real-time queue display for waiting room |

---

## 4. Team Task Split (Suggested)

| Developer | Focus Area |
|---|---|
| Backend Dev | Phase 0.1 (tenant scoping), Phase 2 (Lab, Medicines, Scheduling, Maternity) |
| Frontend Dev 1 | Phase 0.2 + 0.3 (API client + auth integration) |
| Frontend Dev 2 | Phase 0.4 (replace dashboard data one by one) |
| Full-Stack Dev | Phase 1 (Hospital onboarding + subdomain routing) |

---

## 5. What To Do TODAY (First 3 Days)

### Day 1
1. [ ] Backend: Fix tenant scoping in `patients.py`, `doctors.py`, `medical_records.py`, `prescriptions.py`, `payments.py`, `vitals.py`
2. [ ] Frontend: Create `lib/api.ts` with axios/fetch wrapper that sends `Authorization` header + `X-Hospital-Id`

### Day 2
3. [ ] Frontend: Replace `lib/auth.ts` login/register with real API calls
4. [ ] Frontend: Update `app/login/page.tsx` to read subdomain and call `GET /hospitals/current` to show hospital name
5. [ ] Test: Can a user log in via frontend and hit the real backend?

### Day 3
6. [ ] Frontend: Replace Admin dashboard data (`/departments`, `/doctors list`) with real API
7. [ ] Frontend: Replace Patient dashboard appointments with real API
8. [ ] Test end-to-end: Create appointment in UI → appears in PostgreSQL

Once Day 1–3 is done, you have a real product. Everything after that is adding features.

---

## 6. Environment Setup (Backend)

```bash
# In medicare-backend/
cp .env.example .env
# Edit .env: set DATABASE_URL and JWT_SECRET

pip install -r requirements.txt
alembic upgrade head       # Creates all tables
uvicorn app.main:app --reload  # Starts API at localhost:8000
```

```bash
# In medicare/ (frontend)
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" >> .env.local
npm install
npm run dev                # Starts frontend at localhost:3000
```

---

## 7. Key Decisions Already Made (Don't Change These)

| Decision | Why |
|---|---|
| `hospital_id` in JWT token | Secure — user's tenant is locked at login time, cannot be spoofed by header |
| Subdomain-based tenancy | Clean UX for hospitals — each hospital gets `name.yourdomain.com` |
| FastAPI + PostgreSQL | Correct choice — async, typed, scales well |
| Alembic migrations | Correct — never use `create_all()` in production |
| Per-tenant email uniqueness | Same person can work at 2 hospitals with same email |

---

## 8. Things to Remove From Frontend (Technical Debt)

Once backend integration is done, delete these files — they're no longer needed:
- `lib/db.ts` — the entire mock database
- `lib/auth.ts` — the mock auth logic
- `lib/doctorRegistry.ts` — mock KYC API
- `lib/nurseRegistry.ts` — mock registry
- `lib/aadhaarRegistry.ts` — mock Aadhaar

Keep:
- `lib/api.ts` (new file you create)
- `lib/tenant.ts` (subdomain resolution logic — still useful)
- `lib/anc.ts`, `lib/baby.ts`, `lib/schedule.ts` — business logic calculations, keep client-side
- All `lib/types.ts` — update types to match backend schemas

---

*Last updated: 2026-07-28*
*Status: Phase 0 not started — frontend and backend not yet connected*

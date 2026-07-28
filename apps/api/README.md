# Medicare Hospital Platform API (Python Backend)

FastAPI backend for the **Medicare** hospital platform. It mirrors the data models and
auth flow in the frontend's `lib/db.ts` / `lib/auth.ts`, and adds a **multi-tenant
foundation**: one codebase serves many hospitals, each isolated by `hospital_id`.

## Stack

- **FastAPI** + **Uvicorn** — web framework / ASGI server
- **SQLAlchemy 2** + **PostgreSQL** — ORM and database (dev and prod)
- **Alembic** — versioned schema migrations (replaces `create_all`)
- **PyJWT** — signed JWT auth; the token carries the tenant (`hospitalId`) + `role`
- **bcrypt** — password hashing
- **Pydantic v2** — validation, emits **camelCase** JSON to match the TS interfaces

## Multi-tenancy model

- Every tenant-owned row carries `hospital_id` (FK → `hospitals`). The `hospitals` table is
  the server source of truth for name/subdomain/category/modules/theme/currency — it
  **replaces the hardcoded `lib/hospitalConfig.ts`** (FE fetches `GET /hospitals/current`).
- **Two role tiers:** a platform **`superadmin`** (no hospital, `hospital_id` NULL) who
  onboards and configures hospitals, and tenant roles (`admin`, `doctor`, `nurse`, `lab`,
  `patient`) bound to one hospital.
- **Tenant resolution:** authenticated requests take the tenant from the caller's user row
  (from the validated JWT) — it can't be spoofed via URL. Pre-login requests
  (login/register/`/hospitals/current`) resolve from the **subdomain** (`sunrise.localhost`),
  with an `X-Hospital-Id` header override for demoing on bare `localhost`. A superadmin
  targets a specific hospital with the `X-Hospital-Id` header (gated to superadmins only).
- Query scoping is centralized in `app/tenancy.py` (`scoped()` / `get_tenant_id`), the
  server counterpart of the FE's `withTenant()` / `scoped()`.

## Quick start

Requires a running PostgreSQL. Local (Homebrew) uses trust auth, so no password is needed.

```bash
cd medicare-backend
brew services start postgresql@14     # start Postgres
createdb medicare                     # one-time: create the database

python3 -m venv .venv                  # if not already present
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env                   # defaults point at postgres://localhost/medicare

# Run (NOTE: use `python -m` — see "venv note" below)
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

On startup the app runs **Alembic migrations** to head, then seeds the flagship maternity
tenant (`hosp-1`) + a platform superadmin (only when the DB is empty).

- API root / health: http://localhost:8000/
- Interactive docs (Swagger): http://localhost:8000/docs

### Migrations

```bash
.venv/bin/python -m alembic upgrade head            # apply migrations
.venv/bin/python -m alembic revision --autogenerate -m "message"   # after model changes
```

### venv note

This project's `.venv` was created under an older path, so the console-script shebangs
(`.venv/bin/uvicorn`, `.venv/bin/alembic`) may be stale. Invoke tools via
`.venv/bin/python -m <tool>` (as above), or recreate the venv to fix the shebangs.

## Demo accounts (password: `password123`)

| Role       | Email                     | Tenant   |
|------------|---------------------------|----------|
| Superadmin | superadmin@platform.com   | — (platform) |
| Admin      | admin@example.com         | hosp-1   |
| Doctor     | doctor@example.com        | hosp-1   |
| Nurse      | nurse@example.com         | hosp-1   |
| Lab        | lab@example.com           | hosp-1   |
| Patient    | patient@example.com       | hosp-1   |

## Configuration (`.env`)

| Variable             | Default                                          | Notes                                 |
|----------------------|--------------------------------------------------|---------------------------------------|
| `DATABASE_URL`       | `postgresql+psycopg://localhost:5432/medicare`   | PostgreSQL DSN                        |
| `JWT_SECRET`         | `change-me-...`                                  | **Set a strong secret in production** |
| `JWT_ALGORITHM`      | `HS256`                                          |                                       |
| `JWT_EXPIRE_MINUTES` | `10080` (7 days)                                 |                                       |
| `CORS_ORIGINS`       | `http://localhost:3000`                          | Comma-separated; `*.localhost` also allowed |
| `DEFAULT_HOSPITAL_ID`| `hosp-1`                                          | Tenant used pre-login on the bare host |

## Tenant / platform endpoints

| Method | Path                    | Auth        | Description                                   |
|--------|-------------------------|-------------|-----------------------------------------------|
| GET    | `/hospitals/current`    | — (subdomain)| Active tenant's config (branding/modules)     |
| GET    | `/hospitals`            | superadmin  | List all hospitals                            |
| POST   | `/hospitals`            | superadmin  | Onboard a hospital (seeds config + departments + admin) |
| GET    | `/hospitals/{id}`       | superadmin  | Get a hospital                                |
| PATCH  | `/hospitals/{id}`       | superadmin  | Update category/modules/branding/status       |

Other resource endpoints are unchanged in shape but now tenant-scoped. `POST/PUT/DELETE
/departments` are open to a tenant `admin` (own hospital) or a `superadmin` (any hospital
via `X-Hospital-Id`). See http://localhost:8000/docs for the full list.

## Status: Slice 1

Built: tenancy foundation + superadmin + auth + appointments + departments, tenant-isolated
(verified: a tenant user cannot reach another tenant even with a forged `X-Hospital-Id`;
a superadmin can switch tenants explicitly).

Deferred to later passes: scoping the remaining routers (medical-records, payments,
prescriptions, vitals, doctors, patients), catalog tables (medicines, lab tests), lab
orders/results, scheduling, video slots, notifications, and the maternity signature tables
(pregnancies, ANC, babies, immunizations).

# IPD Module — Implementation Plan & Changelog

> **Status:** PLAN COMPLETE, UNEXECUTED. Every row in §4 and §5 is written —
> schema, permissions, all six backend routers, all frontend wiring, all four
> screens, and the test suite (§4.5). This file is now the changelog to keep
> updating as each piece is actually run and verified for real (§6), not a
> spec still being built against.
>
> **What "done" means here:** `e48dd4ce38b9` → `d82b1ad42845` (six migrations,
> chained off merge `51f2eec70416`) · the `authz.py`/`tenancy.py` fixes in
> §4.2 (plus a stale-comment fix in `routers/patients.py` found along the way)
> · all six §4.1 routers + shared `app/ipd.py` · all of §4.4's frontend wiring
> · the module-edit UI in `HospitalSetup.tsx` (§3.2) · all four §4.3 screens ·
> nine new/extended test files (§4.5), including two new fixtures
> (`hospital_c`/`hospital_d`, ipd-enabled) added to `conftest.py`, and a real
> gap fixed in an existing test (`test_foreign_key_scoping.py`'s sweep had its
> own hand-copied FK-field list that would have silently never covered any of
> the new IPD schemas).
>
> **One scope boundary worth knowing now, not discovering later:** the
> `admission_id` columns migration 4 added to `vitals`/`prescriptions` (and 3
> added to `medication_orders`/`injection_orders`/`test_orders`/`payments`)
> have no API surface writing to them yet — `VitalsCreate` and the rest were
> never extended with an `admissionId` field. Nursing/doctor charting during a
> stay is served by `ProgressNote` alone in this pass. That's a deliberate,
> documented cut (see §4.5's last row), not an oversight — but it means a
> stay's vitals timeline, medication administration record, and lab/pharmacy
> billing during an admission are not yet buildable from what exists today.
>
> **Verified, not executed:** `python3 -m py_compile` clean across the whole
> backend (including every test file), `npx tsc --noEmit` clean across the
> whole frontend, single Alembic head. **Nothing has run against a real
> database, and pytest has not executed a single test** — no Postgres/deps in
> the environment this was built in, so every test in §4.5 is verified by
> careful reading against the actual handler code, not by a passing run. Run
> `alembic upgrade head` and `pytest` locally, and click through the four
> screens against a non-live tenant, before this goes near the maternity
> hospital's environment — per §6, and doubly so now that nothing has
> actually executed yet.
>
> **Non-negotiable constraint:** one hospital (maternity, category `maternity`)
> is live on this codebase today. Every change below is written to be
> **zero-effect on any hospital that does not have `modules.ipd = true`** — which
> is every hospital that exists right now, including the live one. Where a
> change touches a table or function the live hospital's traffic already goes
> through, this document says explicitly why it is still safe.

---

## 0. Decisions this plan locks in

Read this section first — it's the part most likely to need your correction
before anything else in the document matters.

| # | Decision | Why |
|---|---|---|
| D1 | OPD/IPD is a **hospital module flag**: `hospital.modules.ipd` (boolean), same mechanism as `lab`, `pharmacy`, `nursing`, `anc`, etc. | It's the existing pattern for "this hospital's plan includes this feature" — reusing it means every enforcement point (permission masking, sidebar, licence catalog) already knows how to read it. No new authorization concept. |
| D2 | The flag is **superadmin-controlled**, not self-serve by a hospital admin. | `models.py` already comments `modules` as "superadmin-controlled" ([models.py:56](apps/api/app/models.py#L56)), and CLAUDE.md is explicit that module/provisioning decisions belong to the platform, not a hospital admin — the same reasoning that keeps `hospital.settings.manage` and `departments.manage` off the admin role. Enabling IPD is a plan/billing decision, same class as enabling `lab` or `pharmacy`. |
| D3 | Default is `false` for **every hospital that exists today**, including the live maternity one. Nothing is backfilled. | Turning IPD on for a hospital is a deliberate, later, single-hospital action — not a side effect of shipping this code. |
| D4 | The live maternity hospital is **not** a target for enabling IPD as part of this work. This plan ships the capability; enabling it anywhere is a separate decision made after the capability has been verified on a non-live tenant. | Directly serves "don't raise bugs on the live hospital" — the safest way to guarantee that is for its `modules` row to never change. |
| D5 | Module key is named `ipd` (lowercase, matches `lab`/`anc` style, not `ipdBedManagement` or similar). | Consistency with existing `HospitalModules` keys. |

If any of D1–D5 is wrong, say so before implementation starts — D2 in particular
determines who can even reach the toggle.

---

## 1. Why this is safe to build alongside a live hospital

Every category of change below, and the specific reason it cannot alter
behavior for a hospital whose `modules.ipd` is absent/false:

| Change type | Why it's inert for an opted-out hospital |
|---|---|
| New tables (`wards`, `beds`, `admissions`, …) | Nothing reads or writes them unless a request explicitly hits a new IPD endpoint, which itself 403s without `modules.ipd` (see below). An empty table changes nothing. |
| New **nullable** columns on existing tables (`vitals.admission_id`, `medication_orders.admission_id`, `payments.admission_id`, …) | `ALTER TABLE ... ADD COLUMN ... NULL` is metadata-only in Postgres — no table rewrite, no lock beyond a brief `ACCESS EXCLUSIVE` for the DDL itself, no downtime. Existing rows get `NULL`. Existing code that doesn't reference the new column is byte-for-byte unaffected. |
| `DROP NOT NULL` on `vitals.appointment_id` / `prescriptions.appointment_id` | This *loosens* a constraint. A write that was valid before is still valid. Nothing that used to be rejected starts being accepted in a way that changes existing behavior — the existing `VitalsCreate`/`PrescriptionCreate` Pydantic schemas still require `appointmentId` from the OPD flow (see §3.2), so the API contract for existing callers doesn't change even though the DB now permits more. |
| New `CHECK` constraint on `vitals`/`prescriptions` ("exactly one of `appointment_id`/`admission_id`") | Validated against existing data at migration time. Every row today has `appointment_id` set and `admission_id` NULL → passes trivially. Every write through the *existing* `vitals.py`/`prescriptions.py` routers continues to only ever set `appointment_id`, so it keeps passing after the migration too. |
| New `permissions` rows, all with `module: "ipd"` | `effective_permissions()` ([authz.py:58](apps/api/app/authz.py#L58)) drops any permission whose module flag the hospital doesn't have. With `modules.ipd` absent, none of these rows are ever granted to anyone at the maternity hospital, however its `role_permissions` table is edited. |
| New routes in `dashboardRoutes`, each with `module: 'ipd'` | `navRoutesForRole` ([roles.ts:557](apps/web/lib/roles.ts#L557)) filters out any route whose module the hospital lacks — the sidebar is unchanged for every existing hospital. |
| Fix to `own_patients_filter` (§4, adds an `Admission`-based OR-arm) | Purely additive `OR` condition. For a hospital with zero `admissions` rows the added sub-select returns an empty set — the filter's result is identical to today. |
| New Alembic revisions | Additive DDL only (see the per-revision table in §5) — no revision in this plan drops a column, drops a table, renames anything, or rewrites data on an existing table. |

**Net effect on the live maternity hospital: none, until someone with
`hospitals.manage` explicitly sets its `modules.ipd` to `true` — which this
plan does not do.**

---

## 2. Multi-tenancy contract — applied to every new table and endpoint

Non-negotiable, per table/endpoint added in §4:

1. `hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)` on every new table.
2. Every read goes through `scoped(db, Model, tenant_id)` ([tenancy.py:35](apps/api/app/tenancy.py#L35)) — never a bare `db.query(Model)`.
3. Every body foreign key (`patient_id`, `doctor_id`, `ward_id`, `bed_id`, `admission_id`) is either checked with `assert_in_tenant` explicitly or added to `_body_foreign_keys()` ([tenancy.py:106](apps/api/app/tenancy.py#L106)) so `assert_body_in_tenant` sweeps it automatically.
4. Every endpoint depends on `get_tenant_id` for the tenant and `require_permission("<code>")` for capability — never a role-name check (`if user.role == "doctor"` does not appear anywhere new, per the existing rule in `authz.py`).
5. A record that doesn't exist *or* belongs to another tenant/another patient returns **404**, never 403.
6. Facts about what happened — `discharged_at`, bed-status flips on assignment/release, accrued room charges — are computed and written by the server, never accepted from the request body.

---

## 3. The OPD/IPD switch, end to end

### 3.1 What already exists and needs zero backend change

`PATCH /hospitals/{hospital_id}` (gated on `hospitals.manage`, superadmin-only)
already accepts a generic `modules: Optional[dict]` and `setattr`s it onto the
`Hospital` row ([hospitals.py:428-439](apps/api/app/routers/hospitals.py#L428),
`HospitalUpdate` schema). **The backend can already turn `ipd` on for an
existing hospital today, with no code change** — the schema doesn't enumerate
module keys, it's a raw dict.

One caveat to build the frontend around: that endpoint **replaces** `modules`
wholesale (`setattr(hospital, "modules", value)`), it does not deep-merge. Any
UI that flips one module must send the hospital's *entire* current `modules`
object with just that one key changed, or it will silently turn every other
module off. This is an existing behavior, not something this plan changes —
just something the new UI (§3.3) has to respect.

### 3.2 The edit UI — done

There was no screen that edited an existing hospital's modules — only a
read-only checklist. **Built**, but not where this plan originally guessed
(§4.4 below said `PlatformHospitals.tsx`): the better home turned out to be
`/dashboard/setup`
([HospitalSetup.tsx](apps/web/components/setup/HospitalSetup.tsx)), which
already rendered a `MODULE_LABELS` checklist — checkmarks for the hospital's
own modules (`isActiveCategory` branch) versus a preview of what a *different*
category's template would give it — it just never let anyone click one.
`PlatformHospitals.tsx`'s `RecordDialog` really is read-only detail, with no
form fields anywhere else on that screen; `HospitalSetup.tsx` is the actual
"edit this hospital's configuration" screen (permission
`hospital.settings.manage`, the one CLAUDE.md names for exactly this class of
decision), so extending its existing checklist was the "reuse the component
that's already there" move, not a new screen.

The checklist is now editable checkboxes bound to a `moduleDraft` state, with
a **Save modules** button that calls the *already existing*
`useUpdateHospitalMutation` (`updateHospital`,
[store/api.ts:1139](apps/web/store/api.ts#L1139)) — no backend change needed,
confirming §3.1's claim. `ipd` was added to `MODULE_LABELS` alongside the
existing seven keys.

Handled the replace-not-merge behavior from §3.1 directly: the draft is seeded
from the hospital's modules merged onto an all-`false` `EMPTY_MODULES` shape
(so a hospital missing a key entirely still renders a defined checkbox rather
than `undefined`), and Save always sends the complete object. Previewing a
*different* category stays exactly as read-only as before — Apply there still
only ever replaces departments, never modules.

### 3.3 How FE/BE customize once the flag is on

- **Backend:** `effective_permissions()` starts including the `module: "ipd"`
  permission rows for that hospital's role grants (§4.2). Every IPD router
  still requires the specific permission on top of the module gate — turning
  the module on alone grants nothing until a superadmin also ticks the
  relevant role/permission grants on the Roles screen.
- **Frontend:** `navRoutesForRole` starts including the IPD-tagged routes in
  that hospital's sidebar, for whichever roles hold the matching permission
  (§4.4). No other hospital's sidebar is affected — the filter runs per-session
  against that session's own hospital's modules.

---

## 4. Full change list

Every file this plan touches or adds. Status starts `planned` for all rows.

### 4.1 Backend — new files

| File | Contents | Status |
|---|---|---|
| `apps/api/app/routers/wards.py` | CRUD for `Ward`. **done.** List is gated on `require_any_permission("wards.manage", "beds.read")` (no separate `wards.read` was added — a bed picker holding only `beds.read` still needs to see the ward list). Delete refuses with 409 if any of the ward's beds is `occupied`. | done |
| `apps/api/app/routers/beds.py` | CRUD for `Bed`, `GET /beds?wardId=&status=vacant,maintenance` for the admission flow's bed picker. **done.** `PUT` only allows flipping `status` between `vacant`/`maintenance` by hand (400 otherwise) — `occupied`/`reserved` are facts `routers/admissions.py` writes; both `PUT` and `DELETE` refuse on an occupied bed. | done |
| `apps/api/app/routers/admissions.py` | List/detail/create/update/transfer/delete for `Admission`. **done**, discharge itself is not here (see below). Design decisions worth knowing: **no `status` field on `AdmissionUpdate`** — every non-"admitted" status is a discharge-shaped closure, written only by `discharge_summaries.py` alongside the `DischargeSummary` row, never a bare status edit; **bed transfer is its own endpoint** (`POST /admissions/{id}/transfer`), not a field on the update body, so it can independently block `own` scope the way `appointments.py` blocks doctor-reassignment; **`admission_number` generation is self-contained** (`ADM-000001`, sequential count+1 per tenant with a retry-on-collision loop) rather than reading `hospital_profiles.mrn_prefix/mrn_format` — nothing in this codebase generates a patient MRN from those columns either yet, so wiring IPD into them would use a pattern nothing else follows; **deleting an admission releases its bed** rather than leaving it stuck `occupied`; **no notifications wired yet** (unlike appointments' `notify.py` calls) — a deliberate scope cut, not an oversight. | done |
| `apps/api/app/routers/progress_notes.py` | Doctor-authored ward-round notes against `admission_id`. **done.** Not nurse-authored — see the permission-grant correction below. | done |
| `apps/api/app/routers/discharge_summaries.py` | `POST /discharge-summaries` **is** the discharge action: creates the `DischargeSummary`, closes the `Admission` (status mapped from `discharge_type`: routine→discharged, referred→transferred_out, dama→dama, deceased→deceased) and releases its bed, all in one transaction, so a stay can never end up half-closed. No edit endpoint at all — immutable once created. **done.** | done |
| `apps/api/app/routers/ipd_billing.py` | Nested under `/admissions/{id}/bill` and `/admissions/{id}/charge-items`. `GET .../bill` computes room total (nights × the bed's *current* `daily_rate`, not a frozen snapshot) + itemized charges + payments already recorded against that `admission_id`, via a shared `app/ipd.py` helper. `POST .../charge-items` refuses `charge_type="room"` (computed, not enterable) but is deliberately allowed after discharge (settling the final bill is a post-discharge activity). **done.** | done |
| `apps/api/app/ipd.py` (not originally listed — added while building the above) | Shared IPD domain module, the `pricing.py`/`consent.py` pattern: `TERMINAL_STATUSES`, `compute_bill()`, and two ownership-filter helpers (`own_discharge_summaries_filter`, `caller_may_view_admission`) needed because `DischargeSummary`/billing are reached through `admission_id`, not a direct `patient_id` column — `authz.own_record_filter`'s generic check would silently match nothing for a patient's "own" grant otherwise, the same class of gap the `own_patients_filter` fix addressed earlier. | done |

### 4.2 Backend — modified files

| File | Change | Risk to existing behavior |
|---|---|---|
| `apps/api/app/models.py` | Add `Ward`, `Bed`, `BedAssignment`, `Admission`, `ProgressNote`, `DischargeSummary`, `AdmissionChargeItem` classes. Add `intake_ml`, `output_ml`, `admission_id` (nullable) to `Vitals`. Make `Vitals.appointment_id` nullable; add `admission_id` (nullable) to `Prescription` and make its `appointment_id` nullable. Add nullable `admission_id` to `MedicationOrder`, `InjectionOrder`, `TestOrder`, `Payment`. | None — additive columns/tables only, per §1. |
| `apps/api/app/authz.py` | `own_patients_filter` ([authz.py:78](apps/api/app/authz.py#L78)): add an `OR` arm — patients the caller has an open or past `Admission` with as `doctor_id`, alongside the existing `Appointment`-based arm. This is a **real gap being fixed**, not new scope: a doctor who only ever treats a patient through an admission (e.g. an ER admit with no prior OPD visit) currently cannot see that patient under an `own` grant at all. | None for hospitals with zero admissions (empty sub-select, §1). Strictly additive for hospitals with IPD live. |
| `apps/api/app/tenancy.py` | `_body_foreign_keys()` ([tenancy.py:106](apps/api/app/tenancy.py#L106)): add `ward_id → Ward`, `bed_id → Bed`, `admission_id → Admission`. | None — dict addition, only affects request bodies that carry those field names, which none do today. |
| `apps/api/app/billing_config.py` | Add branches for new `Payment.payment_type` values (`ipd_room`, `ipd_deposit`, `ipd_package`, `ipd_misc` — naming TBD in §7) alongside existing `consultation`/`pharmacy`/`lab`/`injectable`. | None — existing payment types keep their existing branches untouched; this only adds new ones. |
| `apps/web/lib/hospitalCategories.ts` (frontend, listed here for the pairing) | Add `ipd: false` to `ALL_ON` (or wherever the default map lives) so category templates that don't mention it explicitly still resolve to off; leave `multi-specialty`'s template as-is for now per D4 — do **not** flip it to `true` in this pass, since that would make every *newly onboarded* multi-specialty hospital IPD-on by default, which is a product decision to confirm separately (§7). | None for any already-onboarded hospital (templates only apply at onboarding time). |
| `apps/web/lib/types.ts` | Add `ipd: boolean` to `HospitalModules` ([types.ts:823](apps/web/lib/types.ts#L823)). | TypeScript-only; `next.config.mjs` has `typescript.ignoreBuildErrors` so this can't fail a build even if a stray literal is missed, but run `npx tsc --noEmit` anyway per the project's own check. |
| Alembic `alembic/versions/` | See §5 for the exact ordered list of revisions. | See §5. |

### 4.3 Frontend — new files

| File | Contents | Status |
|---|---|---|
| `apps/web/app/dashboard/wards/page.tsx` + `components/wards/{WardsBedsHub,WardsPanel,BedsPanel}.tsx` | Wards & Beds screen, admin (+superadmin, via the existing `?h=` cross-tenant mechanism — no extra plumbing needed, `store/baseQuery.ts` already injects `X-Hospital-Id` from it). Two-tab hub mirroring `InventoryHub`'s Medicines/Injectables split; each panel does inline add/edit like `ConsultationFeesContent`, not a modal. `BedsPanel` refuses to edit/delete an `occupied` bed client-side (the API already refuses it; this just avoids a round trip to find out) and its status toggle only ever offers vacant⇄maintenance. | **done** |
| `apps/web/app/dashboard/admissions/page.tsx` + `components/admissions/AdmissionsList.tsx` | Admissions list. **One component for every viewing role** (admin/doctor/nurse/receptionist/superadmin), not one per role the way Appointments has — the backend already returns the correctly-scoped set (own vs all), so there's no shape difference to dispatch on, unlike Appointments' genuinely different patient/doctor/admin card layouts. | **done** |
| `apps/web/app/dashboard/admit/page.tsx` + `components/admissions/AdmitPatientForm.tsx` | Admission-creation flow — parallel to `/dashboard/book`, same multi-role reuse `AdminBook` has. A doctor's `own` scope locks the doctor field to their own record (via `useGetDoctorByUserQuery`) rather than offering a picker. Refuses to render the form at all when there are zero vacant beds, rather than a picker with nothing in it. | **done** |
| `apps/web/app/dashboard/ipd/[id]/page.tsx` + `components/admissions/AdmissionWorkspace.tsx` | The admission workspace — header (patient/doctor/ward-bed/status), bed transfer (`all` scope only), progress notes (add + timeline), running bill (room total + itemized charges + add-charge), discharge (form when open, read view once a `DischargeSummary` exists). **Not in `lib/roles.ts`'s route table at all** — reached only via a link from the Admissions list, the same way `/dashboard/consult/[id]` isn't in the table either; the page calls `useDashboardGuard()` path-less and `GET /admissions/{id}` 404ing a non-party caller *is* the access check. Discharge and charge-item creation both rely on RTK Query tag invalidation to flip the UI over automatically — no manual refetch/callback wiring. | **done** |

### 4.4 Frontend — modified files

| File | Change | Status |
|---|---|---|
| `apps/web/lib/types.ts` | Mirrors the new backend models: `Ward`, `Bed`, `Admission`, `ProgressNote`, `DischargeSummary`, `AdmissionChargeItem`, `AdmissionBill`, plus `ipd: boolean` added to `HospitalModules`. | **done** |
| `apps/web/lib/hospitalCategories.ts` | `ipd: false` added to `ALL_ON` — no category template flips it on yet (§7 is still open). | **done** |
| `apps/web/store/api.ts` | New RTK Query endpoints for wards/beds/admissions/progress-notes/discharge-summaries/billing, new tag types, and — importantly — `modules?: HospitalModules` added to the *existing* `HospitalUpdateBody` (it had no typed field for this before). | **done** |
| `apps/web/lib/roles.ts` | New `dashboardRoutes` entries: `/dashboard/wards` (gated on `beds.read`, the broader of the two ward/bed permissions, same relation `inventory.read` has to `.manage`), `/dashboard/admissions`, `/dashboard/admit` (`hideInNav: true`, parallel to `/dashboard/book`) — each `module: 'ipd'`. **`alwaysAllowedPathPrefixes` gained `/dashboard/ipd`, not `/dashboard/admissions`** — `canAccessPath`'s prefix check treats the prefix itself as always-allowed too (`path === p`), so reusing the list's own path as a prefix for its detail sub-route would have silently bypassed the list's `admissions.read` gate for anyone signed in. Named the workspace path distinctly instead, the same way `/dashboard/consult` is distinct from `/dashboard/appointments` — this is *why* the workspace file above is `/dashboard/ipd/[id]`, not `/dashboard/admissions/[id]`. | **done** |
| `apps/web/components/setup/HospitalSetup.tsx` | The module-edit control — see §3.2, which now describes what was actually built and where (not `PlatformHospitals.tsx`, as originally guessed here). | **done** |
| `apps/web/lib/date.ts` | Added `fmtDateTime()` — the existing `fmtDate()` truncates to a bare date, which loses the hour on admission/discharge/progress-note timestamps where it matters. Shared across the three IPD screens that needed it rather than a local copy in each. | **done** |

### 4.5 Tests — new files (backend, `apps/api/tests/`)

All **done**. A significant, unplanned addition first: `hospital_a`/`hospital_b`
never have `ipd` enabled (deliberately — see §1), so none of them can exercise
a real IPD create/read. Added two more fixtures, `hospital_c`/`hospital_d`, in
`conftest.py` — built the same way as `hospital_a`/`hospital_b` (through the
real API, provisioned via `_build_tenant`), then flipped `ipd` on via the same
`PATCH /hospitals/{id}` a superadmin would use, via a new `_enable_ipd()`
helper, which also seeds one ward/bed/admission per tenant (the IPD
counterpart of the appointment/vitals/prescription set `_build_tenant`
already seeds for OPD).

Also fixed a real gap in an *existing* test, found while extending it:
`test_foreign_key_scoping.py`'s `test_every_fk_carrying_schema_has_a_guarded_handler`
sweep keeps its own hand-copied `fk_fields` dict of FK-field-name → model,
separate from `tenancy.py`'s `_body_foreign_keys()` — despite the docstring's
"derived from the schemas" claim, that specific mapping is not auto-derived,
so it would have silently never checked any of the new `ward_id`/`bed_id`/
`admission_id`/`referring_doctor_id` schemas. Added the four missing entries;
without that fix, none of the new IPD routers' tenant-safety would have been
covered by this suite's strongest, most general guard. Also fixed a
now-stale comment in `apps/api/app/routers/patients.py` that said
`own_patients_filter` "only includes patients with existing appointments" —
no longer true after the `authz.py` fix in §4.2.

| File | Asserts |
|---|---|
| `test_ipd_tenant_isolation.py` | Wards/beds/admissions/progress-notes/discharge-summaries/billing are invisible across hospitals (`hospital_c`/`hospital_d`) — same shape as `test_tenant_isolation.py`. |
| `test_ipd_foreign_key_scoping.py` | `patientId`/`doctorId`/`referringDoctorId`/`bedId`/`wardId`/`admissionId` on a request body naming another tenant's row is refused, for beds/admissions/progress-notes/discharge-summaries — the concrete, HTTP-level companion to the AST-based sweep in `test_foreign_key_scoping.py`. |
| `test_bed_double_assignment.py` | A second admission (or a transfer) into an already-occupied bed is refused with 409 — same shape as the duplicate-department-booking checks in `appointments.py`. |
| `test_admission_locked_after_discharge.py` | Discharge creates the summary, closes the admission, and frees its bed, all together; a closed admission then refuses edits, transfer, new progress notes, and a second discharge (409 each); the `DischargeSummary` itself has no edit route at all — asserted as a 404/405 on a `PUT` to a path that was never registered, not a 409 from one that exists. |
| `test_ipd_delete_is_platform_only.py` | Admin gets 403 deleting a ward/bed/admission; rows still exist after; admin can still edit; superadmin *can* delete — extends `test_delete_is_platform_only.py`'s pattern to the three new resources. |
| `test_ipd_module_gating.py` | The test that proves §1's central safety claim in code: `hospital_a` (`ipd` off) gets 403 on every IPD endpoint under the *same* `admin` role grants `hospital_c` (`ipd` on) succeeds with — isolating the module flag as the only variable, not a difference in permissions between the two fixtures. Superadmin is explicitly out of scope here (documented in the file): a platform user bypasses module gating entirely, for every module, which predates this work. |
| `test_own_patients_filter_admission_arm.py` | A doctor with only an `Admission` (no `Appointment`) to a patient can still see that patient under an `own` grant — proves the `authz.py` fix in §4.2 — plus the complement, that a patient with neither relationship stays invisible, so the fix is proven additive rather than a blanket widening. |
| `test_ipd_does_not_affect_opd_vitals.py` | The test most directly protecting the live hospital: creating a `Vitals` row the existing OPD way (`hospital_a`, maternity category, `ipd` never on) behaves identically after migration `e21ce148a645` — including the maternity-specific `lmp`/`edd`/`pog`/`pregnancyStatus` fields the live hospital actually depends on, and an explicit check that `VitalsCreate` still refuses a request with no `appointmentId` (422) exactly as it always has. **Note the scope boundary this test surfaces**: `VitalsCreate` was never extended with an `admissionId` field — the DB column and CHECK constraint from migration 4 exist, but nothing in the API can create an admission-linked `Vitals` row yet. Nursing/doctor charting during a stay is served by `ProgressNote` only in this pass; admission-linked vitals/medication-orders/injection-orders/test-orders/payments (their DB columns exist too, per §4.2) are a follow-up, not part of what "done" means here. |

---

## 5. Migration plan (ordered)

Each revision does one thing, matching the one-concern-per-migration style
already used in this repo (e.g. [a91d0e57cb43](apps/api/alembic/versions/a91d0e57cb43_add_lab_order_review_permission.py)).

**Pre-existing state found while starting this:** the repo already had two
unmerged Alembic heads (`8d94a370030c` — receptionist clinical-read merge, and
`q2r3s4t5u6v7` — razorpay keys), independent of this work. Resolved with a merge
revision (`51f2eec70416`, no-op `upgrade`/`downgrade`) before branching the IPD
migration off the merged head — the routine resolution step §5's intro
anticipated, not a sign anything is wrong.

| # | Revision does | Status | Revision id | Reversible? | Safety note |
|---|---|---|---|---|---|
| 1 | Create `wards`, `beds`, `bed_assignments`, `admissions` | **done** | `e48dd4ce38b9` (on `51f2eec70416` merge) | Yes — `downgrade()` drops the tables | New tables, no interaction with existing ones. `beds.ward_id`/`wards.department_id` are real FKs (mirrors `doctors.department_id`); `admissions`/`bed_assignments` reference `patient_id`/`doctor_id`/`ward_id`/`bed_id` as plain indexed strings, matching how `appointments.patient_id`/`doctor_id` are already done. |
| 2 | Create `progress_notes`, `discharge_summaries`, `admission_charge_items` | **done** | `205e56695c57` | Yes — `downgrade()` drops the tables | New tables. `discharge_summaries.admission_id` is unique (one summary per stay). |
| 3 | Add nullable `admission_id` to `medication_orders`, `injection_orders`, `test_orders`, `payments` | **done** | `061499cf1d90` | Yes — `downgrade()` drops the columns | `ADD COLUMN ... NULL`, metadata-only. Deliberately **not** exclusive with `appointment_id` at the DB level — those four tables already support "neither" (an OTC hand-out, a payment with no visit), and a hard constraint would have broken that existing case. |
| 4 | Add nullable `admission_id` (+ `intake_ml`/`output_ml` on vitals) to `vitals`/`prescriptions`; **drop NOT NULL** on their `appointment_id`; add the "exactly one of appointment_id/admission_id" `CHECK` constraint via Postgres `num_nonnulls()` | **done** | `e21ce148a645` | Yes — `downgrade()` restores NOT NULL (only safe because every existing row already satisfies it), drops the constraint and the added columns | The one revision that alters a constraint on live tables. `num_nonnulls(appointment_id, admission_id) = 1` validates against every existing row at migration time (all satisfy it: `appointment_id` set, `admission_id` NULL) — takes a brief `ACCESS EXCLUSIVE` lock to do that validation scan, sub-second at this table's current size but worth watching in a slow-query log rather than assuming instant. **Run this against a copy of the actual maternity-hospital schema before it goes anywhere near production**, per §6 step 1. |

**Also done, ahead of the router work in §4.1** (small, low-risk, and directly needed by the models above):
- `apps/api/app/authz.py` — `own_patients_filter` gained the `Admission`-based "treated" arm described in §4.2 (a doctor who only ever meets a patient through an admission can now see them under an `own` grant).
- `apps/api/app/tenancy.py` — `_body_foreign_keys()` now maps `ward_id`/`bed_id`/`admission_id` to their models, so `assert_body_in_tenant` will cover them automatically once a router's request body carries those fields.
| 5 | Insert 12 IPD permission catalog rows (`wards.manage`, `beds.manage`, `beds.read`, `admissions.read/create/manage/discharge`, `progress_notes.read/write`, `discharge_summaries.read`, `ipd_billing.read/manage`) + `role_permissions` grants for admin/doctor/nurse/receptionist/patient/superadmin | **done** — `639864825d7d` | Yes — `downgrade()` deletes the inserted rows, same shape as [a91d0e57cb43](apps/api/alembic/versions/a91d0e57cb43_add_lab_order_review_permission.py) | No effect until a hospital's module is on (§1). `sort_order` 1000-1120, an unused block (checked against every existing migration). Edited in place (not a follow-up migration, since nothing had run) after two design corrections found while writing the routers: dropped a redundant `discharge_summaries.write` — closing a stay is one action, already gated on `admissions.discharge` — and revoked nurse's `progress_notes.write` grant (kept `.read`), since `ProgressNote` is `doctor_id`-shaped like `MedicalRecord` and a nurse authoring one never fit the model; a nurse's own charting is `Vitals.intake_ml/output_ml`. |
| 6 | Insert `<resource>.delete` permission rows for `wards`/`beds`/`admissions`, `module='ipd'`, granted to `superadmin` only | **done** — `d82b1ad42845` | Yes | Same idempotent `ON CONFLICT DO NOTHING` shape as [x9y0z1a2b3c4](apps/api/alembic/versions/x9y0z1a2b3c4_delete_is_platform_only.py), which this literally extends |

If any of these land while another branch also adds a migration, expect an
Alembic multiple-heads situation — this repo already has several
`*_merge_heads.py` revisions, so that's a known, routine resolution step, not
a sign something went wrong.

---

## 6. Rollout sequencing and pre-merge verification

Order of work, each step verified before starting the next:

1. **Migrations 1–4**, applied to a local/staging copy of the *actual* database
   (or a fresh copy of its schema + representative data) — not just a clean
   test DB. Confirm: `alembic upgrade head` succeeds, the new CHECK constraint
   validates cleanly against real `vitals`/`prescriptions` rows, and the
   existing test suite (`npm test` per the backend suite) still passes
   unchanged.
2. **Models + `authz.py`/`tenancy.py` changes**, with the new regression tests
   from §4.5 (`test_ipd_does_not_affect_opd_vitals.py` and
   `test_own_patients_filter_admission_arm.py` especially) passing alongside
   the full existing suite.
3. **Migrations 5–6** (permissions), with `test_ipd_module_gating.py` passing —
   this is the test that proves a hospital without `modules.ipd` sees zero
   behavior change even after every grant exists in `role_permissions`.
4. **Backend routers** (`wards.py`, `beds.py`, `admissions.py`, …), each with
   its own tenant-isolation/FK-scoping/lock tests before moving to the next.
5. **Frontend**: module-edit UI first (§4.3), verified against a *non-live*
   test hospital in staging — flip its `modules.ipd` on, confirm the sidebar
   changes for that hospital only, confirm the maternity hospital's session is
   untouched. Then the wards/admissions/admit screens.
6. **Before any deploy that includes this code reaches the environment the
   maternity hospital runs in:** run the full existing suite once more against
   that environment's schema, and manually spot-check the maternity hospital's
   live OPD + ANC flows (booking, vitals with `pregnancy_status`/`lmp`/`edd`,
   prescriptions, payments) in a browser — per CLAUDE.md's own rule that a
   passing test suite is not the same claim as a verified feature.
7. **Enabling `modules.ipd` for any real hospital** is explicitly out of scope
   for this rollout (D4) — it happens later, as its own decision, on a
   hospital that isn't already live with patients in it.

---

## 7. Open questions for you to confirm

1. **D2** — confirm IPD stays superadmin-only to toggle, not hospital-admin
   self-serve. (Recommended: yes, matches every other module.)
2. **Payment type naming** — `ipd_room` / `ipd_deposit` / `ipd_package` /
   `ipd_misc`, or different labels?
3. Should `multi-specialty`'s onboarding template default to `ipd: true` for
   *newly onboarded* hospitals once this ships, or should IPD stay an opt-in
   toggle even at onboarding time, for every category? (This has zero effect
   on already-onboarded hospitals either way — it only affects hospitals
   onboarded after the change.)
4. Any target hospital/timeline for actually flipping `modules.ipd` on
   somewhere real, once this is built and verified? (Not the maternity one,
   per D4 — either a new demo/staging tenant or a future customer.)

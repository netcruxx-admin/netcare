# Netcare Public Marketplace — Planning Document

> **Status:** Planning only. Nothing in this document is implemented.
> **Written:** 2026-10-08
> **Decision owner:** Product owner (Abhir Sharma)
> **Purpose:** Record the idea, the reasoning, the design options considered, the recommended
> approach, the risks, and the phased plan for opening `netcare.co.in` to the local public so they
> can find and book appointments at hospitals registered on the platform.

---

## 1. The idea

Until now Netcare was planned as **HMS/HIS software**: a hospital buys access, gets a private
subdomain (`cityhospital.netcare.co.in`), and its staff and patients live inside that tenant.

The new idea adds a **public front door** on the main domain:

> A member of the local public visits `netcare.co.in`, searches for hospitals and doctors near
> them, sees real availability, and books an appointment — at any hospital registered with the
> platform.

This turns Netcare from "software sold to hospitals" into "software sold to hospitals **plus** a
patient-discovery channel that sends them bookings".

### Why it is worth doing
- **Gives hospitals a reason to join.** The HMS is a back-office purchase; a stream of new
  patients is a revenue purchase. The marketplace is lead-generation for the HMS.
- **Retention.** A hospital that receives bookings through Netcare is expensive to leave.
- **Uses what exists.** Doctors, departments, schedules, fees, availability and booking are
  already built. Most of the work is a *public, read-mostly surface* on top of them.
- **A new revenue line.** A per-booking fee or commission is possible later.
- **A sales signal.** Searches in cities with no listed hospital show where to sell next.

---

## 2. What already exists (verified in the codebase)

| Need | Already there |
|------|---------------|
| Platform front door | `apps/web/app/page.tsx` — the apex already serves a platform landing page (`PlatformLandingPage`) |
| "No tenant" on the apex | `middleware.ts`, `lib/tenant.ts` and `tenancy.py` all treat the apex and `www` as having no tenant; `NEXT_PUBLIC_ROOT_DOMAIN` identifies the apex |
| Location data | `hospital_profiles` has `city`, `state`, `pincode`, `latitude` (and longitude) |
| Who is eligible | `hospitals.status` (active/suspended) and `hospitals.onboarding_status` (pending/documents_submitted/verified/rejected) |
| Doctors, departments, fees | `doctors`, `departments`, `consultation_fees` |
| Availability without leaking patients | `GET /doctors/{id}/availability` returns taken times with no patient on them |
| Booking | `Appointment` model with `booked_by_user_id` / `booked_by_role` |
| Per-hospital landing pages | Subdomains already have admin-authored landing pages (latest commit) |

### What does **not** exist
- Any unauthenticated API surface. Every current endpoint depends on `get_tenant_id` and
  `require_permission`.
- A way for a hospital to say "list me publicly".
- Any identity that spans hospitals.
- Phone OTP verification, rate limiting, captcha, SMS/WhatsApp sending.
- Server-rendered, indexable public pages.

---

## 3. The central design problem: identity is per hospital

CLAUDE.md defines three independent questions for every request: **tenant, identity, capability.**
A public marketplace bends all three:

1. **Tenant** — comes from the *hospital named in the URL or body*, not from a JWT.
2. **Identity** — the caller is an anonymous member of the public, not a user row.
3. **Capability** — there is no role to grant a permission to; the check becomes "is this field
   public, and is this hospital listed?".

On top of that, a patient today is a `users` row **inside one hospital**. Email is unique per
hospital, and phone is deliberately *not* unique (households share numbers). A marketplace patient
who books at Hospital A and Hospital B has no single account.

### Options considered

| | Option A — Guest booking | Option B — Platform-level identity |
|---|---|---|
| How | Visitor enters name + phone, verifies by OTP. Server finds or creates the patient row **inside the chosen hospital's tenant** and books there. | New `platform_users` table linked to per-hospital patient rows; a platform JWT that can act across tenants. |
| Tenant isolation | Unchanged | Needs a new, carefully-audited cross-tenant path |
| Effort | Small | Large (auth, JWT, session model, merge/dedupe, account recovery) |
| "My appointments" across hospitals | Not at first; later via a narrow verified-phone lookup | Native |
| Risk | Low | High — touches the core security guarantee |

### Recommendation: **Option A for v1**
Phone OTP *is* the platform identity. Revisit Option B only once there is evidence people want a
persistent cross-hospital account. A narrow "my bookings" lookup (verified phone → list of
appointments across hospitals) can be added later without building a full account system.

**Rule that must hold in Option A:** a public booking writes into exactly **one** tenant — the
hospital the visitor chose — and the server, not the client, decides the tenant.

---

## 4. Architecture

### 4.1 Where things live
- **Marketplace** — the apex (`netcare.co.in`, `www`). Directory, search, hospital and doctor
  pages, booking flow.
- **Hospital's own site and staff/patient portal** — unchanged, on the subdomain.
- Booking can either complete on the apex or hand off to `hospital.netcare.co.in/book`. Staying on
  the apex is simpler for guest booking and avoids cross-subdomain cookies.

### 4.2 A new, separate API surface: `/public/*`
Kept in its own router module, clearly separated from the authenticated routers so that no one
adds a bare `db.query` to it by accident.

| Endpoint | Purpose |
|----------|---------|
| `GET /public/hospitals` | Search/list listed hospitals (city, pincode, specialty, text) |
| `GET /public/hospitals/{subdomain}` | One hospital's public profile |
| `GET /public/hospitals/{subdomain}/doctors` | Public doctors at that hospital |
| `GET /public/doctors/{id}` | One public doctor |
| `GET /public/doctors/{id}/slots?date=` | Free slots (no patient information) |
| `POST /public/otp/request`, `POST /public/otp/verify` | Phone verification |
| `POST /public/appointments` | Book (Phase 2) |
| `POST /public/appointments/{id}/cancel` | Cancel via signed token (Phase 2) |
| `POST /public/waitlist` | "Coming to my area" capture |

### 4.3 Rules for the public surface
- **Allow-list schemas, never ORM models.** Every response is a dedicated Pydantic schema listing
  exactly the public fields. Adding a column to a table must never silently publish it.
- **Eligibility is one function.** A single `listed_hospitals()` query defines "publicly
  visible": `status = active` AND `onboarding_status = verified` AND `listed_publicly = true`.
  Every public endpoint goes through it. Suspending a hospital must remove it from the directory
  immediately.
- **Not found and not listed look identical → 404.** Consistent with the existing rule that a
  record that doesn't exist *or* isn't yours returns 404.
- **No patient data ever.** Slots show taken/free only.
- **Rate limited** per IP and per phone; booking additionally captcha-protected.
- **The server decides facts.** Price comes from `consultation_fees`; `booked_by_role="public"`,
  timestamps and status are server-written.
- **Body ids are checked.** `doctor_id` / `department_id` in a public booking body are verified to
  belong to the chosen hospital (`assert_body_in_tenant`, and add new fields to
  `_body_foreign_keys()` in `tenancy.py`).

### 4.4 Data model additions (proposed)

| Change | Notes |
|--------|-------|
| `hospitals.listed_publicly` (bool, default false) | Opt-in by the hospital, approval by the superadmin. Default off so nothing is published by accident. |
| `hospitals.public_listing_approved_at/by` | Server-written fact, like `verified_at`. |
| `doctors.show_publicly` (bool) | Hospital controls which doctors appear. |
| `departments.show_publicly` (bool, optional) | Same, for departments. |
| `hospital_profiles.longitude` (if missing) and geo index | For "near me". |
| `hospital_profiles.public_summary`, opening hours, photos | Public-facing text; reuses the landing-page content where possible. |
| `public_slot_holds` table | `hospital_id`, doctor, date/time, phone, `expires_at` — a 5–10 minute hold. Tenant-owned (has `hospital_id`). |
| `public_otps` table | Phone, hashed code, expiry, attempts. Platform-level, not tenant data. |
| `waitlist_signups` table | Platform-level (city, pincode, phone/email). |
| `hospital_public_settings` (or columns) | Daily public-booking cap per doctor, advance-booking window, public slot share. |

Every *new tenant-owned* table gets the standard `hospital_id` FK with `ON DELETE CASCADE`.
`public_otps` and `waitlist_signups` are platform tables and must be added to the list of
platform tables in CLAUDE.md when they are built.

### 4.5 Frontend
- `app/page.tsx` — new platform landing with search (city/pincode, specialty).
- `app/hospitals` (search results), `app/hospitals/[slug]`, `app/doctors/[id]` —
  **server-rendered** so search engines index them.
- Booking flow: choose slot → details → OTP → confirmation.
- All data via `store/api.ts` (RTK Query), per the existing rule, except server-rendered pages
  which fetch on the server.
- Reuse existing components (`Spinner`, cards, `TablePagination`, the booking UI patterns) —
  "symmetry over novelty".
- Hospital dashboard additions: a "Public listing" settings screen and a "bookings from Netcare"
  stat.

---

## 5. Phased plan

### Phase 1 — Public directory (read-only)
**Goal:** a demo-able directory hospitals can see themselves in.
1. Migration: `listed_publicly`, approval fields, `doctors.show_publicly`, geo fields.
2. `listed_hospitals()` eligibility helper.
3. `/public/hospitals`, `/public/hospitals/{subdomain}`, doctors, slots — allow-list schemas.
4. Rate limiting on the public router.
5. Superadmin screen to approve listings; hospital-admin screen to opt in and choose doctors.
6. Apex landing page with search; server-rendered hospital and doctor pages; sitemap.
7. Tests (see §7).

### Phase 2 — Booking
1. Phone OTP request/verify (SMS provider decision needed — see §9).
2. Slot hold with expiry; release on timeout.
3. `POST /public/appointments` — find-or-create patient in the chosen tenant, book, price on the
   server, `booked_by_role="public"`.
4. Confirmation by SMS/WhatsApp with a signed cancel/reschedule link.
5. Captcha, per-phone and per-IP limits, per-doctor daily public cap.
6. Hospital-side: public bookings appear on the normal appointments board, tagged by source.

### Phase 3 — Growth and money
- Pay-at-hospital first; online payment later (Razorpay Route for split settlement).
- "My bookings" via verified phone.
- Reviews/ratings (with moderation).
- "Near me" by coordinates.
- Waitlist reporting for sales.
- Commission/fee model.

### Phase 4 — Only if the product proves out
- Option B platform-level identity.
- Teleconsultation discovery (video slots already exist).
- Native app.

---

## 6. Risks and feedback

1. **Positioning conflict.** HMS/HIS and a patient marketplace attract different customers.
   Treat the marketplace as the hospital-acquisition and retention feature, not a second company.
2. **Supply problem.** A directory with three hospitals looks empty. Launch **city by city**;
   elsewhere show the waitlist instead of an empty search.
3. **Slot quality is the product.** A stale schedule produces a patient at a closed door, and they
   blame Netcare. Only list doctors who maintain schedule blocks; show the next available slot;
   make hospitals confirm or reschedule promptly.
4. **Hospitals must stay in control.** Per-doctor opt-in, per-doctor daily cap, ability to pause
   public booking instantly. A hospital will not accept strangers filling its schedule unasked.
5. **Abuse.** An unauthenticated write endpoint into a tenant invites slot-hoarding and fake
   bookings. Mitigations: OTP, captcha, rate limits, holds that expire, per-phone booking cap.
6. **Privacy / legal (India).**
   - DPDP Act 2023: consent at collection, a privacy policy, purpose limitation, minimal data.
     Avoid collecting a free-text clinical "reason" publicly unless it is needed.
   - Doctor advertising: NMC / medical-council rules restrict doctors from advertising. Keep
     listings **factual** (name, qualification, registration number, department). No "best
     doctor" rankings and no paid placement without legal review.
   - Terms and cancellation policy, and who is liable for a missed or wrong booking.
   *(Have counsel review before launch; this document is not legal advice.)*
7. **Tenant isolation regression.** The public router is the first place that legitimately works
   without `get_tenant_id`. That makes it the likeliest place for a leak. Keep it small, in one
   module, with allow-list schemas and dedicated tests.
8. **SEO duplication.** The hospital's own subdomain landing page and its apex listing will
   compete. Pick the canonical one (suggest: apex listing is canonical for discovery; subdomain is
   canonical for the hospital's own brand) and set `rel=canonical` accordingly.
9. **Duplicate patients.** Guest booking can create duplicates within a hospital. Match on
   verified phone + name (+ DOB if collected) and let reception merge.
10. **Hospital-side workload.** Public bookings add front-desk work. Provide a source filter and
    a clear "new via Netcare" indicator.

---

## 7. Test plan

Following the existing backend test style (throwaway database, tenant isolation focus). Each of
these should fail loudly if the rule breaks:

- A suspended hospital does not appear in any `/public/*` response; suspending removes it at once.
- A hospital with `listed_publicly = false` or `onboarding_status != verified` is a **404**, not a
  403, on its detail and doctor endpoints.
- A doctor with `show_publicly = false` is never returned, including by direct id.
- No response contains patient names, ids, phones, or notes — assert against the schema field list.
- A public booking writes into exactly the chosen hospital's tenant; a `doctor_id` belonging to a
  different hospital is rejected as 404.
- Price on a public booking comes from `consultation_fees`, regardless of the request body.
- Two concurrent holds on the same slot: one succeeds, one fails.
- OTP: wrong code, expired code, and over-attempt lockout.
- Rate limits trigger on the public router.
- Per-doctor daily public cap is enforced.
- Existing authenticated endpoints are unaffected (full `npm test`).

Frontend currently has no automated tests; `npx tsc --noEmit` in `apps/web` is the check, and the
booking flow should get a manual test script added to the manual test cases sheet.

---

## 8. Checklist from CLAUDE.md applied to this feature

- **New table?** `public_slot_holds` carries `hospital_id` FK `ON DELETE CASCADE`.
  `public_otps` and `waitlist_signups` are platform tables — document that exception.
- **New query?** Tenant-owned data goes through `scoped(db, Model, tenant_id)`; here the
  `tenant_id` comes from the verified, *listed* hospital, never the client's say-so.
- **New body ids?** Public booking fields added to `_body_foreign_keys()`.
- **New endpoint?** Departs from "depends on `get_tenant_id` + `require_permission`" by design:
  these are public. Each is rate-limited and uses allow-list schemas, and the departure must be
  documented in CLAUDE.md when built.
- **New frontend screen?** Data via `store/api.ts`; tenant resolution via `lib/tenant.ts`; no
  hardcoded hospital ids.
- **Lookup by id?** Missing, unlisted and other-tenant all return 404.
- **Every role checked?** Hospital admin gains a listing-settings screen; superadmin gains an
  approval screen; doctors gain a "show publicly" toggle; reception/nurse see public-source
  bookings; patients are unaffected. Each needs a new permission (e.g. `public_listing.manage`,
  `public_listing.approve`) — data, not role checks — added by migration. Approval should be
  superadmin-only, in line with `hospital.settings.manage`.

---

## 9. Open decisions

| # | Decision | Notes |
|---|----------|-------|
| 1 | Guest booking (A) vs platform identity (B) | Recommended: A |
| 2 | Opt-in by hospital only, or also superadmin approval? | Recommended: both |
| 3 | SMS/WhatsApp/OTP provider | Needs DLT registration for SMS in India; affects lead time |
| 4 | Captcha provider | e.g. Cloudflare Turnstile (already on Cloudflare for R2) |
| 5 | Search: city/pincode only, or coordinates in v1? | Recommended: city/pincode first |
| 6 | Where does booking complete — apex or subdomain? | Recommended: apex |
| 7 | Pay at hospital only, or online payment in v1? | Recommended: pay at hospital |
| 8 | Revenue model: free listing, subscription tier, or per-booking fee | Decide before Phase 2 |
| 9 | Launch geography (first city) | Needed for supply strategy |
| 10 | Legal review of listings and doctor-advertising rules | Needed before public launch |
| 11 | Canonical URL strategy (apex vs subdomain) | See §6 item 8 |

---

## 10. Scheduling note

The earlier launch target in project memory was **2026-08-26**, which has passed (today is
2026-10-08). The current production status and any new date are not recorded in the repo, so this
plan carries no dates. Phase 1 is sized at roughly 1–2 weeks of focused work and Phase 2 at a
further 2–3 weeks (dominated by OTP provider setup and abuse protection), but those are estimates
to be confirmed once the open decisions in §9 are made.

---

## 11. Suggested next step

Resolve open decisions 1–3 and 6, then produce a concrete Phase 1 implementation plan
(migration, router, schemas, tests, files to touch). No code should be written until then.

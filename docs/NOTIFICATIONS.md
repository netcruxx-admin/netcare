# NOTIFICATIONS.md — Push Notification Suite

Tracks every FCM push wired into the app: what triggers it, who receives it, what it says, and where it routes on click. Update this file in the same commit as any change to `app/notify.py`, a `notify.notify_*` call site, or `firebase-messaging-sw.js`'s routing.

## Architecture (already built, see commit `994c9a8` for the original scaffolding)

- **Transport**: `apps/api/app/notify.py` — `send(db, user_id, title, body, data)` sends via Firebase Admin to every `FcmToken` row for that user; never raises (a failed push must not roll back the action that triggered it); prunes a token on `messaging.UnregisteredError` / `fb_exceptions.InvalidArgumentError`.
  - **Messages are data-only on purpose** — `title`/`body` are folded into the `data` dict, and `messaging.Message` never sets a top-level `notification` field. If one is present, the browser auto-displays the push using Firebase's own internal handling for background delivery and never calls our `onBackgroundMessage` handler at all — meaning the notification actually shown carries none of our click-routing `data`, so `data.url` silently does nothing. **Do not add a `notification=` field back to `send()`** without re-verifying click-through on a real background push.
- **Targeting helpers** (all in `notify.py`, all tenant-scoped):
  - `notify_patient(db, tenant_id, patient_id, ...)` — resolves the `Patient.user_id` and sends.
  - `notify_doctor(db, tenant_id, doctor_id, ...)` — resolves the `Doctor.user_id` and sends.
  - `notify_role(db, tenant_id, role_code, ...)` — sends to every user holding that role at the hospital. For events with no single owning record (a stock threshold, a shared queue).
- **Registration**: `apps/web/hooks/useNotifications.ts`, mounted once in `apps/web/app/dashboard/layout.tsx` (persists across dashboard navigation — do **not** move this into `DashboardShell.tsx`, which remounts per screen and would unregister/re-register the token on every click). `getTokenResilient()` in that file self-heals `messaging/token-subscribe-failed` — the browser refusing to change the applicationServerKey on an existing push subscription (seen after a VAPID key was added/rotated post-subscription, or after repeated register/unregister cycles) — by unsubscribing the stale subscription and retrying once, rather than leaving the device silently unregistered.
- **Display**: both foreground (`onMessage` in the hook) and background (`onBackgroundMessage` in `apps/web/public/firebase-messaging-sw.js`) route through `registration.showNotification()` — required for Chrome on Android, works everywhere else too, and means one `notificationclick` handler (in the service worker) covers both cases. Both read `title`/`body` from `payload.data` (not `payload.notification` — see the data-only note above).
- **Service worker self-update**: `firebase-messaging-sw.js` calls `self.skipWaiting()` on install and `clients.claim()` on activate. Without these, a new SW version sits "waiting" until every tab on the origin is fully closed — a plain reload does not activate it — so a browser can keep running stale worker code (missing a field it expects, an outdated click handler) indefinitely across deploys, silently. If a notification is ever missing its title/body or clicks to the wrong place right after a deploy, check the SW version in DevTools → Application → Service Workers before assuming the backend payload is wrong.
- **Click routing**: every notify call includes `data.url` — the dashboard route to land on for *that specific recipient's role* (patient and doctor often land on different screens for the same event, so `url` is set per `notify_patient`/`notify_doctor` call, not per event). The service worker's `notificationclick` handler focuses an existing tab and navigates it there, or opens a new one. Falls back to `/dashboard` if `data.url` is absent.
- **Self-notification rule**: nobody is told about an action they themselves performed. Where the same permission lets either party act (e.g. `appointments.manage` with `own` scope lets a patient *or* a doctor reschedule their own appointment), the call site resolves `caller_patient_id(db, user)` / `caller_doctor_id(db, user)` and skips notifying whichever side matches the actor. Staff acting on someone else's behalf are neither party, so both sides still hear about it.

## Implemented

| Event | File : function | Recipient(s) | Title | Body | `data.url` | Notes |
|---|---|---|---|---|---|---|
| Appointment booked | `routers/appointments.py` : `create_appointment` | Patient, Doctor | "Appointment booked" / "New appointment" | Confirms doctor + date/time (patient) or names the patient + date/time (doctor) | `/dashboard/appointments` (both) | Skips the side that is the actor (self-booking patient, or doctor booking their own follow-up) |
| Appointment rescheduled | `routers/appointments.py` : `update_appointment` (date/time changed) | Patient, Doctor | "Appointment rescheduled" | New date/time | `/dashboard/appointments` (both) | Same self-notification skip |
| Appointment cancelled | `routers/appointments.py` : `update_appointment` (status → `cancelled`) | Patient, Doctor | "Appointment cancelled" | Old date/time | `/dashboard/appointments` (both) | Same self-notification skip. Only the status-update path (`PUT`) — the hard-delete endpoint (`DELETE`, platform-only) does not notify |
| Lab report ready | `routers/lab.py` : `update_test_order` (status → `completed`) | Patient, ordering Doctor | "Lab report ready" | Generic — result content isn't in the body, only that it's ready | `/dashboard/reports` (patient), `/dashboard/lab-orders` (doctor) | Fires once, on the transition into `completed` |
| Lab report reviewed | `routers/lab.py` : `review_test_order` | Patient only | "Lab report reviewed" | — | `/dashboard/reports` | Doctor is the actor here, not notified |
| New lab order placed | `routers/lab.py` : `create_test_order` | Every user with role `lab` at the hospital | "New lab order" | Names the patient | `/dashboard/lab-orders` | Uses `notify_role` — no single lab-tech owner for a fresh order |
| Medicine ready (dispensed) | `routers/medication_orders.py` : `dispense_order` | Patient | "Medicine ready" | Names the medicine | *(none — patient has no dedicated medication screen; falls back to `/dashboard`)* | |
| Medication administered | `routers/medication_orders.py` : `administer_order` | Prescribing Doctor | "Medication administered" | Names the medicine | `/dashboard/medication-orders` | Nurse is the actor, not notified (not a party either way) |
| Low stock | `routers/medication_orders.py` : `dispense_order` (stock crosses `reorder_level`) | Every user with role `pharmacist` at the hospital | "Low stock" | Names the medicine, current stock, reorder level | `/dashboard/inventory` | Fires once, only on the dispense that pushes stock from *above* the reorder level to *at-or-below* it — not on every subsequent dispense while it stays low |

## Deliberately not notified

Considered and rejected — recorded so this doesn't get re-litigated without reason:

- **Vitals recorded/edited** — no threshold/abnormal-value alerting exists, so there's nothing urgent to say.
- **Payment/invoice generated** — low-stakes, receipt-by-email is enough; a push here is noise.
- **New staff account created** — credentials should never travel over a push notification regardless of channel security.
- **Role/permission grant changed** — CLAUDE.md's live-effective-permissions design means a revoked grant already takes effect without re-login; a push confirming it is a nice-to-have, not a gap, and fan-out is to *everyone holding a role*, which can be broad. Revisit if support requests show this is confusing in practice.

## Known gaps — need infrastructure or feature work first, not just a `notify()` call

- **Licence expiring** (`hospitals.py`, `GET /hospitals/meta/expiring-licences`) — inherently time-based, not triggered by a user action. Needs a scheduler; **no cron/background-job runner exists anywhere in this codebase today** (confirmed: no APScheduler/Celery, the only async dispatch is `BackgroundTasks` for the password-reset email). Decision needed: in-process scheduler (e.g. APScheduler) vs. an external cron hitting a protected internal endpoint.
- **Video consult starting soon** (`video_slots.py`) — same problem, same fix needed. Booking a slot itself doesn't need its own notification (it's a secondary step right after the appointment-booked push already fires), but a pre-consult reminder is genuinely valuable and is purely time-based.
- **Doctor became unavailable / schedule conflict** (`schedule.py`, `create_schedule_block`) — creating a block does **not** check for or touch existing appointments anywhere in the current code; there is no time-range overlap logic in the codebase at all (`ScheduleBlock.start_time`/`end_time` and `Appointment.time` are free-text strings like `"10:00 AM"`, never compared against each other). Notifying affected patients requires building that conflict-detection first — a real feature, not a notification wire-up.

## Deployment

Push notifications need credentials wired into **both** deployments, plus HTTPS.

**Backend** (`_resolve_credential_source()` in `notify.py`, first match wins):
- `FIREBASE_SERVICE_ACCOUNT_JSON` — the whole service account file as one env var, raw JSON or base64. Use this on Railway / any host without a persistent, uploadable filesystem.
- `FIREBASE_SERVICE_ACCOUNT` — path to the file on disk (local dev only; gitignored).
- Neither set → `notify.send()` is a logged no-op; the API still boots.
- `CORS_ORIGINS` must list the production frontend origin(s) or every API call (including `POST /notifications/token`) fails — and the API refuses to boot in production if it's empty. `ROOT_DOMAIN=<apex>` makes the CORS regex auto-allow `https://<tenant>.<apex>`.

**Frontend**:
- All six `NEXT_PUBLIC_FIREBASE_*` vars (`API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `MESSAGING_SENDER_ID`, `APP_ID`, `VAPID_KEY`). `NEXT_PUBLIC_*` is inlined at **build time** — adding them needs a fresh build/redeploy, not a restart.
- `apps/web/public/firebase-messaging-sw.js` has the Firebase config **hardcoded** (service workers can't read env vars). It must match the project the backend's service account belongs to. Currently pinned to project `netcare-5dd8e`. After deploy, confirm `https://<host>/firebase-messaging-sw.js` loads.

**Both**: web push requires HTTPS. Each tenant subdomain is a separate origin, so the service worker and FCM token are per-subdomain — fine functionally (the token still maps to the user's id server-side), but the SW file must be reachable on every subdomain (it is — same Next app).

## Adding a new notification

1. Pick the right targeting helper: `notify_patient` / `notify_doctor` for a single owning record, `notify_role` for "everyone who does X at this hospital."
2. Fire it **after** `db.commit()` (and `db.refresh()` if the row's fields are used in the message) — never before, since `send()` must not be part of the transaction it's reporting on.
3. Check whether the same action can be taken by the person being notified (patient or doctor acting on their own record) — if so, resolve `caller_patient_id`/`caller_doctor_id` and skip that side.
4. Set `data.url` to the route *for that recipient's role specifically* — patient and doctor often land on different screens for the same event.
5. Add a row to the Implemented table above in the same commit.

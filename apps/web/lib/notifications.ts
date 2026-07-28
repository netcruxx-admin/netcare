// -----------------------------------------------------------------------------
// In-app notifications — derived live from the current data for the logged-in
// user (role-aware). No separate storage for the notifications themselves; only
// the "read" set is persisted so the unread badge is meaningful. When the
// backend arrives, this becomes a real notifications table + push/SMS/WhatsApp.
// -----------------------------------------------------------------------------

import { dbOperations } from './db';
import { NOTIF_READ_KEY } from './constants';
import type { AppNotification } from './types';

// Re-export the notification types (definitions live in ./types).
export type { AppNotification, NotificationTone } from './types';

interface SessionUser {
  id: string;
  name: string;
  role: 'patient' | 'doctor' | 'admin' | 'lab' | 'nurse';
}
const todayStr = () => new Date().toISOString().split('T')[0];

function readSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(NOTIF_READ_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function markRead(ids: string[]): void {
  if (typeof window === 'undefined') return;
  const set = readSet();
  ids.forEach((id) => set.add(id));
  localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...set]));
}

export function markAllRead(notifications: AppNotification[]): void {
  markRead(notifications.map((n) => n.id));
}

export function isRead(id: string): boolean {
  return readSet().has(id);
}

/** Builds the notification list for a user from current app data. */
export function getNotifications(user: SessionUser): AppNotification[] {
  const out: AppNotification[] = [];
  const today = todayStr();

  const doctorName = (doctorId: string) => {
    const doc = dbOperations.getDoctorById(doctorId);
    if (!doc) return 'your doctor';
    const u = dbOperations.getUserById(doc.userId);
    return u ? `Dr. ${u.name}` : 'your doctor';
  };
  const patientName = (patientId: string) => {
    const pat = dbOperations.getPatient(patientId);
    const u = pat ? dbOperations.getUserById(pat.userId) : undefined;
    return u?.name ?? 'a patient';
  };

  if (user.role === 'patient') {
    const patientId = dbOperations.getPatientByUserId(user.id)?.id;
    if (patientId) {
      for (const a of dbOperations.getAppointmentsByPatientId(patientId)) {
        if (a.status === 'scheduled' && a.date >= today) {
          out.push({
            id: `appt-${a.id}`,
            title: 'Upcoming appointment',
            description: `${a.date} at ${a.time} with ${doctorName(a.doctorId)}`,
            time: a.createdAt,
            href: `/dashboard/patient/appointments`,
            tone: 'info',
          });
        }
      }
      for (const p of dbOperations.getPaymentsByPatientId(patientId)) {
        if (p.status === 'pending') {
          out.push({
            id: `pay-${p.id}`,
            title: 'Payment pending',
            description: `₹${p.amount} due for your consultation`,
            time: p.createdAt,
            href: `/dashboard/patient/payments`,
            tone: 'warning',
          });
        }
      }
      for (const o of dbOperations.getTestOrdersByPatientId(patientId)) {
        if (o.status === 'completed' || o.status === 'reviewed') {
          out.push({
            id: `lab-${o.id}`,
            title: 'Lab report ready',
            description: o.items.map((i) => i.name).join(', '),
            time: o.updatedAt,
            href: `/dashboard/patient/reports`,
            tone: 'success',
          });
        }
      }
    }
  } else if (user.role === 'doctor') {
    const doctorId = dbOperations.getDoctorByUserId(user.id)?.id;
    if (doctorId) {
      const appts = dbOperations.getAppointmentsByDoctorId(doctorId);
      const todays = appts.filter((a) => a.date === today && a.status === 'scheduled');
      if (todays.length) {
        out.push({
          id: `doc-today-${today}`,
          title: `${todays.length} appointment${todays.length === 1 ? '' : 's'} today`,
          description: todays.map((a) => `${a.time} · ${patientName(a.patientId)}`).slice(0, 3).join('  |  '),
          time: new Date().toISOString(),
          href: `/dashboard/doctor/appointments`,
          tone: 'info',
        });
      }
      for (const o of dbOperations.getTestOrdersByDoctorId(doctorId)) {
        if (o.status === 'completed') {
          out.push({
            id: `doclab-${o.id}`,
            title: 'Lab results in',
            description: `${patientName(o.patientId)} · ${o.items.map((i) => i.name).join(', ')}`,
            time: o.updatedAt,
            href: `/dashboard/doctor/lab-orders`,
            tone: 'success',
          });
        }
      }
    }
  } else if (user.role === 'admin') {
    const pendingDocs = dbOperations.getAllDoctors().filter((d) => d.verificationStatus === 'pending');
    if (pendingDocs.length) {
      out.push({
        id: `admin-verify-${pendingDocs.length}`,
        title: 'Doctor verifications pending',
        description: `${pendingDocs.length} doctor${pendingDocs.length === 1 ? '' : 's'} awaiting approval`,
        time: new Date().toISOString(),
        href: `/dashboard/admin/doctors`,
        tone: 'warning',
      });
    }
    const todays = dbOperations.getAllAppointments().filter((a) => a.date === today);
    if (todays.length) {
      out.push({
        id: `admin-today-${today}`,
        title: `${todays.length} appointment${todays.length === 1 ? '' : 's'} today`,
        description: 'Across all departments',
        time: new Date().toISOString(),
        href: `/dashboard/admin/appointments`,
        tone: 'info',
      });
    }
  } else if (user.role === 'lab') {
    const pending = dbOperations.getAllTestOrders().filter(
      (o) => o.status === 'ordered' || o.status === 'sample_collected' || o.status === 'in_progress',
    );
    if (pending.length) {
      out.push({
        id: `lab-queue-${pending.length}`,
        title: `${pending.length} test order${pending.length === 1 ? '' : 's'} in queue`,
        description: 'Awaiting processing or results',
        time: new Date().toISOString(),
        href: `/dashboard/lab/orders`,
        tone: 'info',
      });
    }
  } else if (user.role === 'nurse') {
    const todays = dbOperations.getAllAppointments().filter((a) => a.date === today && a.status === 'scheduled');
    if (todays.length) {
      out.push({
        id: `nurse-today-${today}`,
        title: `${todays.length} patient${todays.length === 1 ? '' : 's'} for vitals today`,
        description: 'Record vitals before consultation',
        time: new Date().toISOString(),
        href: `/dashboard/nurse/vitals`,
        tone: 'info',
      });
    }
  }

  // Newest first.
  return out.sort((a, b) => b.time.localeCompare(a.time));
}

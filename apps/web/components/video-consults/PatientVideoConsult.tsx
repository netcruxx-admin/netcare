'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video, Clock, CheckCircle2, Stethoscope, X, CalendarX } from 'lucide-react';
import type { VideoSlot } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import {
  useBookVideoSlotMutation,
  useCreateAppointmentMutation,
  useGetPatientByUserQuery,
  useListDepartmentsQuery,
  useListDoctorsQuery,
  useListVideoSlotsQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';

interface DoctorOption {
  id: string;
  name: string;
  specialization: string;
  fee: number;
}

export function PatientVideoConsult({ session }: RoleViewProps) {
  const router = useRouter();
  const [selectedDoctor, setSelectedDoctor] = useState<string>('');
  const [confirm, setConfirm] = useState<VideoSlot | null>(null);
  const [bookedApptId, setBookedApptId] = useState('');
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(false);

  const { data: patient } = useGetPatientByUserQuery(session.user.id);
  const patientId = patient?.id ?? '';

  const { data: allDoctors = [] } = useListDoctorsQuery();
  const { data: departments = [] } = useListDepartmentsQuery();
  const doctors = allDoctors
    .filter((d) => d.verificationStatus !== 'rejected')
    .map((d) => ({
      id: d.id,
      name: d.user?.name ?? 'Doctor',
      specialization: d.specialization,
      fee: d.consultationFee,
    }));

  const { data: openSlots = [] } = useListVideoSlotsQuery(
    { doctorId: selectedDoctor, status: 'open' },
    { skip: !selectedDoctor },
  );

  // Strip past slots so patients cannot book into the past.
  // Convert both times to minutes since midnight for a robust numeric comparison
  // rather than relying on string ordering, which breaks for non-zero-padded hours.
  const slots = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const toMinutes = (t: string) => {
      const match = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!match) return 0;
      let h = Number(match[1]);
      const m = Number(match[2]);
      if (/pm/i.test(match[3]) && h !== 12) h += 12;
      if (/am/i.test(match[3]) && h === 12) h = 0;
      return h * 60 + m;
    };
    return openSlots.filter((s) => {
      if (s.date > todayStr) return true;
      if (s.date === todayStr) return toMinutes(s.time) > nowMinutes;
      return false;
    });
  }, [openSlots]);

  const [createAppointment] = useCreateAppointmentMutation();
  const [bookVideoSlot] = useBookVideoSlotMutation();

  const loadSlots = (docId: string) => setSelectedDoctor(docId);

  const doctorById = useMemo(() => new Map(doctors.map((d) => [d.id, d])), [doctors]);

  const deptForDoctor = (spec: string) =>
    departments.find((d) => d.name === spec || spec.includes(d.name.split(' ')[0]))?.id ??
    departments[0]?.id;

  const book = async (slot: VideoSlot) => {
    setError('');
    const doc = doctorById.get(slot.doctorId);
    if (!doc) {
      setError('This doctor is no longer available. Please pick another.');
      return;
    }
    if (!patientId) {
      setError('Your patient profile is not set up yet. Complete your profile first.');
      return;
    }

    setBooking(true);
    try {
      const appointment = await createAppointment({
        patientId,
        doctorId: slot.doctorId,
        departmentId: deptForDoctor(doc.specialization),
        date: slot.date,
        time: slot.time,
        status: 'scheduled',
        mode: 'video',
        reason: 'Video consultation',
        notes: '',
      }).unwrap();

      // Booking the slot also raises the pending invoice, server-side.
      await bookVideoSlot({ id: slot.id, body: { appointmentId: appointment.id } }).unwrap();

      setConfirm(null);
      setBookedApptId(appointment.id);
    } catch (err) {
      setError(apiError(err, 'Could not book that slot'));
    } finally {
      setBooking(false);
    }
  };

  // Success screen.
  if (bookedApptId) {
    return (
      <DashboardShell role={session.user.role} userName={session.user.name} title="Video Consultation Booked">
        <div className="max-w-md mx-auto text-center py-14">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Your video consult is booked</h2>
          <p className="text-sm text-slate-500 mt-2">
            You&apos;ll find it in your appointments. Join the video room from there at your scheduled time.
          </p>
          <div className="flex gap-2 justify-center mt-6">
            <button
              onClick={() => router.push(`/dashboard/consult/${bookedApptId}`)}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-brand-teal text-white text-sm font-semibold px-4 py-2"
            >
              <Video className="w-4 h-4" /> Join now
            </button>
            <button
              onClick={() => router.push('/dashboard/appointments')}
              className="rounded-lg border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50"
            >
              My appointments
            </button>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Book a Video Consultation"
      subtitle="Pick a doctor and an available time — consult from home"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Doctor list */}
        <div className="lg:col-span-1 space-y-2">
          <p className="text-xs font-medium text-slate-500 mb-1">Choose a doctor</p>
          {doctors.map((d) => {
            const active = d.id === selectedDoctor;
            return (
              <button
                key={d.id}
                onClick={() => loadSlots(d.id)}
                className={`w-full text-left rounded-xl border p-3 transition ${
                  active ? 'border-cyan-500 ring-2 ring-cyan-500/20 bg-cyan-50/40' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="font-semibold text-slate-900 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-cyan-600" /> Dr. {d.name}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{d.specialization}</p>
                <p className="text-xs text-slate-600 mt-1">₹{d.fee} consultation</p>
              </button>
            );
          })}
        </div>

        {/* Slots */}
        <div className="lg:col-span-2">
          {!selectedDoctor ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
              <Video className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm">Select a doctor to see their available video-consult times.</p>
            </div>
          ) : slots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
              <CalendarX className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm">No open video slots for this doctor right now. Try another doctor.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(
                slots.reduce<Record<string, VideoSlot[]>>((acc, s) => {
                  (acc[s.date] ??= []).push(s);
                  return acc;
                }, {}),
              ).map(([date, daySlots]) => (
                <div key={date} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-medium text-slate-700 mb-3">
                    {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {daySlots
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { setError(''); setConfirm(s); }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-300 text-slate-700 hover:border-cyan-500 hover:bg-cyan-50 transition"
                        >
                          <Clock className="w-3.5 h-3.5 text-slate-400" /> {s.time}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setConfirm(null); setError(''); }} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <button onClick={() => { setConfirm(null); setError(''); }} className="absolute right-4 top-4 text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-full bg-cyan-100 flex items-center justify-center mb-3">
              <Video className="w-6 h-6 text-cyan-600" />
            </div>
            <h3 className="font-semibold text-slate-900">Confirm video consultation</h3>
            <div className="mt-4 space-y-2 text-sm">
              <Row label="Doctor" value={`Dr. ${doctorById.get(confirm.doctorId)?.name ?? ''}`} />
              <Row label="Date" value={new Date(confirm.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} />
              <Row label="Time" value={confirm.time} />
              <Row label="Fee" value={`₹${doctorById.get(confirm.doctorId)?.fee ?? 0}`} />
            </div>
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            <button
              onClick={() => book(confirm)}
              disabled={booking}
              className="mt-5 w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-brand-teal text-white font-semibold text-sm disabled:opacity-50"
            >
              {booking ? 'Booking…' : 'Confirm booking'}
            </button>
            <p className="text-xs text-slate-400 text-center mt-2">Payment is collected as pending; pay from Payments.</p>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

'use client';

import { Calendar, Clock, MessageCircle, User } from 'lucide-react';
import type { Appointment, Doctor, Patient } from '@/lib/db';

interface AppointmentInfoProps {
  appointment: Appointment;
  doctor: Doctor | null;
  patient: Patient | null;
  doctorName: string;
  patientName: string;
}

const card = 'bg-white rounded-lg p-6 shadow-sm border border-slate-100';

// The two-column read-only overview: date/time, doctor, reason, patient, notes.
export function AppointmentInfo({ appointment, doctor, patient, doctorName, patientName }: AppointmentInfoProps) {
  return (
    <div className="grid md:grid-cols-2 gap-8 mb-8">
      {/* Left Column */}
      <div className="space-y-6">
        <div className={card}>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Date & Time</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-cyan-600" />
              <div>
                <p className="text-sm text-slate-600">Date</p>
                <p className="font-semibold text-slate-900">
                  {new Date(appointment.date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-teal-600" />
              <div>
                <p className="text-sm text-slate-600">Time</p>
                <p className="font-semibold text-slate-900">{appointment.time}</p>
              </div>
            </div>
          </div>
        </div>

        {doctor && (
          <div className={card}>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Doctor</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-cyan-600 mt-1" />
                <div>
                  <p className="text-sm text-slate-600">Name</p>
                  <p className="font-semibold text-slate-900">{doctorName}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-600">Specialization</p>
                <p className="font-semibold text-slate-900">{doctor.specialization}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Qualification</p>
                <p className="font-semibold text-slate-900 text-sm">{doctor.qualification}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Experience</p>
                <p className="font-semibold text-slate-900">{doctor.experienceYears} years</p>
              </div>
            </div>
          </div>
        )}

        <div className={card}>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Reason for Appointment</h2>
          <p className="text-slate-700">{appointment.reason}</p>
        </div>
      </div>

      {/* Right Column */}
      <div className="space-y-6">
        {patient && (
          <div className={card}>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Patient Information</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-slate-600">Name</p>
                <p className="font-semibold text-slate-900">{patientName}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Phone</p>
                <p className="font-semibold text-slate-900">{patient.phone || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Blood Group</p>
                <p className="font-semibold text-slate-900">{patient.bloodGroup}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Allergies</p>
                <p className="font-semibold text-slate-900">{patient.allergies}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Insurance</p>
                <p className="font-semibold text-slate-900">
                  {patient.insuranceProvider} - {patient.insuranceNumber}
                </p>
              </div>
            </div>
          </div>
        )}

        {appointment.notes && (
          <div className={card}>
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Doctor&apos;s Notes
            </h2>
            <p className="text-slate-700">{appointment.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

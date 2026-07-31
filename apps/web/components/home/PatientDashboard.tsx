'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Plus, User, Clock, FileText } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { useGetPatientAppointmentsQuery } from '@/store/api';

export function PatientDashboard({ session }: RoleViewProps) {
  const router = useRouter();


  const patientId = session?.patient?.id ?? '';
  const { data: appointments = [] } = useGetPatientAppointmentsQuery(patientId, { skip: !patientId });

  const upcomingAppointments = appointments.filter((a) => a.status === 'scheduled');

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Patient Dashboard"
      subtitle="Manage your health appointments and records"
    >
      <div className="space-y-8">
        {/* Welcome Section */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg p-6 space-y-2">
            <h2 className="text-2xl font-bold">Welcome, {session.user.name.split(' ')[0]}</h2>
            <p className="text-cyan-100">Manage your health appointments and records</p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow space-y-4">
            <div className="flex items-center gap-4">
              <Calendar className="w-8 h-8 text-cyan-600" />
              <div>
                <p className="text-slate-600 text-sm">Upcoming Appointments</p>
                <p className="text-2xl font-bold">{upcomingAppointments.length}</p>
              </div>
            </div>
          </div>
          <Link
            href="/dashboard/book"
            className="bg-green-600 hover:bg-green-700 text-white rounded-lg p-6 transition flex flex-col items-center justify-center space-y-2"
          >
            <Plus className="w-8 h-8" />
            <span className="font-semibold">Book New Appointment</span>
          </Link>
        </div>

        {/* Upcoming Appointments */}
        <div className="bg-white rounded-lg shadow">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Upcoming Appointments</h3>
            <Link href="/dashboard/appointments" className="text-sm text-cyan-600 hover:text-cyan-700 font-semibold">
              View history →
            </Link>
          </div>
          <div className="p-6 space-y-4">
            {upcomingAppointments.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 mb-6">No upcoming appointments</p>
                <Link
                  href="/dashboard/book"
                  className="inline-block px-6 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg hover:shadow-lg transition"
                >
                  Book an Appointment
                </Link>
              </div>
            ) : (
              upcomingAppointments.map((apt) => (
                <div key={apt.id} className="border border-slate-200 rounded-lg p-4 hover:shadow-lg transition">
                  <div className="grid md:grid-cols-4 gap-4 items-start">
                    <div>
                      <p className="text-slate-600 text-sm">Date &amp; Time</p>
                      <p className="font-semibold">{apt.date} at {apt.time}</p>
                    </div>
                    <div>
                      <p className="text-slate-600 text-sm">Doctor</p>
                      <p className="font-semibold">Dr. {apt.doctorId}</p>
                    </div>
                    <div>
                      <p className="text-slate-600 text-sm">Department</p>
                      <p className="font-semibold">{apt.departmentId}</p>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Link
                        href={`/appointment/${apt.id}`}
                        className="px-4 py-2 bg-cyan-100 text-cyan-600 rounded-lg hover:bg-cyan-200 transition"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid md:grid-cols-3 gap-6">
          <Link href="/dashboard/records" className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition flex items-center gap-4">
            <FileText className="w-10 h-10 text-cyan-600" />
            <div>
              <h3 className="font-semibold text-slate-900">Medical Records</h3>
              <p className="text-slate-600 text-sm">Prescriptions &amp; vitals</p>
            </div>
          </Link>
          <Link href="/dashboard/profile" className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition flex items-center gap-4">
            <User className="w-10 h-10 text-teal-600" />
            <div>
              <h3 className="font-semibold text-slate-900">Update Profile</h3>
              <p className="text-slate-600 text-sm">Manage your information</p>
            </div>
          </Link>
          <Link href="/dashboard/appointments" className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition flex items-center gap-4">
            <Clock className="w-10 h-10 text-cyan-600" />
            <div>
              <h3 className="font-semibold text-slate-900">Appointment History</h3>
              <p className="text-slate-600 text-sm">Past visits &amp; notes</p>
            </div>
          </Link>
        </div>
      </div>
    </DashboardShell>
  );
}

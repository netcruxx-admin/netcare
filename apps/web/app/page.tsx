'use client';

import Link from 'next/link';
import { Heart, Calendar, Shield, Users } from 'lucide-react';
import { useActiveHospital } from '@/hooks/useActiveHospital';

export default function LandingPage() {
  const hospital = useActiveHospital();
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="bg-white shadow-lg border-b-2 border-cyan-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-lg flex items-center justify-center">
              <Heart className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent">{hospital.name}</h1>
          </div>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="px-6 py-2 text-cyan-600 font-semibold hover:bg-cyan-50 rounded-lg transition border border-cyan-200"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white font-semibold rounded-lg hover:shadow-lg transition"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex-1 bg-gradient-to-br from-cyan-50 via-white to-teal-50 pt-20 pb-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-5xl md:text-6xl font-bold text-slate-900 leading-tight">
                Your Health,
                <span className="block bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent">Our Priority</span>
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                Book appointments with healthcare professionals, manage your medical records, and stay on top of your health—all in one place.
              </p>
              <div className="flex gap-4 pt-4">
                <Link
                  href="/register"
                  className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-teal-600 text-white font-semibold rounded-lg hover:shadow-lg transition"
                >
                  Start Booking
                </Link>
                <Link
                  href="/login"
                  className="px-8 py-3 border-2 border-cyan-300 text-cyan-700 font-semibold rounded-lg hover:bg-cyan-50 transition"
                >
                  Sign In
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition border border-cyan-100">
                <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center mb-4">
                  <Calendar className="w-6 h-6 text-cyan-600" />
                </div>
                <h3 className="font-semibold text-slate-900">Easy Booking</h3>
                <p className="text-sm text-slate-600">Schedule appointments in minutes</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition border border-teal-100">
                <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-teal-600" />
                </div>
                <h3 className="font-semibold text-slate-900">Secure</h3>
                <p className="text-sm text-slate-600">Your data is protected always</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition border border-cyan-100">
                <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-cyan-600" />
                </div>
                <h3 className="font-semibold text-slate-900">Expert Doctors</h3>
                <p className="text-sm text-slate-600">Access qualified professionals</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition border border-teal-100">
                <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                  <Heart className="w-6 h-6 text-teal-600" />
                </div>
                <h3 className="font-semibold text-slate-900">Health Records</h3>
                <p className="text-sm text-slate-600">Keep all your data in one place</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">
              Why Choose {hospital.name}?
            </h2>
            <div className="h-1 w-16 bg-gradient-to-r from-cyan-500 to-teal-600 mx-auto rounded-full"></div>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'Smart Appointment System',
                description: 'View real-time availability, choose your preferred time slot, and get instant confirmation.',
                icon: '📅',
                color: 'cyan',
              },
              {
                title: 'Medical Records Management',
                description: 'Access your prescriptions, lab reports, and medical history anytime, anywhere.',
                icon: '📋',
                color: 'teal',
              },
              {
                title: 'Secure Payments',
                description: 'Multiple payment options with secure encryption for peace of mind.',
                icon: '💳',
                color: 'cyan',
              },
              {
                title: 'For Doctors',
                description: 'Manage your schedule, view patient history, and provide better care efficiently.',
                icon: '👨‍⚕️',
                color: 'teal',
              },
              {
                title: 'Admin Control',
                description: 'Full oversight of departments, doctors, and system settings.',
                icon: '⚙️',
                color: 'cyan',
              },
              {
                title: '24/7 Access',
                description: 'Book appointments and manage your health information anytime.',
                icon: '🕐',
                color: 'teal',
              },
            ].map((feature, idx) => (
              <div key={idx} className={`bg-white p-8 rounded-xl shadow-md hover:shadow-xl transition border-l-4 ${feature.color === 'cyan' ? 'border-cyan-500' : 'border-teal-500'}`}>
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="font-semibold text-lg text-slate-900 mb-3">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-cyan-600 to-teal-600">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Take Control of Your Health?
          </h2>
          <p className="text-xl text-cyan-100 mb-8">
            Join thousands of patients managing their appointments with {hospital.name}
          </p>
          <Link
            href="/register"
            className="inline-block px-10 py-4 bg-white text-teal-600 font-bold rounded-lg hover:shadow-2xl transition text-lg"
          >
            Create Your Account Today
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-teal-500 rounded-lg flex items-center justify-center">
                  <Heart className="w-6 h-6 text-white" />
                </div>
                <span className="font-bold text-white text-lg">{hospital.name}</span>
              </div>
              <p className="text-sm">Your trusted healthcare companion</p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">For Patients</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Book Appointment</a></li>
                <li><a href="#" className="hover:text-white">Medical Records</a></li>
                <li><a href="#" className="hover:text-white">Prescriptions</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">For Doctors</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Schedule Management</a></li>
                <li><a href="#" className="hover:text-white">Patient Records</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">About Us</a></li>
                <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>&copy; {new Date().getFullYear()} {hospital.name}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

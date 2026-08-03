'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle, ChevronRight } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { homePathForSession } from '@/lib/roles';
import { ConsentSettings } from './ConsentSettings';

/** The patient's own profile: a four-step wizard, unrelated to the staff form. */
export function PatientProfile({ session }: RoleViewProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [personalInfo, setPersonalInfo] = useState({
    dateOfBirth: '',
    gender: '',
  });

  const [contactInfo, setContactInfo] = useState({
    phone: '',
    emergencyContact: '',
    emergencyPhone: '',
  });

  const [medicalInfo, setMedicalInfo] = useState({
    bloodGroup: '',
    allergies: '',
    chronicDiseases: '',
  });

  const [insuranceInfo, setInsuranceInfo] = useState({
    provider: '',
    number: '',
  });

  // Prefill the phone we already know about; access is handled by the route.
  useEffect(() => {
    const existingPhone = session.patient?.phone || session.user.phone || '';
    if (existingPhone) {
      setContactInfo((prev) => ({ ...prev, phone: existingPhone }));
    }
  }, [session]);

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // In a real app, save this data to backend
      // For now, just show success and redirect
      setSuccess(true);
      setTimeout(() => {
        router.push(homePathForSession(session));
      }, 2000);
    } catch (err) {
      setError('Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { number: 1, title: 'Personal Info' },
    { number: 2, title: 'Contact Details' },
    { number: 3, title: 'Medical Info' },
    { number: 4, title: 'Insurance' },
  ];

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Profile"
      subtitle="Complete and manage your information"
    >
      <div className="max-w-2xl mx-auto">
        <div className="w-full bg-white rounded-lg shadow-xl p-8 space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900">Complete Your Profile</h2>
            <p className="text-slate-600 mt-2">Fill in your information to get started</p>
          </div>

          {/* Progress Steps */}
          <div className="flex justify-between items-center">
            {steps.map((step, idx) => (
              <div key={step.number} className="flex items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                    step.number <= currentStep
                      ? 'bg-gradient-to-r from-cyan-500 to-brand-teal text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {step.number}
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      step.number < currentStep ? 'bg-gradient-to-r from-cyan-500 to-brand-teal' : 'bg-slate-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-green-700">Profile completed! Redirecting to dashboard...</p>
            </div>
          )}

          <form onSubmit={handleComplete} className="space-y-6">
            {/* Step 1: Personal Info */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">Personal Information</h3>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date of Birth</label>
                  <input
                    type="date"
                    value={personalInfo.dateOfBirth}
                    onChange={(e) =>
                      setPersonalInfo((prev) => ({ ...prev, dateOfBirth: e.target.value }))
                    }
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Gender</label>
                  <select
                    value={personalInfo.gender}
                    onChange={(e) =>
                      setPersonalInfo((prev) => ({ ...prev, gender: e.target.value }))
                    }
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            )}

            {/* Step 2: Contact Details */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">Contact Details</h3>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={contactInfo.phone}
                    onChange={(e) =>
                      setContactInfo((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    placeholder="+1-234-567-8900"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Emergency Contact Name
                  </label>
                  <input
                    type="text"
                    value={contactInfo.emergencyContact}
                    onChange={(e) =>
                      setContactInfo((prev) => ({ ...prev, emergencyContact: e.target.value }))
                    }
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Emergency Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={contactInfo.emergencyPhone}
                    onChange={(e) =>
                      setContactInfo((prev) => ({ ...prev, emergencyPhone: e.target.value }))
                    }
                    placeholder="+1-234-567-8900"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>
            )}

            {/* Step 3: Medical Info */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">Medical Information</h3>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Blood Group</label>
                  <select
                    value={medicalInfo.bloodGroup}
                    onChange={(e) =>
                      setMedicalInfo((prev) => ({ ...prev, bloodGroup: e.target.value }))
                    }
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select Blood Group</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Allergies</label>
                  <input
                    type="text"
                    value={medicalInfo.allergies}
                    onChange={(e) =>
                      setMedicalInfo((prev) => ({ ...prev, allergies: e.target.value }))
                    }
                    placeholder="e.g., Penicillin, Pollen"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Chronic Diseases</label>
                  <input
                    type="text"
                    value={medicalInfo.chronicDiseases}
                    onChange={(e) =>
                      setMedicalInfo((prev) => ({ ...prev, chronicDiseases: e.target.value }))
                    }
                    placeholder="e.g., Diabetes, Hypertension"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}

            {/* Step 4: Insurance */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">Insurance Information</h3>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Insurance Provider</label>
                  <input
                    type="text"
                    value={insuranceInfo.provider}
                    onChange={(e) =>
                      setInsuranceInfo((prev) => ({ ...prev, provider: e.target.value }))
                    }
                    placeholder="e.g., HealthCare Plus"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Insurance Number</label>
                  <input
                    type="text"
                    value={insuranceInfo.number}
                    onChange={(e) =>
                      setInsuranceInfo((prev) => ({ ...prev, number: e.target.value }))
                    }
                    placeholder="e.g., HC123456"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
                  <p className="text-sm text-cyan-800">
                    Insurance information is optional but helps with billing and coverage verification.
                  </p>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-4 pt-6">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={handlePrevious}
                  className="flex-1 px-6 py-2 border-2 border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition"
                >
                  Previous
                </button>
              )}
              {currentStep < 4 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 px-6 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white font-semibold rounded-lg hover:shadow-lg transition flex items-center justify-center gap-2"
                >
                  Next <ChevronRight className="w-5 h-5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : 'Complete Profile'}
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Below the wizard rather than inside it: consent is not a step you
            complete once, it is a setting you come back to. Putting it behind
            "Next" would make withdrawal harder than granting was. */}
        <ConsentSettings />
      </div>
    </DashboardShell>
  );
}

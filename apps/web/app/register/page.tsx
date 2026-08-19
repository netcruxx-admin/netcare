'use client';

import Link from 'next/link';
import { FormikProvider } from 'formik';
import { AlertCircle, CheckCircle } from 'lucide-react';
import Image from 'next/image';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import { useRegistration } from './useRegistration';
import { HospitalStep } from './steps/HospitalStep';
import { RoleStep } from './steps/RoleStep';
import { AccountStep } from './steps/AccountStep';
import { ConsentStep } from './steps/ConsentStep';
import { DetailsStep } from './steps/DetailsStep';

export default function RegisterPage() {
  const hospital = useActiveHospital();
  const {
    step,
    userType,
    selectedHospital,
    isRootDomain,
    serverError,
    success,
    formik,
    wizardSteps,
    currentIndex,
    isMinor,
    handleHospitalSelect,
    handleRoleSelect,
    backToRole,
    backToHospital,
    goToStep,
  } = useRegistration();

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-teal-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-md border-b-2 border-cyan-100">
        <div className="max-w-6xl mx-auto px-6 py-2 flex items-center gap-3">
          <Link href="/" className="hover:opacity-80 transition">
            <Image src="/logo/logo-full.png" alt={hospital.name} width={80} height={80} className="w-20 h-20 object-contain" />
          </Link>
        </div>
      </div>

      {/* Registration Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div
          className={`w-full ${step === 'details' || step === 'consent' ? 'max-w-2xl' : 'max-w-md'} bg-white rounded-lg shadow-xl p-8 space-y-8`}
        >
          <FormikProvider value={formik}>
            {step === 'hospital' ? (
              <HospitalStep onSelect={handleHospitalSelect} />
            ) : step === 'role' ? (
              <>
                {isRootDomain && selectedHospital && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-cyan-50 border border-cyan-200 rounded-lg text-sm">
                    <span className="text-cyan-700 font-medium truncate">{selectedHospital.name}</span>
                    <button onClick={backToHospital} className="ml-auto text-xs text-cyan-500 hover:text-cyan-700 whitespace-nowrap">Change</button>
                  </div>
                )}
                <RoleStep onSelect={handleRoleSelect} />
              </>
            ) : (
              <>
                {isRootDomain && selectedHospital && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-cyan-50 border border-cyan-200 rounded-lg text-sm">
                    <span className="text-cyan-700 font-medium truncate">{selectedHospital.name}</span>
                    <button onClick={backToHospital} className="ml-auto text-xs text-cyan-500 hover:text-cyan-700 whitespace-nowrap">Change</button>
                  </div>
                )}
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-slate-900">Welcome!</h2>
                  <p className="text-slate-600 mt-2">Register as a {userType}</p>
                </div>

                {/* Progress indicator */}
                <div className="flex items-center justify-center gap-2">
                  {wizardSteps.map((label, i) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold transition ${
                            i <= currentIndex ? 'bg-gradient-to-br from-cyan-500 to-brand-teal text-white' : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {i < currentIndex ? <CheckCircle className="w-4 h-4" /> : i + 1}
                        </div>
                        <span className={`text-sm font-medium ${i <= currentIndex ? 'text-slate-900' : 'text-slate-400'}`}>
                          {label}
                        </span>
                      </div>
                      {i < wizardSteps.length - 1 && <div className="w-8 h-0.5 bg-slate-200" />}
                    </div>
                  ))}
                </div>

                {success && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="text-green-700">Account created successfully! Redirecting...</p>
                  </div>
                )}

                {serverError && step !== 'consent' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-red-700">{serverError}</p>
                  </div>
                )}

                {step === 'account' && (
                  <AccountStep
                    formik={formik}
                    needsDetails
                    hasVerify={false}
                    onBack={backToRole}
                  />
                )}
                {step === 'details' && (
                  <DetailsStep formik={formik} onBack={() => goToStep('account')} />
                )}
                {step === 'consent' && (
                  <ConsentStep
                    formik={formik}
                    isMinor={isMinor}
                    onBack={() => goToStep('details')}
                    inlineError={serverError}
                  />
                )}

                <div className="text-center">
                  <p className="text-slate-600 text-sm">
                    Already have an account?{' '}
                    <Link href="/login" className="text-cyan-600 font-semibold hover:text-cyan-700">
                      Sign in
                    </Link>
                  </p>
                </div>
              </>
            )}
          </FormikProvider>
        </div>
      </div>
    </div>
  );
}

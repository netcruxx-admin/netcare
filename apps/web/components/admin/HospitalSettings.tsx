'use client';

import { useRef, useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import {
  Building2, MapPin, Phone, UserCog, BedDouble, Clock, Image as ImageIcon,
  ShieldCheck, FileText, CreditCard, Lock, Upload, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { DashboardShell } from '@/components/DashboardShell';
import { FormField } from '@/components/form/FormField';
import { FormattedDate } from '@/components/ui/FormattedDate';
import { apiError } from '@/lib/apiError';
import { hasPermission } from '@/lib/auth';
import type { RoleViewProps } from '@/components/RoleView';
import {
  useGetMyHospitalSettingsQuery,
  useUpdateMyHospitalSettingsMutation,
  useUploadMyHospitalLogoMutation,
  useRemoveMyHospitalLogoMutation,
  type HospitalSelfUpdateBody,
} from '@/store/api';

const schema = Yup.object({
  name: Yup.string().trim().required('Hospital name is required'),
  pincode: Yup.string()
    .trim()
    .matches(/^[1-9][0-9]{5}$/, { message: 'PIN code must be 6 digits and cannot start with 0', excludeEmptyString: true }),
  email: Yup.string().trim().email('Invalid email'),
  appointmentSlotMinutes: Yup.number().min(5, 'At least 5 minutes').max(240, 'At most 240 minutes'),
  bedCount: Yup.number().min(0, 'Cannot be negative'),
  icuBeds: Yup.number().min(0, 'Cannot be negative'),
  nicuBeds: Yup.number().min(0, 'Cannot be negative'),
  emergencyBeds: Yup.number().min(0, 'Cannot be negative'),
  operationTheatres: Yup.number().min(0, 'Cannot be negative'),
  ambulanceCount: Yup.number().min(0, 'Cannot be negative'),
});

const FACILITIES: { key: keyof HospitalSelfUpdateBody; label: string }[] = [
  { key: 'hasPharmacy', label: 'Pharmacy' },
  { key: 'hasLab', label: 'Laboratory' },
  { key: 'hasRadiology', label: 'Radiology' },
  { key: 'hasBloodBank', label: 'Blood bank' },
  { key: 'hasEmergency', label: 'Emergency' },
  { key: 'hasAmbulance', label: 'Ambulance' },
];

function Section({
  icon: Icon, title, blurb, children,
}: {
  icon: typeof Building2; title: string; blurb?: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="p-2 bg-cyan-50 rounded-lg shrink-0">
          <Icon className="w-5 h-5 text-cyan-600" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-800">{title}</h2>
          {blurb && <p className="text-sm text-slate-500">{blurb}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** A fact the hospital cannot change here, shown anyway.
 *
 *  Being unable to edit the GSTIN is not a reason to be unable to read it —
 *  noticing it is wrong is the first step to asking for it to be fixed. */
function ReadOnly({ label, value }: { label: string; value?: string | number | null }) {
  const blank = value === null || value === undefined || value === '';
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-1 text-sm break-words ${blank ? 'text-slate-400' : 'text-slate-900'}`}>
        {blank ? '—' : value}
      </dd>
    </div>
  );
}

export function HospitalSettings({ session }: RoleViewProps) {
  const { data, isLoading } = useGetMyHospitalSettingsQuery();
  const [save, { isLoading: isSaving }] = useUpdateMyHospitalSettingsMutation();
  const [uploadLogo, { isLoading: isUploading }] = useUploadMyHospitalLogoMutation();
  const [removeLogo] = useRemoveMyHospitalLogoMutation();
  const logoInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const canEdit = hasPermission(session, 'hospital.profile.manage');

  const hospital = data?.hospital;
  const profile = data?.profile;

  const initialValues = {
    name: hospital?.name ?? '',
    tagline: hospital?.tagline ?? '',
    addressLine1: profile?.addressLine1 ?? '',
    addressLine2: profile?.addressLine2 ?? '',
    city: profile?.city ?? '',
    district: profile?.district ?? '',
    state: profile?.state ?? '',
    pincode: profile?.pincode ?? '',
    country: profile?.country ?? 'India',
    phonePrimary: profile?.phonePrimary ?? '',
    phoneSecondary: profile?.phoneSecondary ?? '',
    phoneEmergency: profile?.phoneEmergency ?? '',
    email: profile?.email ?? '',
    website: profile?.website ?? '',
    ownerName: profile?.ownerName ?? '',
    ownerPhone: profile?.ownerPhone ?? '',
    ownerEmail: profile?.ownerEmail ?? '',
    medicalDirectorName: profile?.medicalDirectorName ?? '',
    medicalDirectorRegNo: profile?.medicalDirectorRegNo ?? '',
    medicalDirectorCouncil: profile?.medicalDirectorCouncil ?? '',
    medicalDirectorQualification: profile?.medicalDirectorQualification ?? '',
    bedCount: profile?.bedCount ?? 0,
    icuBeds: profile?.icuBeds ?? 0,
    nicuBeds: profile?.nicuBeds ?? 0,
    emergencyBeds: profile?.emergencyBeds ?? 0,
    operationTheatres: profile?.operationTheatres ?? 0,
    ambulanceCount: profile?.ambulanceCount ?? 0,
    hasPharmacy: profile?.hasPharmacy ?? false,
    hasLab: profile?.hasLab ?? false,
    hasRadiology: profile?.hasRadiology ?? false,
    hasBloodBank: profile?.hasBloodBank ?? false,
    hasEmergency: profile?.hasEmergency ?? false,
    hasAmbulance: profile?.hasAmbulance ?? false,
    timezone: profile?.timezone ?? 'Asia/Kolkata',
    appointmentSlotMinutes: profile?.appointmentSlotMinutes ?? 15,
    lunchBreakStart: profile?.lunchBreakStart ?? '12:00',
    lunchBreakEnd: profile?.lunchBreakEnd ?? '14:00',
    letterheadUrl: profile?.letterheadUrl ?? '',
    signatureUrl: profile?.signatureUrl ?? '',
    notes: profile?.notes ?? '',
  };

  const pickLogo = async (files: FileList | null) => {
    // Copy before the reset below: `files` is a live FileList owned by the
    // input, and clearing `value` empties it.
    const file = Array.from(files ?? [])[0];
    if (logoInput.current) logoInput.current.value = '';
    if (!file) return;
    try {
      await uploadLogo(file).unwrap();
      toast.success('Logo updated');
    } catch (err) {
      toast.error(apiError(err, 'Could not upload the logo'));
    }
  };

  const dropLogo = async () => {
    try {
      await removeLogo().unwrap();
      toast.success('Logo removed');
    } catch (err) {
      toast.error(apiError(err, 'Could not remove the logo'));
    }
  };

  const submit = async (values: typeof initialValues) => {
    setError('');
    if (values.lunchBreakStart >= values.lunchBreakEnd) {
      setError('Break end time must be after start time');
      return;
    }
    try {
      await save(values as HospitalSelfUpdateBody).unwrap();
      toast.success('Settings saved');
    } catch (err) {
      const message = apiError(err, 'Could not save settings');
      setError(message);
      toast.error(message);
    }
  };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Hospital Settings"
      subtitle={hospital?.name ?? 'Your hospital'}
    >
      {isLoading || !data ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="max-w-4xl space-y-6">
          {/* ---- Registered identity: read-only, and said so plainly ---- */}
          <Section
            icon={ShieldCheck}
            title="Registered identity"
            blurb="Verified by NetCare against your uploaded documents. Contact us to change any of these."
          >
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <ReadOnly label="Legal name" value={hospital?.legalName} />
              <ReadOnly label="Entity type" value={hospital?.entityType} />
              <ReadOnly label="Registration no." value={hospital?.registrationNo} />
              <ReadOnly label="PAN" value={hospital?.pan} />
              <ReadOnly label="GSTIN" value={hospital?.gstin} />
              <ReadOnly label="HFR ID" value={hospital?.hfrId} />
              <ReadOnly label="NABH" value={hospital?.nabhStatus} />
              <ReadOnly label="Subdomain" value={hospital?.subdomain} />
              <ReadOnly label="Category" value={hospital?.category?.replace('-', ' ')} />
              <ReadOnly label="Status" value={hospital?.status} />
              <ReadOnly label="Onboarding" value={hospital?.onboardingStatus} />
              <ReadOnly
                label="Verified"
                value={hospital?.verifiedAt ? new Date(hospital.verifiedAt).toLocaleDateString() : ''}
              />
            </dl>
          </Section>

          {/* Outside the form on purpose: a file uploads the moment it is
              chosen, so pairing it with a Save button would be a lie about
              when the change lands. */}
          <Section
            icon={ImageIcon}
            title="Logo"
            blurb="Shown in the sidebar and on your hospital's login page."
          >
            <div className="flex flex-wrap items-center gap-5">
              <div className="w-24 h-24 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                {profile?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.logoUrl} alt="Hospital logo" className="w-full h-full object-contain" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-slate-300" />
                )}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={logoInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => pickLogo(e.target.files)}
                  />
                  <button
                    type="button"
                    disabled={!canEdit || isUploading}
                    onClick={() => logoInput.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
                  >
                    <Upload className="w-4 h-4" />
                    {isUploading ? 'Uploading…' : profile?.logoUrl ? 'Replace' : 'Upload logo'}
                  </button>
                  {profile?.logoUrl && canEdit && (
                    <button
                      type="button"
                      onClick={dropLogo}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-500 hover:text-red-600 hover:border-red-200 transition"
                    >
                      <Trash2 className="w-4 h-4" /> Remove
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  PNG, JPEG or WebP. A square image around 512&times;512 works best —
                  it is displayed small, so fine detail will not survive.
                </p>
              </div>
            </div>
          </Section>

          <Formik initialValues={initialValues} validationSchema={schema} onSubmit={submit} enableReinitialize>
            {({ values, setFieldValue }) => (
              <Form className="space-y-6">
                <fieldset disabled={!canEdit} className="space-y-6 disabled:opacity-70">
                  <Section icon={Building2} title="Name & branding" blurb="How your hospital appears to patients and staff.">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField name="name" label="Hospital name" required />
                      <FormField name="tagline" label="Tagline" placeholder="Care, close to home" />
                    </div>
                  </Section>

                  <Section icon={MapPin} title="Address">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField name="addressLine1" label="Address line 1" />
                      <FormField name="addressLine2" label="Address line 2" />
                      <FormField name="city" label="City" />
                      <FormField name="district" label="District" />
                      <FormField name="state" label="State" />
                      <FormField name="pincode" label="PIN code" />
                      <FormField name="country" label="Country" />
                    </div>
                  </Section>

                  <Section icon={Phone} title="Contact">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField name="phonePrimary" label="Primary phone" />
                      <FormField name="phoneSecondary" label="Secondary phone" />
                      <FormField name="phoneEmergency" label="Emergency phone" />
                      <FormField name="email" label="Email" />
                      <FormField name="website" label="Website" />
                    </div>
                  </Section>

                  <Section icon={UserCog} title="Owner & medical director">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField name="ownerName" label="Owner name" />
                      <FormField name="ownerPhone" label="Owner phone" />
                      <FormField name="ownerEmail" label="Owner email" />
                      <FormField name="medicalDirectorName" label="Medical director" />
                      <FormField name="medicalDirectorRegNo" label="Director registration no." />
                      <FormField name="medicalDirectorCouncil" label="Medical council" />
                      <FormField name="medicalDirectorQualification" label="Qualification" />
                    </div>
                  </Section>

                  <Section icon={BedDouble} title="Facilities & capacity">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <FormField name="bedCount" label="Total beds" type="number" min="0" />
                      <FormField name="icuBeds" label="ICU beds" type="number" min="0" />
                      <FormField name="nicuBeds" label="NICU beds" type="number" min="0" />
                      <FormField name="emergencyBeds" label="Emergency beds" type="number" min="0" />
                      <FormField name="operationTheatres" label="Operation theatres" type="number" min="0" />
                      <FormField name="ambulanceCount" label="Ambulances" type="number" min="0" />
                    </div>
                    <div className="mt-5 flex flex-wrap gap-3">
                      {FACILITIES.map(({ key, label }) => (
                        <label
                          key={key}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition ${
                            values[key as keyof typeof values]
                              ? 'border-cyan-400 bg-cyan-50 text-slate-900'
                              : 'border-slate-200 text-slate-500'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(values[key as keyof typeof values])}
                            onChange={(e) => setFieldValue(key as string, e.target.checked)}
                            className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </Section>

                  <Section icon={Clock} title="Scheduling" blurb="Slots inside the break window are blocked for all bookings.">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField name="appointmentSlotMinutes" label="Slot length (minutes)" type="number" min="5" max="240" />
                      <FormField name="timezone" label="Timezone" />
                      <FormField name="lunchBreakStart" label="Break starts" type="time" />
                      <FormField name="lunchBreakEnd" label="Break ends" type="time" />
                    </div>
                  </Section>

                  <Section icon={ImageIcon} title="Branding assets" blurb="Used on reports and letterheads.">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField name="letterheadUrl" label="Letterhead URL" />
                      <FormField name="signatureUrl" label="Signature URL" />
                      <FormField name="notes" label="Internal notes" />
                    </div>
                  </Section>
                </fieldset>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                {canEdit ? (
                  <div className="sticky bottom-0 bg-slate-50 py-4 flex justify-end border-t border-slate-200">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white text-sm font-semibold rounded-lg shadow hover:opacity-95 disabled:opacity-50 transition"
                    >
                      {isSaving ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-xs text-slate-400">
                    <Lock className="w-3.5 h-3.5" />
                    You can view these settings but not change them.
                  </p>
                )}
              </Form>
            )}
          </Formik>

          {/* ---- The rest of the record: read-only ---- */}
          <Section icon={FileText} title="Licences & documents" blurb="Recorded during onboarding. Contact us to file a renewal.">
            {data.licences.length === 0 && data.documents.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing recorded yet.</p>
            ) : (
              <div className="space-y-4">
                {data.licences.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-4 text-sm border-b border-slate-100 pb-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{l.type}</p>
                      <p className="text-xs text-slate-500">{l.number || '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-500">
                        Expires <FormattedDate iso={l.expiresOn} />
                      </p>
                      <p className="text-xs text-slate-400">{l.status}</p>
                    </div>
                  </div>
                ))}
                {data.documents.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-4 text-sm">
                    <span className="truncate text-slate-700">{d.title || d.fileName}</span>
                    {d.fileUrl && (
                      <a
                        href={d.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-cyan-600 hover:underline shrink-0"
                      >
                        Open
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {data.subscription && (
            <Section icon={CreditCard} title="Plan" blurb="Your subscription with NetCare.">
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
                <ReadOnly label="Plan" value={data.subscription.plan} />
                <ReadOnly label="Status" value={data.subscription.status} />
                <ReadOnly label="Max users" value={data.subscription.maxUsers} />
                <ReadOnly label="Max doctors" value={data.subscription.maxDoctors} />
              </dl>
            </Section>
          )}
        </div>
      )}
    </DashboardShell>
  );
}

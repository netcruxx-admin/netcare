'use client';

import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { FormField } from '@/components/form/FormField';
import { useGetOnboardingMetaQuery, useUpdateHospitalMutation } from '@/store/api';
import type { HospitalInfo } from '@/store/api';

const CATEGORY_THEMES: Record<string, { primary: string; primaryDark: string }> = {
  maternity: { primary: '#0891b2', primaryDark: '#0d9488' },
  'multi-specialty': { primary: '#4f46e5', primaryDark: '#4338ca' },
  dental: { primary: '#0d9488', primaryDark: '#0f766e' },
  eye: { primary: '#2563eb', primaryDark: '#1d4ed8' },
  diagnostic: { primary: '#7c3aed', primaryDark: '#6d28d9' },
};

const ONBOARDING_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'documents_submitted', label: 'Documents Submitted' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
];

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

const optionalMatch = (re: RegExp, message: string) =>
  Yup.string()
    .trim()
    .transform((v: string) => (v ? v.toUpperCase() : v))
    .test('format', message, (v) => !v || re.test(v));

const schema = Yup.object({
  name: Yup.string().trim().required('Hospital name is required'),
  tagline: Yup.string().trim().max(120, 'Keep it under 120 characters'),
  category: Yup.string().required('Category is required'),
  currency: Yup.string().trim().required('Currency is required'),
  status: Yup.string().oneOf(['active', 'inactive']).required(),
  primary: Yup.string().required(),
  primaryDark: Yup.string().required(),
  legalName: Yup.string().trim().max(160, 'Keep it under 160 characters'),
  pan: optionalMatch(PAN_RE, 'PAN must look like ABCDE1234F'),
  gstin: optionalMatch(GSTIN_RE, 'GSTIN must be 15 characters, e.g. 27ABCDE1234F1Z5'),
  registrationNo: Yup.string().trim().max(60, 'Too long'),
  nabhValidTill: Yup.string().when('nabhStatus', {
    is: (v: string) => v && v !== 'none',
    then: (s) => s.required('Give the accreditation expiry'),
    otherwise: (s) => s,
  }),
});

interface Props {
  open: boolean;
  hospital: HospitalInfo;
  onClose: () => void;
  onSuccess: () => void;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 pt-2 pb-1 border-b border-slate-100">
      {children}
    </p>
  );
}

export function EditHospitalModal({ open, hospital, onClose, onSuccess }: Props) {
  const [updateHospital] = useUpdateHospitalMutation();
  const { data: meta } = useGetOnboardingMetaQuery(hospital.category, { skip: !open });

  if (!open) return null;

  const theme = hospital.theme as Record<string, string>;

  const entityTypeOptions = meta?.entityTypes?.map((e) => ({ value: e.code, label: e.label })) ?? [];
  const ownershipOptions = meta?.ownershipTypes?.map((o) => ({ value: o.code, label: o.label })) ?? [];
  const nabhStatusOptions = meta?.nabhStatuses?.map((n) => ({ value: n.code, label: n.label })) ?? [
    { value: 'none', label: 'Not Applicable' },
    { value: 'applied', label: 'Applied' },
    { value: 'accredited', label: 'Accredited' },
  ];
  const categoryOptions = meta?.categories?.map((c) => ({ value: c.code, label: c.label })) ?? [
    { value: 'maternity', label: 'Maternity & Newborn' },
    { value: 'multi-specialty', label: 'Multi-Specialty' },
    { value: 'dental', label: 'Dental Clinic' },
    { value: 'eye', label: 'Eye Hospital' },
    { value: 'diagnostic', label: 'Diagnostic Center' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Edit Hospital</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <Formik
            initialValues={{
              // Basic
              name: hospital.name,
              tagline: hospital.tagline ?? '',
              category: hospital.category,
              currency: hospital.currency ?? 'INR',
              status: hospital.status ?? 'active',
              primary: theme?.primary ?? '#4f46e5',
              primaryDark: theme?.primaryDark ?? '#4338ca',
              // Legal identity
              legalName: hospital.legalName ?? '',
              entityType: hospital.entityType ?? '',
              ownership: hospital.ownership ?? '',
              // Registration & tax
              registrationNo: hospital.registrationNo ?? '',
              registrationAuthority: hospital.registrationAuthority ?? '',
              registrationValidTill: hospital.registrationValidTill ?? '',
              pan: hospital.pan ?? '',
              gstin: hospital.gstin ?? '',
              hfrId: hospital.hfrId ?? '',
              nabhStatus: hospital.nabhStatus ?? 'none',
              nabhValidTill: hospital.nabhValidTill ?? '',
              // Lifecycle
              onboardingStatus: hospital.onboardingStatus ?? 'pending',
              goLiveDate: hospital.goLiveDate ?? '',
            }}
            validationSchema={schema}
            onSubmit={async (values, { setSubmitting, setFieldError }) => {
              try {
                await updateHospital({
                  id: hospital.id,
                  body: {
                    name: values.name.trim(),
                    tagline: values.tagline.trim(),
                    category: values.category,
                    currency: values.currency.trim(),
                    status: values.status,
                    theme: { primary: values.primary, primaryDark: values.primaryDark },
                    legalName: values.legalName.trim(),
                    entityType: values.entityType,
                    ownership: values.ownership,
                    registrationNo: values.registrationNo.trim(),
                    registrationAuthority: values.registrationAuthority.trim(),
                    registrationValidTill: values.registrationValidTill,
                    pan: values.pan.trim().toUpperCase(),
                    gstin: values.gstin.trim().toUpperCase(),
                    hfrId: values.hfrId.trim().toUpperCase(),
                    nabhStatus: values.nabhStatus,
                    nabhValidTill: values.nabhValidTill,
                    onboardingStatus: values.onboardingStatus as HospitalInfo['onboardingStatus'],
                    goLiveDate: values.goLiveDate,
                  },
                }).unwrap();
                toast.success('Hospital updated');
                onSuccess();
              } catch (err: unknown) {
                const detail = (err as { data?: { detail?: string } })?.data?.detail;
                setFieldError('name', detail ?? 'Failed to update hospital');
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {({ isSubmitting, values, setFieldValue }) => (
              <Form className="space-y-5">

                {/* ── Basic Info ─────────────────────────────────────────── */}
                <SectionTitle>Basic Info</SectionTitle>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField name="name" label="Hospital Name" placeholder="e.g. City Eye Care" required />
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Status <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={values.status}
                      onChange={(e) => setFieldValue('status', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <FormField name="tagline" label="Tagline" placeholder="e.g. Caring for you, every step of the way" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={values.category}
                      onChange={(e) => {
                        const cat = e.target.value;
                        setFieldValue('category', cat);
                        const t = CATEGORY_THEMES[cat];
                        if (t) {
                          setFieldValue('primary', t.primary);
                          setFieldValue('primaryDark', t.primaryDark);
                        }
                      }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-cyan-500"
                    >
                      {categoryOptions.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <FormField name="currency" label="Currency" placeholder="INR" required />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Primary Colour</label>
                    <div className="flex items-center gap-2 h-9">
                      <input
                        type="color"
                        value={values.primary}
                        onChange={(e) => setFieldValue('primary', e.target.value)}
                        className="h-9 w-12 rounded border border-slate-300 cursor-pointer"
                      />
                      <span className="text-xs font-mono text-slate-500">{values.primary}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Accent Colour</label>
                    <div className="flex items-center gap-2 h-9">
                      <input
                        type="color"
                        value={values.primaryDark}
                        onChange={(e) => setFieldValue('primaryDark', e.target.value)}
                        className="h-9 w-12 rounded border border-slate-300 cursor-pointer"
                      />
                      <span className="text-xs font-mono text-slate-500">{values.primaryDark}</span>
                    </div>
                  </div>
                </div>

                {/* ── Legal Identity ─────────────────────────────────────── */}
                <SectionTitle>Legal Identity</SectionTitle>

                <FormField
                  name="legalName"
                  label="Registered Legal Name"
                  placeholder="e.g. Sunrise Healthcare Services Pvt Ltd"
                />
                <p className="-mt-3 text-xs text-slate-400">
                  Printed on invoices and reports. Leave blank if the same as the hospital name.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Entity Type</label>
                    <select
                      value={values.entityType}
                      onChange={(e) => setFieldValue('entityType', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">How it is incorporated…</option>
                      {entityTypeOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Ownership</label>
                    <select
                      value={values.ownership}
                      onChange={(e) => setFieldValue('ownership', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">Who owns it…</option>
                      {ownershipOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ── Registration & Tax ─────────────────────────────────── */}
                <SectionTitle>Registration &amp; Tax</SectionTitle>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField
                    name="registrationNo"
                    label="Registration Number"
                    placeholder="e.g. CEA/2021/00412"
                  />
                  <FormField
                    name="registrationAuthority"
                    label="Issuing Authority"
                    placeholder="e.g. State Health Dept"
                  />
                  <FormField name="registrationValidTill" label="Valid Till" type="date" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField name="pan" label="PAN" placeholder="e.g. ABCDE1234F" />
                  <FormField name="gstin" label="GSTIN" placeholder="e.g. 27ABCDE1234F1Z5" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField name="hfrId" label="HFR ID" placeholder="Health Facility Registry" />
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">NABH Status</label>
                    <select
                      value={values.nabhStatus}
                      onChange={(e) => {
                        setFieldValue('nabhStatus', e.target.value);
                        if (e.target.value === 'none') setFieldValue('nabhValidTill', '');
                      }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-cyan-500"
                    >
                      {nabhStatusOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  {values.nabhStatus && values.nabhStatus !== 'none' && (
                    <FormField name="nabhValidTill" label="NABH Valid Till" type="date" />
                  )}
                </div>

                {/* ── Onboarding Lifecycle ────────────────────────────────── */}
                <SectionTitle>Onboarding &amp; Lifecycle</SectionTitle>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Onboarding Status</label>
                    <select
                      value={values.onboardingStatus}
                      onChange={(e) => setFieldValue('onboardingStatus', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-cyan-500"
                    >
                      {ONBOARDING_STATUSES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <FormField name="goLiveDate" label="Go-Live Date" type="date" />
                </div>

                {/* Subdomain note (read-only) */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-500">
                  Subdomain <span className="font-mono text-slate-700">{hospital.subdomain}</span> is permanent and cannot be changed.
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg font-semibold text-sm hover:shadow-lg transition disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </Form>
            )}
          </Formik>
        </div>
      </div>
    </div>
  );
}

'use client';

// Edit Hospital wizard — mirrors OnboardHospitalWizard exactly in design and
// step structure (seven steps instead of eight — no admin account creation since
// the admin already exists; subdomain is read-only).
//
// Submit strategy: four requests in sequence rather than one atomic POST.
// A partial failure leaves the hospital in a usable (if incomplete) state and
// is reported as a warning on the success screen, just like document upload
// failures in the onboard wizard.
//
// Licence reconciliation: delete every original licence, then re-POST the
// current form state. Simpler than diffing and correct: the form always has the
// user's intended final state.

import { useMemo, useRef, useState } from 'react';
import { Formik, Form, useFormikContext, type FormikHelpers } from 'formik';
import * as Yup from 'yup';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  Loader2,
  Pencil,
  X,
} from 'lucide-react';
import { apiError } from '@/lib/apiError';
import { HOSPITAL_CATEGORIES } from '@/lib/hospitalCategories';
import {
  useGetHospitalDetailQuery,
  useGetOnboardingMetaQuery,
  useUpdateHospitalMutation,
  useReplaceHospitalProfileMutation,
  useAddHospitalLicenceMutation,
  useDeleteHospitalLicenceMutation,
  useReplaceHospitalSubscriptionMutation,
  useUploadHospitalDocumentMutation,
} from '@/store/api';
import type { HospitalDetail, HospitalInfo, OnboardingMeta } from '@/store/api';
import {
  CATEGORY_THEMES,
  INITIAL_VALUES,
  type PendingDocument,
  type WizardValues,
  type LicenceRow,
} from './onboarding/config';
import {
  ClinicalStep,
  ContactStep,
  DocumentsStep,
  LicencesStep,
  OperationsStep,
  RegistrationStep,
} from './onboarding/StepPanels';
import { ColourField, FieldGrid, ReviewRow, SectionTitle } from './onboarding/fields';
import { FormField } from '@/components/form/FormField';

// ---------------------------------------------------------------------------
// Step definitions (7 steps — identity through operations, no admin)
// ---------------------------------------------------------------------------

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const PINCODE = /^[1-9][0-9]{5}$/;
const PHONE = /^[0-9+\-\s()]{6,15}$/;

const optionalMatch = (re: RegExp, message: string) =>
  Yup.string()
    .trim()
    .transform((v: string) => (v ? v.toUpperCase() : v))
    .test('format', message, (v) => !v || re.test(v));

interface EditStepDefinition {
  id: string;
  title: string;
  blurb: string;
  schema: Yup.AnyObjectSchema;
}

const EDIT_STEPS: EditStepDefinition[] = [
  {
    id: 'identity',
    title: 'Identity',
    blurb: 'What the hospital is called, and what kind of facility it is.',
    schema: Yup.object({
      name: Yup.string().trim().required('Hospital name is required'),
      // subdomain is read-only in edit mode — not validated here
      category: Yup.string().required('Category is required'),
      legalName: Yup.string().trim().max(160, 'Keep it under 160 characters'),
      tagline: Yup.string().trim().max(120, 'Keep it under 120 characters'),
    }),
  },
  {
    id: 'registration',
    title: 'Registration & Tax',
    blurb: 'The statutory identifiers that get printed on invoices and reports.',
    schema: Yup.object({
      pan: optionalMatch(PAN_RE, 'PAN must look like ABCDE1234F'),
      gstin: optionalMatch(GSTIN_RE, 'GSTIN must be 15 characters, e.g. 27ABCDE1234F1Z5'),
      registrationNo: Yup.string().trim().max(60, 'Too long'),
      nabhValidTill: Yup.string().when('nabhStatus', {
        is: (v: string) => v && v !== 'none',
        then: (s) => s.required('Give the accreditation expiry'),
        otherwise: (s) => s,
      }),
    }),
  },
  {
    id: 'contact',
    title: 'Contact & Leadership',
    blurb: 'Where the facility is, and who is answerable for it.',
    schema: Yup.object({
      pincode: Yup.string()
        .trim()
        .test('pincode', 'PIN code must be 6 digits and cannot start with 0', (v) => !v || PINCODE.test(v)),
      email: Yup.string().trim().email('Invalid email'),
      ownerEmail: Yup.string().trim().email('Invalid email'),
      phonePrimary: Yup.string()
        .trim()
        .test('phone', 'Enter a valid phone number', (v) => !v || PHONE.test(v)),
      phoneEmergency: Yup.string()
        .trim()
        .test('phone', 'Enter a valid phone number', (v) => !v || PHONE.test(v)),
      website: Yup.string().trim().url('Include the http:// or https://'),
    }),
  },
  {
    id: 'clinical',
    title: 'Clinical Profile',
    blurb: 'Beds, on-site services and specialties — what the building has.',
    schema: Yup.object({
      bedCount: Yup.number().min(0, 'Cannot be negative').max(10000, 'That seems too high'),
      icuBeds: Yup.number()
        .min(0, 'Cannot be negative')
        .test('icu-fits', 'ICU beds cannot exceed the total bed count', function (value) {
          const total = this.parent.bedCount;
          return !value || !total || Number(value) <= Number(total);
        }),
      nicuBeds: Yup.number().min(0, 'Cannot be negative'),
      emergencyBeds: Yup.number().min(0, 'Cannot be negative'),
      operationTheatres: Yup.number().min(0, 'Cannot be negative'),
      ambulanceCount: Yup.number().min(0, 'Cannot be negative'),
    }),
  },
  {
    id: 'licences',
    title: 'Licences',
    blurb: 'Statutory licences and their expiry dates.',
    schema: Yup.object({
      licences: Yup.array().of(
        Yup.object({
          type: Yup.string().required('Pick a licence type'),
          number: Yup.string().trim().required('Licence number is required'),
        }),
      ),
    }),
  },
  {
    id: 'documents',
    title: 'Documents',
    blurb: 'Scans of the certificates above. PDF or image, up to 10MB each.',
    schema: Yup.object({}),
  },
  {
    id: 'operations',
    title: 'Operations & Plan',
    blurb: 'Numbering, scheduling defaults, and the commercial terms.',
    schema: Yup.object({
      appointmentSlotMinutes: Yup.number().min(5, 'At least 5 minutes').max(240, 'At most 240 minutes'),
      invoicePrefix: Yup.string().trim().max(10, 'Keep it short'),
      mrnPrefix: Yup.string().trim().max(10, 'Keep it short'),
      price: Yup.number().min(0, 'Cannot be negative'),
      maxUsers: Yup.number().min(0, 'Cannot be negative'),
      maxDoctors: Yup.number().min(0, 'Cannot be negative'),
      maxBeds: Yup.number().min(0, 'Cannot be negative'),
      billingContactEmail: Yup.string().trim().email('Invalid email'),
      billingGstin: optionalMatch(GSTIN_RE, 'GSTIN must be 15 characters'),
    }),
  },
  {
    id: 'review',
    title: 'Review',
    blurb: 'Set the onboarding state and review everything before saving.',
    schema: Yup.object({}),
  },
];

// ---------------------------------------------------------------------------
// Mapping HospitalDetail → WizardValues
// ---------------------------------------------------------------------------

function detailToValues(detail: HospitalDetail): WizardValues {
  const h = detail.hospital;
  const p = detail.profile;
  const s = detail.subscription;

  return {
    ...INITIAL_VALUES,

    // Identity
    name: h.name ?? '',
    subdomain: h.subdomain ?? '',
    category: h.category ?? 'multi-specialty',
    tagline: h.tagline ?? '',
    legalName: h.legalName ?? '',
    entityType: h.entityType ?? '',
    ownership: h.ownership ?? 'private',
    facilityType: p?.facilityType ?? '',
    currency: h.currency ?? 'INR',
    primary: (h.theme as Record<string, string>)?.primary ?? CATEGORY_THEMES['multi-specialty'].primary,
    primaryDark: (h.theme as Record<string, string>)?.primaryDark ?? CATEGORY_THEMES['multi-specialty'].primaryDark,

    // Registration & Tax
    registrationNo: h.registrationNo ?? '',
    registrationAuthority: h.registrationAuthority ?? '',
    registrationValidTill: h.registrationValidTill ?? '',
    pan: h.pan ?? '',
    gstin: h.gstin ?? '',
    hfrId: h.hfrId ?? '',
    nabhStatus: h.nabhStatus ?? 'none',
    nabhValidTill: h.nabhValidTill ?? '',

    // Contact & Leadership
    addressLine1: p?.addressLine1 ?? '',
    addressLine2: p?.addressLine2 ?? '',
    city: p?.city ?? '',
    district: p?.district ?? '',
    state: p?.state ?? '',
    pincode: p?.pincode ?? '',
    country: p?.country ?? 'India',
    phonePrimary: p?.phonePrimary ?? '',
    phoneSecondary: p?.phoneSecondary ?? '',
    phoneEmergency: p?.phoneEmergency ?? '',
    email: p?.email ?? '',
    website: p?.website ?? '',
    ownerName: p?.ownerName ?? '',
    ownerPhone: p?.ownerPhone ?? '',
    ownerEmail: p?.ownerEmail ?? '',
    medicalDirectorName: p?.medicalDirectorName ?? '',
    medicalDirectorRegNo: p?.medicalDirectorRegNo ?? '',
    medicalDirectorCouncil: p?.medicalDirectorCouncil ?? '',
    medicalDirectorQualification: p?.medicalDirectorQualification ?? '',

    // Clinical Profile
    bedCount: p?.bedCount ?? '',
    icuBeds: p?.icuBeds ?? '',
    nicuBeds: p?.nicuBeds ?? '',
    emergencyBeds: p?.emergencyBeds ?? '',
    operationTheatres: p?.operationTheatres ?? '',
    ambulanceCount: p?.ambulanceCount ?? '',
    hasPharmacy: p?.hasPharmacy ?? false,
    hasLab: p?.hasLab ?? false,
    hasRadiology: p?.hasRadiology ?? false,
    hasBloodBank: p?.hasBloodBank ?? false,
    hasEmergency: p?.hasEmergency ?? false,
    hasAmbulance: p?.hasAmbulance ?? false,
    specialties: p?.specialties ?? [],

    // Licences
    licences: detail.licences.map((l) => ({
      type: l.type ?? '',
      number: l.number ?? '',
      issuingAuthority: l.issuingAuthority ?? '',
      issuedOn: l.issuedOn ?? '',
      expiresOn: l.expiresOn ?? '',
      status: l.status ?? 'active',
    })),

    // Operations
    timezone: p?.timezone ?? 'Asia/Kolkata',
    financialYearStart: p?.financialYearStart ?? '04-01',
    appointmentSlotMinutes: p?.appointmentSlotMinutes ?? 15,
    invoicePrefix: p?.invoicePrefix ?? 'INV',
    invoiceSeriesStart: p?.invoiceSeriesStart ?? 1,
    mrnPrefix: p?.mrnPrefix ?? 'MRN',

    // Subscription
    plan: s?.plan ?? 'trial',
    subscriptionStatus: s?.status ?? 'trial',
    billingCycle: s?.billingCycle ?? 'monthly',
    price: s?.price ?? '',
    trialEndsOn: s?.trialEndsOn ?? '',
    maxUsers: s?.maxUsers ?? '',
    maxDoctors: s?.maxDoctors ?? '',
    maxBeds: s?.maxBeds ?? '',
    billingContactName: s?.billingContactName ?? '',
    billingContactEmail: s?.billingContactEmail ?? '',
    billingContactPhone: s?.billingContactPhone ?? '',
    billingGstin: s?.billingGstin ?? '',
    billingAddress: s?.billingAddress ?? '',

    // Lifecycle (no admin fields in edit mode)
    onboardingStatus: h.onboardingStatus ?? 'pending',
    goLiveDate: h.goLiveDate ?? '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    adminPhone: '',
  };
}

// ---------------------------------------------------------------------------
// Edit Identity Step — identical to IdentityStep but subdomain is read-only
// ---------------------------------------------------------------------------

function EditIdentityStep({ meta }: { meta?: OnboardingMeta }) {
  const { values, setFieldValue } = useFormikContext<WizardValues>();

  const categories = meta?.categories?.length
    ? meta.categories.map((c) => ({ value: c.code, label: c.label }))
    : Object.values(HOSPITAL_CATEGORIES).map((c) => ({ value: c.id, label: c.label }));

  const asOptions = (items: { code: string; label: string }[] = []) =>
    items.map((i) => ({ value: i.code, label: i.label }));

  return (
    <div className="space-y-5">
      <FieldGrid>
        <FormField name="name" label="Hospital Name" placeholder="e.g. Sunrise Mother & Child" required autoFocus />
        {/* Subdomain is permanent — shown read-only */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Subdomain</label>
          <div className="w-full px-3 py-2 border border-slate-200 rounded bg-slate-50 text-sm text-slate-700 font-mono">
            {values.subdomain}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Staff sign in at{' '}
            <span className="font-mono text-slate-600">{values.subdomain}.carbonhealth.com</span>{' '}
            — this cannot be changed.
          </p>
        </div>
      </FieldGrid>

      <FieldGrid>
        <FormField
          name="legalName"
          label="Registered Legal Name"
          placeholder="e.g. Sunrise Healthcare Services Pvt Ltd"
        />
        <FormField name="tagline" label="Tagline" placeholder="Leave blank to use the category default" />
      </FieldGrid>
      <p className="-mt-3 text-xs text-slate-400">
        The legal name is what goes on invoices and registration records. Leave it blank if it is
        the same as the hospital name.
      </p>

      <FieldGrid cols={3}>
        <FormField
          name="category"
          label="Category"
          as="select"
          required
          options={categories}
          placeholder="Select a category…"
          onValueChange={(category) => {
            const theme = CATEGORY_THEMES[category];
            if (theme) {
              setFieldValue('primary', theme.primary);
              setFieldValue('primaryDark', theme.primaryDark);
            }
          }}
        />
        <FormField
          name="entityType"
          label="Entity Type"
          as="select"
          options={asOptions(meta?.entityTypes)}
          placeholder="How it is incorporated…"
        />
        <FormField
          name="ownership"
          label="Ownership"
          as="select"
          options={asOptions(meta?.ownershipTypes)}
          placeholder="Who owns it…"
        />
      </FieldGrid>

      <FieldGrid cols={3}>
        <FormField
          name="facilityType"
          label="Facility Type"
          as="select"
          options={asOptions(meta?.facilityTypes)}
          placeholder="Clinic, nursing home…"
        />
        <ColourField
          label="Primary Colour"
          value={values.primary}
          onChange={(v) => setFieldValue('primary', v)}
        />
        <ColourField
          label="Accent Colour"
          value={values.primaryDark}
          onChange={(v) => setFieldValue('primaryDark', v)}
        />
      </FieldGrid>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard component
// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  hospital: HospitalInfo;
  onClose: () => void;
  onUpdated?: () => void;
}

interface SaveResult {
  name: string;
  warnings: string[];
}

export function EditHospitalWizard({ open, hospital, onClose, onUpdated }: Props) {
  const [step, setStep] = useState(0);
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [formError, setFormError] = useState('');
  const [category, setCategory] = useState(hospital.category);

  // The server IDs of licences that existed when the wizard opened.
  // We delete all of them on submit and re-POST the form state — simple and correct.
  const originalLicenceIds = useRef<string[]>([]);

  const [updateHospital] = useUpdateHospitalMutation();
  const [replaceProfile] = useReplaceHospitalProfileMutation();
  const [addLicence] = useAddHospitalLicenceMutation();
  const [deleteLicence] = useDeleteHospitalLicenceMutation();
  const [replaceSubscription] = useReplaceHospitalSubscriptionMutation();
  const [uploadDocument] = useUploadHospitalDocumentMutation();

  const { data: detail, isLoading: loadingDetail } = useGetHospitalDetailQuery(hospital.id, {
    skip: !open,
  });
  const { data: meta } = useGetOnboardingMetaQuery(category, { skip: !open });

  // Record the original licence IDs the first time the detail arrives.
  if (detail && originalLicenceIds.current.length === 0 && detail.licences.length > 0) {
    originalLicenceIds.current = detail.licences.map((l) => l.id);
  }

  const isLast = step === EDIT_STEPS.length - 1;
  const current = EDIT_STEPS[step];

  const reset = () => {
    setStep(0);
    setDocuments([]);
    setResult(null);
    setFormError('');
    originalLicenceIds.current = [];
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const addDocuments = (files: FileList) =>
    setDocuments((cur) => [
      ...cur,
      ...Array.from(files).map((file) => ({
        key: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        docType: 'other',
        licenceType: '',
        title: '',
      })),
    ]);

  const removeDocument = (key: string) =>
    setDocuments((cur) => cur.filter((d) => d.key !== key));

  const patchDocument = (key: string, patch: Partial<PendingDocument>) =>
    setDocuments((cur) => cur.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const num = (v: number | ''): number | undefined =>
    v === '' || v === null ? undefined : Number(v);
  const tr = (v: string) => (v ?? '').trim();

  const submit = async (
    values: WizardValues,
    { setSubmitting }: FormikHelpers<WizardValues>,
  ) => {
    setFormError('');
    const id = hospital.id;
    const warnings: string[] = [];

    try {
      // 1. PATCH hospital row (basic info + legal fields)
      await updateHospital({
        id,
        body: {
          name: tr(values.name),
          tagline: tr(values.tagline) || undefined,
          category: values.category,
          currency: values.currency || undefined,
          status: hospital.status,
          theme: { primary: values.primary, primaryDark: values.primaryDark },
          legalName: tr(values.legalName),
          entityType: values.entityType,
          ownership: values.ownership,
          registrationNo: tr(values.registrationNo),
          registrationAuthority: tr(values.registrationAuthority),
          registrationValidTill: values.registrationValidTill,
          pan: tr(values.pan).toUpperCase(),
          gstin: tr(values.gstin).toUpperCase(),
          hfrId: tr(values.hfrId).toUpperCase(),
          nabhStatus: values.nabhStatus,
          nabhValidTill: values.nabhValidTill,
          onboardingStatus: values.onboardingStatus,
          goLiveDate: values.goLiveDate,
        },
      }).unwrap();

      // 2. PUT profile
      try {
        await replaceProfile({
          id,
          body: {
            addressLine1: tr(values.addressLine1),
            addressLine2: tr(values.addressLine2),
            city: tr(values.city),
            district: tr(values.district),
            state: values.state,
            pincode: tr(values.pincode),
            country: values.country || 'India',
            phonePrimary: tr(values.phonePrimary),
            phoneSecondary: tr(values.phoneSecondary),
            phoneEmergency: tr(values.phoneEmergency),
            email: tr(values.email),
            website: tr(values.website),
            ownerName: tr(values.ownerName),
            ownerPhone: tr(values.ownerPhone),
            ownerEmail: tr(values.ownerEmail),
            medicalDirectorName: tr(values.medicalDirectorName),
            medicalDirectorRegNo: tr(values.medicalDirectorRegNo),
            medicalDirectorCouncil: values.medicalDirectorCouncil,
            medicalDirectorQualification: tr(values.medicalDirectorQualification),
            facilityType: values.facilityType,
            bedCount: num(values.bedCount),
            icuBeds: num(values.icuBeds),
            nicuBeds: num(values.nicuBeds),
            emergencyBeds: num(values.emergencyBeds),
            operationTheatres: num(values.operationTheatres),
            ambulanceCount: num(values.ambulanceCount),
            hasPharmacy: values.hasPharmacy,
            hasLab: values.hasLab,
            hasRadiology: values.hasRadiology,
            hasBloodBank: values.hasBloodBank,
            hasEmergency: values.hasEmergency,
            hasAmbulance: values.hasAmbulance,
            specialties: values.specialties,
            timezone: values.timezone,
            financialYearStart: values.financialYearStart,
            appointmentSlotMinutes: num(values.appointmentSlotMinutes),
            invoicePrefix: tr(values.invoicePrefix) || 'INV',
            invoiceSeriesStart: num(values.invoiceSeriesStart),
            mrnPrefix: tr(values.mrnPrefix) || 'MRN',
          },
        }).unwrap();
      } catch {
        warnings.push('Profile details could not be saved');
      }

      // 3. Licences: delete originals, re-POST form state
      for (const licenceId of originalLicenceIds.current) {
        try {
          await deleteLicence({ id, licenceId }).unwrap();
        } catch {
          // Best-effort — if delete fails, the POST below may create a duplicate,
          // but the user can clean that up from the detail screen.
        }
      }
      const validLicences = values.licences.filter((l) => l.type && l.number.trim());
      for (const l of validLicences) {
        try {
          await addLicence({
            id,
            body: {
              type: l.type,
              number: tr(l.number),
              issuingAuthority: tr(l.issuingAuthority),
              issuedOn: l.issuedOn,
              expiresOn: l.expiresOn,
              status: (l.status || 'pending') as 'pending' | 'active' | 'expired' | 'rejected',
            },
          }).unwrap();
        } catch {
          warnings.push(`Licence "${l.type}" could not be saved`);
        }
      }

      // 4. Upload new documents
      for (const doc of documents) {
        try {
          await uploadDocument({
            id,
            file: doc.file,
            docType: doc.docType,
            licenceType: doc.licenceType,
            title: doc.title,
          }).unwrap();
        } catch {
          warnings.push(`Document "${doc.file.name}" could not be uploaded`);
        }
      }

      // 5. PUT subscription
      try {
        await replaceSubscription({
          id,
          body: {
            plan: values.plan,
            status: values.subscriptionStatus,
            billingCycle: values.billingCycle,
            price: num(values.price),
            currency: values.currency,
            trialEndsOn: values.trialEndsOn,
            maxUsers: num(values.maxUsers),
            maxDoctors: num(values.maxDoctors),
            maxBeds: num(values.maxBeds),
            billingContactName: tr(values.billingContactName),
            billingContactEmail: tr(values.billingContactEmail),
            billingContactPhone: tr(values.billingContactPhone),
            billingGstin: tr(values.billingGstin).toUpperCase(),
            billingAddress: tr(values.billingAddress),
          },
        }).unwrap();
      } catch {
        warnings.push('Subscription details could not be saved');
      }

      // Show success panel first; parent is notified for cache refresh only.
      setResult({ name: values.name, warnings });
      onUpdated?.();
    } catch (err) {
      setFormError(apiError(err, 'Failed to save hospital'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  if (loadingDetail || !detail) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl p-10 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
          <p className="text-sm text-slate-500">Loading hospital details…</p>
        </div>
      </div>
    );
  }

  const initialValues = detailToValues(detail);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
        {/* Header — fixed */}
        <div className="flex-shrink-0 flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-brand-teal flex items-center justify-center">
              <Pencil className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-tight">Edit Hospital</h3>
              {!result && (
                <p className="text-xs text-slate-400">
                  Step {step + 1} of {EDIT_STEPS.length} — {current.title}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-900 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          <div className="overflow-y-auto flex-1">
            <SuccessPanel result={result} onDone={handleClose} />
          </div>
        ) : (
          <Formik
            initialValues={initialValues}
            validationSchema={current.schema}
            enableReinitialize={false}
            onSubmit={submit}
          >
            {({ isSubmitting, validateForm, setTouched, values }) => {
              const goNext = async () => {
                const errors = await validateForm();
                if (Object.keys(errors).length > 0) {
                  setTouched(
                    Object.keys(errors).reduce(
                      (acc, key) => ({ ...acc, [key]: true }),
                      {},
                    ),
                    false,
                  );
                  return;
                }
                setCategory(values.category);
                // Defer the DOM swap by one event-loop tick so the browser
                // finishes the current click's mouseup before the Submit button
                // renders in the same position as the Next button.
                setTimeout(() => setStep((s) => Math.min(s + 1, EDIT_STEPS.length - 1)), 0);
              };

              return (
                <Form className="flex flex-col min-h-0 flex-1">
                  {/* Stepper — fixed */}
                  <div className="flex-shrink-0">
                    <Stepper current={step} onJump={setStep} />
                  </div>

                  {/* Scrollable step content */}
                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    <p className="text-sm text-slate-500 mb-5">{current.blurb}</p>
                    <StepBody
                      step={step}
                      meta={meta}
                      documents={documents}
                      onAdd={addDocuments}
                      onRemove={removeDocument}
                      onChange={patchDocument}
                    />
                  </div>

                  {formError && (
                    <div className="flex-shrink-0 mx-6 mb-0 flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-4 py-3">
                      <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <p className="text-sm text-red-600">{formError}</p>
                    </div>
                  )}

                  {/* Footer — fixed */}
                  <div className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={step === 0 ? handleClose : () => setStep((s) => s - 1)}
                      className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
                    >
                      {step === 0 ? 'Cancel' : (<><ArrowLeft className="w-4 h-4" /> Back</>)}
                    </button>

                    <div className="flex items-center gap-3">
                      {!isLast && step > 0 && (
                        <button
                          type="button"
                          onClick={() => setStep((s) => s + 1)}
                          className="text-sm text-slate-400 hover:text-slate-600 transition"
                        >
                          Skip
                        </button>
                      )}
                      {isLast ? (
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg font-semibold text-sm hover:shadow-lg transition disabled:opacity-50"
                        >
                          {isSubmitting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                          ) : (
                            <><Check className="w-4 h-4" /> Save Changes</>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={goNext}
                          className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg font-semibold text-sm hover:shadow-lg transition"
                        >
                          Next <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </Form>
              );
            }}
          </Formik>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step body dispatcher
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Review step — same layout as AdminReviewStep but no admin account fields
// ---------------------------------------------------------------------------

function EditReviewStep({
  meta,
  documents,
}: {
  meta?: OnboardingMeta;
  documents: PendingDocument[];
}) {
  const { values } = useFormikContext<WizardValues>();
  const label = (items: { code: string; label: string }[] = [], code: string) =>
    items.find((i) => i.code === code)?.label ?? code;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SectionTitle>Onboarding State</SectionTitle>
        <FieldGrid>
          <FormField
            name="onboardingStatus"
            label="Registration Status"
            as="select"
            options={[
              { value: 'pending', label: 'Pending — paperwork not started' },
              { value: 'documents_submitted', label: 'Documents submitted — awaiting review' },
              { value: 'verified', label: 'Verified — documents checked' },
              { value: 'rejected', label: 'Rejected' },
            ]}
          />
          <FormField name="goLiveDate" label="Planned Go-Live" type="date" />
        </FieldGrid>
        <p className="text-xs text-slate-400">
          Separate from whether the hospital is active. A verified hospital can still be suspended,
          and a trial can be live while its paperwork is pending.
        </p>
      </div>

      <div className="border-t border-slate-100 pt-5 space-y-4">
        <SectionTitle>Review</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1">Identity</p>
            <ReviewRow label="Name" value={values.name} />
            <ReviewRow label="Subdomain" value={`${values.subdomain}.carbonhealth.com`} />
            <ReviewRow label="Legal name" value={values.legalName} />
            <ReviewRow label="Category" value={label(meta?.categories ?? [], values.category)} />
            <ReviewRow label="Entity" value={label(meta?.entityTypes ?? [], values.entityType)} />

            <p className="text-xs font-semibold text-slate-400 mt-4 mb-1">Registration</p>
            <ReviewRow label="Registration no." value={values.registrationNo} />
            <ReviewRow label="PAN" value={values.pan} />
            <ReviewRow label="GSTIN" value={values.gstin} />
            <ReviewRow label="HFR ID" value={values.hfrId} />
            <ReviewRow label="NABH" value={label(meta?.nabhStatuses ?? [], values.nabhStatus)} />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1">Facility</p>
            <ReviewRow
              label="Location"
              value={[values.city, values.state].filter(Boolean).join(', ')}
            />
            <ReviewRow label="Type" value={label(meta?.facilityTypes ?? [], values.facilityType)} />
            <ReviewRow label="Beds" value={values.bedCount} />
            <ReviewRow label="Medical director" value={values.medicalDirectorName} />
            <ReviewRow label="Specialties" value={values.specialties.length || ''} />

            <p className="text-xs font-semibold text-slate-400 mt-4 mb-1">Records</p>
            <ReviewRow
              label="Licences"
              value={values.licences.filter((l) => l.type && l.number).length}
            />
            <ReviewRow label="New documents" value={documents.length} />
            <ReviewRow label="Plan" value={label(meta?.subscriptionPlans ?? [], values.plan)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepBody({
  step,
  meta,
  documents,
  onAdd,
  onRemove,
  onChange,
}: {
  step: number;
  meta?: OnboardingMeta;
  documents: PendingDocument[];
  onAdd: (files: FileList) => void;
  onRemove: (key: string) => void;
  onChange: (key: string, patch: Partial<PendingDocument>) => void;
}) {
  switch (EDIT_STEPS[step].id) {
    case 'identity':
      return <EditIdentityStep meta={meta} />;
    case 'registration':
      return <RegistrationStep meta={meta} />;
    case 'contact':
      return <ContactStep meta={meta} />;
    case 'clinical':
      return <ClinicalStep />;
    case 'licences':
      return <LicencesStep meta={meta} />;
    case 'documents':
      return (
        <DocumentsStep
          meta={meta}
          documents={documents}
          onAdd={onAdd}
          onRemove={onRemove}
          onChange={onChange}
        />
      );
    case 'operations':
      return <OperationsStep meta={meta} />;
    default:
      return <EditReviewStep meta={meta} documents={documents} />;
  }
}

// ---------------------------------------------------------------------------
// Stepper — same visual as OnboardHospitalWizard
// ---------------------------------------------------------------------------

function Stepper({ current, onJump }: { current: number; onJump: (step: number) => void }) {
  const items = useMemo(() => EDIT_STEPS.map((s, i) => ({ ...s, index: i })), []);
  return (
    <div className="flex items-center gap-1 px-6 py-3 border-b border-slate-100 overflow-x-auto">
      {items.map((item) => {
        const done = item.index < current;
        const active = item.index === current;
        return (
          <button
            key={item.id}
            type="button"
            disabled={!done}
            onClick={() => onJump(item.index)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition ${
              active
                ? 'bg-cyan-50 text-cyan-700 font-semibold'
                : done
                  ? 'text-slate-500 hover:bg-slate-50 cursor-pointer'
                  : 'text-slate-300 cursor-default'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                done
                  ? 'bg-emerald-500 text-white'
                  : active
                    ? 'bg-cyan-500 text-white'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {done ? <Check className="w-2.5 h-2.5" strokeWidth={3} /> : item.index + 1}
            </span>
            {item.title}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success panel
// ---------------------------------------------------------------------------

function SuccessPanel({ result, onDone }: { result: SaveResult; onDone: () => void }) {
  return (
    <div className="px-6 py-10 text-center">
      <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
      <p className="text-xl font-bold text-slate-900 mb-1">{result.name} updated</p>
      <p className="text-sm text-slate-500">All changes have been saved.</p>

      {result.warnings.length > 0 && (
        <div className="mt-5 mx-auto max-w-md flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-left">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-700 mb-1">Some changes could not be saved:</p>
            <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <button
        onClick={onDone}
        className="mt-7 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-medium hover:shadow-lg transition"
      >
        Done
      </button>
    </div>
  );
}

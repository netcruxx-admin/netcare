// -----------------------------------------------------------------------------
// Onboarding wizard: the shape of the form, what each step validates, and how
// the whole thing becomes a request body.
//
// Kept out of the components for one reason — validation is per *step*, not per
// form. A single schema over 80 fields would refuse to advance past step 1
// because step 7 is empty, so each step declares only its own fields and the
// wizard swaps the schema as it goes. Putting the step list and its schema in
// one place is what keeps those two from drifting.
//
// Everything past the first step is optional on purpose. A hospital is
// routinely created for a demo or a trial weeks before a single certificate
// exists, so the wizard collects what it can and records how far it got in
// `onboardingStatus` rather than blocking. Format checks still apply to
// anything actually typed: a malformed GSTIN is always a mistake.
// -----------------------------------------------------------------------------

import * as Yup from 'yup';
import type {
  HospitalCreateBody,
  HospitalLicenceBody,
  OnboardingStatus,
} from '@/store/api';

export interface LicenceRow {
  type: string;
  number: string;
  issuingAuthority: string;
  issuedOn: string;
  expiresOn: string;
  status: string;
}

/** A file the user picked, held until the hospital exists to attach it to.
 *  Uploads are multipart against POST /hospitals/{id}/documents, which cannot
 *  happen before the tenant has an id. */
export interface PendingDocument {
  /** Local-only key so React can track rows that have no server id yet. */
  key: string;
  file: File;
  docType: string;
  licenceType: string;
  title: string;
}

/** One department, and whether it survives onboarding. `fromTemplate` only
 *  drives the UI grouping — the payload cares about `selected` alone. */
export interface DepartmentRow {
  name: string;
  description: string;
  selected: boolean;
  fromTemplate: boolean;
}

export interface WizardValues {
  // Step 1 — identity
  name: string;
  subdomain: string;
  category: string;
  tagline: string;
  legalName: string;
  entityType: string;
  ownership: string;
  facilityType: string;
  currency: string;
  primary: string;
  primaryDark: string;

  // Step 2 — registration, tax, accreditation
  registrationNo: string;
  registrationAuthority: string;
  registrationValidTill: string;
  pan: string;
  gstin: string;
  hfrId: string;
  nabhStatus: string;
  nabhValidTill: string;

  // Step 3 — contact, address, leadership
  addressLine1: string;
  addressLine2: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
  phonePrimary: string;
  phoneSecondary: string;
  phoneEmergency: string;
  email: string;
  website: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  medicalDirectorName: string;
  medicalDirectorRegNo: string;
  medicalDirectorCouncil: string;
  medicalDirectorQualification: string;

  // Step 4 — clinical profile
  bedCount: number | '';
  icuBeds: number | '';
  nicuBeds: number | '';
  emergencyBeds: number | '';
  operationTheatres: number | '';
  ambulanceCount: number | '';
  hasPharmacy: boolean;
  hasLab: boolean;
  hasRadiology: boolean;
  hasBloodBank: boolean;
  hasEmergency: boolean;
  hasAmbulance: boolean;
  specialties: string[];

  // Step 5 — licences
  licences: LicenceRow[];

  // Step — departments. Seeded from the chosen category's suggestions and then
  // edited: unticking is how a multi-specialty hospital says it does not run
  // cardiology, and a department nobody staffs is still bookable.
  departments: DepartmentRow[];

  // Step 7 — operations and branding
  timezone: string;
  financialYearStart: string;
  appointmentSlotMinutes: number | '';
  invoicePrefix: string;
  invoiceSeriesStart: number | '';
  mrnPrefix: string;

  // Step 7 — commercial terms
  plan: string;
  subscriptionStatus: string;
  billingCycle: string;
  price: number | '';
  trialEndsOn: string;
  maxUsers: number | '';
  maxDoctors: number | '';
  maxBeds: number | '';
  billingContactName: string;
  billingContactEmail: string;
  billingContactPhone: string;
  billingGstin: string;
  billingAddress: string;

  // Step 8 — first admin and lifecycle
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  adminPhone: string;
  onboardingStatus: OnboardingStatus;
  goLiveDate: string;
}

export const CATEGORY_THEMES: Record<string, { primary: string; primaryDark: string }> = {
  maternity: { primary: '#0891b2', primaryDark: '#0d9488' },
  'multi-specialty': { primary: '#4f46e5', primaryDark: '#4338ca' },
  dental: { primary: '#0d9488', primaryDark: '#0f766e' },
  eye: { primary: '#2563eb', primaryDark: '#1d4ed8' },
  diagnostic: { primary: '#7c3aed', primaryDark: '#6d28d9' },
};

export const INITIAL_VALUES: WizardValues = {
  name: '',
  subdomain: '',
  category: 'multi-specialty',
  tagline: '',
  legalName: '',
  entityType: '',
  ownership: 'private',
  facilityType: '',
  currency: 'INR',
  primary: CATEGORY_THEMES['multi-specialty'].primary,
  primaryDark: CATEGORY_THEMES['multi-specialty'].primaryDark,

  registrationNo: '',
  registrationAuthority: '',
  registrationValidTill: '',
  pan: '',
  gstin: '',
  hfrId: '',
  nabhStatus: 'none',
  nabhValidTill: '',

  addressLine1: '',
  addressLine2: '',
  city: '',
  district: '',
  state: '',
  pincode: '',
  country: 'India',
  phonePrimary: '',
  phoneSecondary: '',
  phoneEmergency: '',
  email: '',
  website: '',
  ownerName: '',
  ownerPhone: '',
  ownerEmail: '',
  medicalDirectorName: '',
  medicalDirectorRegNo: '',
  medicalDirectorCouncil: '',
  medicalDirectorQualification: '',

  bedCount: '',
  icuBeds: '',
  nicuBeds: '',
  emergencyBeds: '',
  operationTheatres: '',
  ambulanceCount: '',
  hasPharmacy: false,
  hasLab: false,
  hasRadiology: false,
  hasBloodBank: false,
  hasEmergency: false,
  hasAmbulance: false,
  specialties: [],

  licences: [],
  // Filled from GET /hospitals/meta/onboarding once a category is picked.
  departments: [],

  timezone: 'Asia/Kolkata',
  financialYearStart: '04-01',
  appointmentSlotMinutes: 15,
  invoicePrefix: 'INV',
  invoiceSeriesStart: 1,
  mrnPrefix: 'MRN',

  plan: 'trial',
  subscriptionStatus: 'trial',
  billingCycle: 'monthly',
  price: '',
  trialEndsOn: '',
  maxUsers: '',
  maxDoctors: '',
  maxBeds: '',
  billingContactName: '',
  billingContactEmail: '',
  billingContactPhone: '',
  billingGstin: '',
  billingAddress: '',

  adminName: '',
  adminEmail: '',
  adminPassword: 'password123',
  adminPhone: '',
  onboardingStatus: 'pending',
  goLiveDate: '',
};

// Mirrors of the server-side checks in schemas.py. Duplicated deliberately —
// the point is to catch a transposed character before a round trip, not to be
// the authority. The backend rejects the same strings regardless.
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const PINCODE = /^[1-9][0-9]{5}$/;
const PHONE = /^\d{10}$/;

const optionalMatch = (re: RegExp, message: string) =>
  Yup.string()
    .trim()
    .transform((v: string) => (v ? v.toUpperCase() : v))
    .test('format', message, (v) => !v || re.test(v));

export interface StepDefinition {
  id: string;
  title: string;
  /** One line under the heading saying what this step is for. */
  blurb: string;
  schema: Yup.AnyObjectSchema;
}

export const STEPS: StepDefinition[] = [
  {
    id: 'identity',
    title: 'Identity',
    blurb: 'What the hospital is called, and what kind of facility it is.',
    schema: Yup.object({
      name: Yup.string().trim().required('Hospital name is required'),
      subdomain: Yup.string()
        .trim()
        .lowercase()
        .required('Subdomain is required')
        .min(3, 'At least 3 characters')
        .max(40, 'At most 40 characters')
        .matches(
          /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
          'Lowercase letters, digits and hyphens only, and it cannot start or end with a hyphen',
        )
        .notOneOf(
          ['www', 'api', 'app', 'admin', 'superadmin', 'platform', 'dashboard', 'mail', 'static', 'assets', 'files', 'docs', 'status', 'support'],
          'That subdomain is reserved by the platform',
        ),
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
      pan: optionalMatch(PAN, 'PAN must look like ABCDE1234F'),
      gstin: optionalMatch(GSTIN, 'GSTIN must be 15 characters, e.g. 27ABCDE1234F1Z5'),
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
    blurb: 'Statutory licences and their expiry dates. Add only what exists today.',
    schema: Yup.object({
      licences: Yup.array().of(
        Yup.object({
          type: Yup.string().required('Pick a licence type'),
          // A licence row with an expiry but no number is a row that says
          // nothing, so the number is required once the row is opened at all.
          number: Yup.string().trim().required('Licence number is required'),
          expiresOn: Yup.string().trim(),
        }),
      ),
    }),
  },
  {
    id: 'departments',
    title: 'Departments',
    blurb: 'The clinical units this hospital actually runs. Appointments are booked into these.',
    schema: Yup.object({
      departments: Yup.array()
        .of(
          Yup.object({
            name: Yup.string().trim(),
            selected: Yup.boolean(),
          }),
        )
        // A hospital with no departments cannot take a booking at all, so this
        // is the one step that cannot be skipped empty. Checked here as well as
        // on the server: the server refusal is the guarantee, this is what stops
        // the operator filling in six more screens before finding out.
        .test(
          'at-least-one',
          'Pick at least one department — appointments are booked into them.',
          (rows) => (rows ?? []).some((r) => r?.selected && (r?.name ?? '').trim()),
        )
        .test(
          'no-duplicates',
          'Two departments have the same name.',
          (rows) => {
            const names = (rows ?? [])
              .filter((r) => r?.selected)
              .map((r) => (r?.name ?? '').trim().toLowerCase())
              .filter(Boolean);
            return new Set(names).size === names.length;
          },
        ),
    }),
  },
  {
    id: 'documents',
    title: 'Documents',
    blurb: 'Scans of the certificates above. PDF or image, up to 10MB each.',
    // Files live outside Formik (see PendingDocument) — there is nothing here
    // to validate, and the step is always skippable.
    schema: Yup.object({}),
  },
  {
    id: 'operations',
    title: 'Operations & Plan',
    blurb: 'Numbering, scheduling defaults, and the commercial terms.',
    schema: Yup.object({
      appointmentSlotMinutes: Yup.number()
        .min(5, 'At least 5 minutes')
        .max(240, 'At most 240 minutes'),
      invoicePrefix: Yup.string().trim().max(10, 'Keep it short'),
      mrnPrefix: Yup.string().trim().max(10, 'Keep it short'),
      price: Yup.number().min(0, 'Cannot be negative'),
      maxUsers: Yup.number().min(0, 'Cannot be negative'),
      maxDoctors: Yup.number().min(0, 'Cannot be negative'),
      maxBeds: Yup.number().min(0, 'Cannot be negative'),
      billingContactEmail: Yup.string().trim().email('Invalid email'),
      billingGstin: optionalMatch(GSTIN, 'GSTIN must be 15 characters'),
    }),
  },
  {
    id: 'admin',
    title: 'Admin & Review',
    blurb: 'The first account that can sign in, and a last look at everything.',
    schema: Yup.object({
      adminName: Yup.string().trim().required("The admin's name is required"),
      adminEmail: Yup.string().trim().email('Invalid email').required('Admin email is required'),
      adminPassword: Yup.string().min(8, 'At least 8 characters').required('Password is required'),
    }),
  },
];

export const DOCUMENTS_STEP_INDEX = STEPS.findIndex((s) => s.id === 'documents');

/** Empty string from a number input means "not answered", which the API should
 *  read as the default rather than as zero. */
const num = (value: number | ''): number | undefined =>
  value === '' || value === null ? undefined : Number(value);

const trimmed = (value: string): string => (value ?? '').trim();
const phone = (digits: string): string => { const d = (digits ?? '').trim(); return d ? `+91${d}` : ''; };

export function buildPayload(values: WizardValues): HospitalCreateBody {
  const licences: HospitalLicenceBody[] = values.licences
    .filter((l) => l.type && l.number.trim())
    .map((l) => ({
      type: l.type,
      number: trimmed(l.number),
      issuingAuthority: trimmed(l.issuingAuthority),
      issuedOn: l.issuedOn,
      expiresOn: l.expiresOn,
      status: (l.status || 'pending') as HospitalLicenceBody['status'],
    }));

  // Undefined rather than [] when nothing was chosen, so the backend falls back
  // to the category template exactly as it did before this step existed. An
  // empty array would mean "no departments", which it refuses.
  const departments = values.departments
    .filter((d) => d.selected && d.name.trim())
    .map((d) => ({ name: trimmed(d.name), description: trimmed(d.description) }));

  return {
    name: trimmed(values.name),
    subdomain: trimmed(values.subdomain).toLowerCase(),
    category: values.category,
    departments: departments.length ? departments : undefined,
    // Undefined rather than '' so the backend falls back to the category
    // template's tagline instead of storing a blank one.
    tagline: trimmed(values.tagline) || undefined,
    currency: values.currency || undefined,
    theme: { primary: values.primary, primaryDark: values.primaryDark },

    legalName: trimmed(values.legalName),
    entityType: values.entityType,
    ownership: values.ownership,
    registrationNo: trimmed(values.registrationNo),
    registrationAuthority: trimmed(values.registrationAuthority),
    registrationValidTill: values.registrationValidTill,
    pan: trimmed(values.pan).toUpperCase(),
    gstin: trimmed(values.gstin).toUpperCase(),
    hfrId: trimmed(values.hfrId).toUpperCase(),
    nabhStatus: values.nabhStatus,
    nabhValidTill: values.nabhValidTill,
    onboardingStatus: values.onboardingStatus,
    goLiveDate: values.goLiveDate,

    profile: {
      addressLine1: trimmed(values.addressLine1),
      addressLine2: trimmed(values.addressLine2),
      city: trimmed(values.city),
      district: trimmed(values.district),
      state: values.state,
      pincode: trimmed(values.pincode),
      country: values.country || 'India',
      phonePrimary: phone(values.phonePrimary),
      phoneSecondary: phone(values.phoneSecondary),
      phoneEmergency: phone(values.phoneEmergency),
      email: trimmed(values.email),
      website: trimmed(values.website),
      ownerName: trimmed(values.ownerName),
      ownerPhone: phone(values.ownerPhone),
      ownerEmail: trimmed(values.ownerEmail),
      medicalDirectorName: trimmed(values.medicalDirectorName),
      medicalDirectorRegNo: trimmed(values.medicalDirectorRegNo),
      medicalDirectorCouncil: values.medicalDirectorCouncil,
      medicalDirectorQualification: trimmed(values.medicalDirectorQualification),
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
      invoicePrefix: trimmed(values.invoicePrefix) || 'INV',
      invoiceSeriesStart: num(values.invoiceSeriesStart),
      mrnPrefix: trimmed(values.mrnPrefix) || 'MRN',
    },

    licences,

    subscription: {
      plan: values.plan,
      status: values.subscriptionStatus,
      billingCycle: values.billingCycle,
      price: num(values.price),
      currency: values.currency,
      trialEndsOn: values.trialEndsOn,
      maxUsers: num(values.maxUsers),
      maxDoctors: num(values.maxDoctors),
      maxBeds: num(values.maxBeds),
      billingContactName: trimmed(values.billingContactName),
      billingContactEmail: trimmed(values.billingContactEmail),
      billingContactPhone: phone(values.billingContactPhone),
      billingGstin: trimmed(values.billingGstin).toUpperCase(),
      billingAddress: trimmed(values.billingAddress),
    },

    admin: {
      name: trimmed(values.adminName),
      email: trimmed(values.adminEmail).toLowerCase(),
      password: values.adminPassword,
      phone: phone(values.adminPhone),
    },
  };
}

/**
 * Which step a server-side field error belongs to, so a 422 lands the user on
 * the screen with the bad field rather than on whichever one they happened to
 * be looking at. Keys are the field names the API reports.
 */
export const FIELD_STEP: Record<string, number> = {
  name: 0,
  subdomain: 0,
  category: 0,
  legalName: 0,
  registrationNo: 1,
  pan: 1,
  gstin: 1,
  hfrId: 1,
  nabhStatus: 1,
  pincode: 2,
  email: 2,
  licences: 4,
  adminEmail: 7,
  admin: 7,
};

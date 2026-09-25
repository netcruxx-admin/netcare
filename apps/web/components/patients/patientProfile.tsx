'use client';

import * as Yup from 'yup';
import { Calendar, Droplet, Fingerprint } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { PhoneField, toPhoneDigits, withPrefix } from '@/components/form/PhoneField';
import { AddressSearch } from '@/components/form/AddressSearch';
import { aadhaarDigits, aadhaarError, formatAadhaar } from '@/lib/aadhaar';
import type { Patient } from '@/lib/types';

/**
 * What a patient record holds about the person — the fields, their validation,
 * and the payload they turn into — in one place.
 *
 * There are three doors into a patient record: the person signs up themselves,
 * the front desk registers them, or someone edits an existing one. Each door
 * used to ask for a different subset. Sign-up collected insurance and
 * allergies; Add Patient asked five questions and stopped; the edit modal could
 * not reach insurance at all, so a detail collected at sign-up could never be
 * corrected. Nothing anywhere could record an address or an Aadhaar number.
 *
 * Mirrors `PatientProfileFields` in apps/api/app/schemas.py, which is the one
 * the server enforces.
 */

export const GENDER_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => ({
  value: b,
  label: b,
}));

/** The "identified by a relative" line, the common convention on Indian
 *  records: W/O (wife of), D/O (daughter of), S/O (son of), B/O (baby of). */
export const RELATION_OPTIONS = [
  { value: 'wife_of', label: 'Wife of' },
  { value: 'daughter_of', label: 'Daughter of' },
  { value: 'son_of', label: 'Son of' },
  { value: 'baby_of', label: 'Baby of' },
];

/** relation_type → the short label shown against the name. */
export const RELATION_SHORT: Record<string, string> = {
  wife_of: 'W/O',
  daughter_of: 'D/O',
  son_of: 'S/O',
  baby_of: 'B/O',
};

/** "W/O Ramesh Kumar", or '' when the relation line was not filled in. */
export function formatRelationLine(type?: string | null, name?: string | null): string {
  const label = RELATION_SHORT[(type ?? '').trim()];
  const who = (name ?? '').trim();
  return label && who ? `${label} ${who}` : '';
}

/** The shape every patient form holds, whatever else it adds around it. */
export interface PatientProfileValues {
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  relationType: string;
  relationName: string;
  aadhaarNumber: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
  emergencyContact: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  insuranceProvider: string;
  insuranceNumber: string;
}

export const emptyPatientProfile: PatientProfileValues = {
  dateOfBirth: '',
  gender: '',
  bloodGroup: '',
  relationType: '',
  relationName: '',
  aadhaarNumber: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  district: '',
  state: '',
  pincode: '',
  country: 'India',
  emergencyContact: '',
  emergencyPhone: '',
  emergencyRelationship: '',
  insuranceProvider: '',
  insuranceNumber: '',
};

/** An existing record as form values — for the edit modal. */
export function patientProfileValues(patient: Patient): PatientProfileValues {
  return {
    dateOfBirth: patient.dateOfBirth ?? '',
    gender: (patient.gender ?? '').toLowerCase(),
    bloodGroup: patient.bloodGroup ?? '',
    relationType: patient.relationType ?? '',
    relationName: patient.relationName ?? '',
    aadhaarNumber: formatAadhaar(patient.aadhaarNumber ?? ''),
    addressLine1: patient.addressLine1 ?? '',
    addressLine2: patient.addressLine2 ?? '',
    city: patient.city ?? '',
    district: patient.district ?? '',
    state: patient.state ?? '',
    pincode: patient.pincode ?? '',
    country: patient.country || 'India',
    emergencyContact: patient.emergencyContact ?? '',
    emergencyPhone: toPhoneDigits(patient.emergencyPhone ?? ''),
    emergencyRelationship: patient.emergencyRelationship ?? '',
    insuranceProvider: patient.insuranceProvider ?? '',
    insuranceNumber: patient.insuranceNumber ?? '',
  };
}

/**
 * Validation for the shared fields, to be spread into each form's own schema —
 * a form still says for itself whether it requires a date of birth.
 *
 * Nothing here is required. A walk-in in an emergency is registered with a name
 * and whatever else there is time for, and a form that refuses the record until
 * the paperwork arrives is a form the desk works around.
 */
export const patientProfileSchemaFields = {
  gender: Yup.string(),
  bloodGroup: Yup.string().max(10, 'Too long'),
  relationType: Yup.string().oneOf(
    ['', ...RELATION_OPTIONS.map((o) => o.value)],
    'Pick one',
  ),
  relationName: Yup.string().max(100, 'Too long'),
  // Checked with the same Verhoeff digit the server checks, so a mistyped
  // number is caught at the field rather than after a round trip.
  aadhaarNumber: Yup.string().test('aadhaar', function (value) {
    const message = aadhaarError(value ?? '');
    return message ? this.createError({ message }) : true;
  }),
  addressLine1: Yup.string().max(200, 'Too long'),
  addressLine2: Yup.string().max(200, 'Too long'),
  city: Yup.string().max(100, 'Too long'),
  district: Yup.string().max(100, 'Too long'),
  state: Yup.string().max(100, 'Too long'),
  pincode: Yup.string().test('pincode', 'Enter a valid 6-digit PIN code', (v) => !v || /^[1-9]\d{5}$/.test(v)),
  emergencyContact: Yup.string().max(100, 'Too long'),
  emergencyPhone: Yup.string().test('phone', 'Enter a valid 10-digit mobile number', (v) => !v || /^\d{10}$/.test(v)),
  emergencyRelationship: Yup.string().max(50, 'Too long'),
  insuranceProvider: Yup.string().max(100, 'Too long'),
  insuranceNumber: Yup.string().max(60, 'Too long'),
};

/**
 * Form values as the API wants them: trimmed, phone prefixed, Aadhaar reduced
 * to its digits.
 *
 * Empty strings are kept rather than dropped, because on an edit "unset means
 * untouched" — sending `undefined` for a field the user just cleared would
 * silently refuse to clear it.
 */
export function patientProfilePayload(values: PatientProfileValues) {
  return {
    dateOfBirth: values.dateOfBirth,
    gender: values.gender,
    bloodGroup: values.bloodGroup,
    relationType: values.relationType,
    relationName: values.relationName.trim(),
    aadhaarNumber: aadhaarDigits(values.aadhaarNumber),
    addressLine1: values.addressLine1.trim(),
    addressLine2: values.addressLine2.trim(),
    city: values.city.trim(),
    district: values.district.trim(),
    state: values.state.trim(),
    pincode: values.pincode.trim(),
    country: values.country.trim() || 'India',
    emergencyContact: values.emergencyContact.trim(),
    emergencyPhone: withPrefix(values.emergencyPhone),
    emergencyRelationship: values.emergencyRelationship.trim(),
    insuranceProvider: values.insuranceProvider.trim(),
    insuranceNumber: values.insuranceNumber.trim(),
  };
}

/** The address on one line, for a detail card or a printed header.
 *  Empty when nothing was collected, so a caller can show "None" instead of a
 *  string of commas. */
export function formatPatientAddress(patient: Partial<Patient>): string {
  return [
    patient.addressLine1,
    patient.addressLine2,
    patient.city,
    patient.district && patient.district !== patient.city ? patient.district : '',
    patient.state,
    patient.pincode,
  ]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

// ---------------------------------------------------------------------------
// The fields themselves
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

/** Date of birth, gender, blood group and the Aadhaar number. */
export function PatientIdentityFields({ requireDateOfBirth = false }: { requireDateOfBirth?: boolean }) {
  return (
    <Section title="Personal">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          name="relationType"
          label="Relation"
          as="select"
          placeholder="Wife of / Daughter of / Son of…"
          options={RELATION_OPTIONS}
        />
        <FormField
          name="relationName"
          label="Relative's Name"
          placeholder="e.g. Ramesh Kumar"
        />
        <FormField
          name="dateOfBirth"
          label="Date of Birth"
          type="date"
          icon={Calendar}
          max={new Date().toISOString().split('T')[0]}
          required={requireDateOfBirth}
        />
        <FormField name="gender" label="Gender" as="select" placeholder="Select…" options={GENDER_OPTIONS} />
        <FormField
          name="bloodGroup"
          label="Blood Group"
          as="select"
          placeholder="Select…"
          options={BLOOD_GROUP_OPTIONS}
          icon={Droplet}
        />
        <FormField
          name="aadhaarNumber"
          label="Aadhaar Number"
          placeholder="1234 5678 9012"
          icon={Fingerprint}
        />
      </div>
      <p className="text-xs text-slate-400">
        Aadhaar is optional. It is used only to recognise a returning patient as the same
        person, so that one person does not end up with two records here.
      </p>
    </Section>
  );
}

/** Where the patient lives. Field names match the hospital address forms, so
 *  the shared AddressSearch fills them the same way. The search box writes the
 *  fields below; each stays editable for hand corrections and for when no
 *  Google Maps key is configured (AddressSearch renders nothing then). */
export function PatientAddressFields() {
  return (
    <Section title="Address">
      <div className="space-y-4">
        <AddressSearch />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField name="addressLine1" label="Address Line 1" placeholder="House, street" />
          <FormField name="addressLine2" label="Address Line 2" placeholder="Area, landmark" />
          <FormField name="city" label="City / Town" placeholder="e.g. Pune" />
          <FormField name="district" label="District" placeholder="e.g. Pune" />
          <FormField name="state" label="State" placeholder="e.g. Maharashtra" />
          <FormField name="pincode" label="PIN Code" placeholder="411001" />
        </div>
      </div>
    </Section>
  );
}

/** Next of kin and insurance. */
export function PatientCareFields() {
  return (
    <>
      <Section title="Emergency Contact">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField name="emergencyContact" label="Contact Name" placeholder="Full name" />
          <PhoneField name="emergencyPhone" label="Contact Phone" />
          <FormField
            name="emergencyRelationship"
            label="Relationship"
            placeholder="e.g. Spouse, Parent, Sibling"
          />
        </div>
      </Section>
      <Section title="Insurance">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField name="insuranceProvider" label="Provider" placeholder="e.g. Star Health" />
          <FormField name="insuranceNumber" label="Policy / Member ID" placeholder="Policy number" />
        </div>
      </Section>
    </>
  );
}

/** Every patient field, in the order all three forms show them. */
export function PatientProfileFields({ requireDateOfBirth = false }: { requireDateOfBirth?: boolean }) {
  return (
    <div className="space-y-6">
      <PatientIdentityFields requireDateOfBirth={requireDateOfBirth} />
      <PatientAddressFields />
      <PatientCareFields />
    </div>
  );
}

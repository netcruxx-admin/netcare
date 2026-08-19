'use client';

// The eight step bodies. Each is a plain component reading Formik state; the
// wizard shell owns navigation, validation and submission.

import { useEffect } from 'react';
import { useFormikContext } from 'formik';
import { Plus, Trash2, Upload, FileText, X, AlertTriangle } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { PhoneField } from '@/components/form/PhoneField';
import { HOSPITAL_CATEGORIES } from '@/lib/hospitalCategories';
import type { CatalogOption, OnboardingMeta } from '@/store/api';
import {
  CATEGORY_THEMES,
  type DepartmentRow,
  type LicenceRow,
  type PendingDocument,
  type WizardValues,
} from './config';
import {
  ChipMultiSelect,
  CheckboxField,
  ColourField,
  FieldGrid,
  NumberField,
  ReviewRow,
  SectionTitle,
} from './fields';

const asOptions = (items: CatalogOption[] = []) =>
  items.map((i) => ({ value: i.code, label: i.label }));

const stringOptions = (items: string[] = []) => items.map((i) => ({ value: i, label: i }));

interface StepProps {
  meta?: OnboardingMeta;
}

// --- 1. Identity -------------------------------------------------------------

export function IdentityStep({ meta }: StepProps) {
  const { values, setFieldValue } = useFormikContext<WizardValues>();

  const categories = meta?.categories?.length
    ? asOptions(meta.categories)
    : Object.values(HOSPITAL_CATEGORIES).map((c) => ({ value: c.id, label: c.label }));

  return (
    <div className="space-y-5">
      <FieldGrid>
        <FormField name="name" label="Hospital Name" placeholder="e.g. Sunrise Mother & Child" required autoFocus />
        <FormField
          name="subdomain"
          label="Subdomain"
          placeholder="e.g. sunrise"
          required
          onValueChange={(v) => setFieldValue('subdomain', v.toLowerCase())}
        />
      </FieldGrid>
      <p className="-mt-3 text-xs text-slate-400">
        Staff will sign in at{' '}
        <span className="font-mono text-slate-600">
          {values.subdomain || 'subdomain'}.carbonhealth.com
        </span>
        . This cannot be changed later.
      </p>

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
            // The category seeds modules, departments and branding on the
            // backend; matching the colours here keeps the preview honest.
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

// --- 2. Registration & Tax ---------------------------------------------------

export function RegistrationStep({ meta }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SectionTitle>Clinical Establishment Registration</SectionTitle>
        <FieldGrid cols={3}>
          <FormField name="registrationNo" label="Registration Number" placeholder="e.g. CEA/2021/00412" />
          <FormField
            name="registrationAuthority"
            label="Issuing Authority"
            placeholder="e.g. State Health Department"
          />
          <FormField name="registrationValidTill" label="Valid Till" type="date" />
        </FieldGrid>
      </div>

      <div className="space-y-4 border-t border-slate-100 pt-5">
        <SectionTitle>Tax</SectionTitle>
        <FieldGrid>
          <FormField name="pan" label="PAN" placeholder="ABCDE1234F" />
          <FormField name="gstin" label="GSTIN" placeholder="27ABCDE1234F1Z5" />
        </FieldGrid>
        <p className="text-xs text-slate-400">
          PAN of the registered entity, not of the owner. GSTIN drives the invoice format and the
          place of supply.
        </p>
      </div>

      <div className="space-y-4 border-t border-slate-100 pt-5">
        <SectionTitle>Registries & Accreditation</SectionTitle>
        <FieldGrid cols={3}>
          <FormField name="hfrId" label="ABDM Health Facility ID" placeholder="e.g. IN2910001234" />
          <FormField
            name="nabhStatus"
            label="NABH Status"
            as="select"
            options={asOptions(meta?.nabhStatuses)}
            placeholder="Select…"
          />
          <FormField name="nabhValidTill" label="Accredited Till" type="date" />
        </FieldGrid>
        <p className="text-xs text-slate-400">
          The HFR ID is what lets records link to a patient&apos;s ABHA. It can be added later.
        </p>
      </div>
    </div>
  );
}

// --- 3. Contact & Leadership -------------------------------------------------

export function ContactStep({ meta }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SectionTitle>Address</SectionTitle>
        <FieldGrid>
          <FormField name="addressLine1" label="Address Line 1" placeholder="Building, street" />
          <FormField name="addressLine2" label="Address Line 2" placeholder="Area, landmark" />
        </FieldGrid>
        <FieldGrid cols={4}>
          <FormField name="city" label="City" />
          <FormField name="district" label="District" />
          <FormField
            name="state"
            label="State"
            as="select"
            options={stringOptions(meta?.states)}
            placeholder="Select state…"
          />
          <FormField name="pincode" label="PIN Code" placeholder="560001" />
        </FieldGrid>
      </div>

      <div className="space-y-4 border-t border-slate-100 pt-5">
        <SectionTitle>Contact</SectionTitle>
        <FieldGrid cols={3}>
          <PhoneField name="phonePrimary" label="Reception Phone" />
          <PhoneField name="phoneEmergency" label="Emergency Phone" />
          <PhoneField name="phoneSecondary" label="Alternate Phone" />
        </FieldGrid>
        <FieldGrid>
          <FormField name="email" label="Hospital Email" type="email" placeholder="info@hospital.com" />
          <FormField name="website" label="Website" placeholder="https://hospital.com" />
        </FieldGrid>
      </div>

      <div className="space-y-4 border-t border-slate-100 pt-5">
        <SectionTitle>Owner</SectionTitle>
        <FieldGrid cols={3}>
          <FormField name="ownerName" label="Owner / Proprietor" />
          <PhoneField name="ownerPhone" label="Owner Phone" />
          <FormField name="ownerEmail" label="Owner Email" type="email" />
        </FieldGrid>
      </div>

      <div className="space-y-4 border-t border-slate-100 pt-5">
        <SectionTitle>Medical Director</SectionTitle>
        <FieldGrid>
          <FormField name="medicalDirectorName" label="Name" placeholder="e.g. Dr. Anita Rao" />
          <FormField name="medicalDirectorQualification" label="Qualification" placeholder="e.g. MBBS, MD" />
        </FieldGrid>
        <FieldGrid>
          <FormField name="medicalDirectorRegNo" label="Council Registration Number" placeholder="e.g. KMC/12345" />
          <FormField
            name="medicalDirectorCouncil"
            label="Medical Council"
            as="select"
            options={stringOptions(meta?.medicalCouncils)}
            placeholder="Select council…"
          />
        </FieldGrid>
        <p className="text-xs text-slate-400">
          The registered practitioner in charge. Their council number is printed on reports and is a
          statutory requirement.
        </p>
      </div>
    </div>
  );
}

// --- 4. Clinical Profile -----------------------------------------------------

export function ClinicalStep() {
  const { values } = useFormikContext<WizardValues>();
  const suggested =
    HOSPITAL_CATEGORIES[values.category as keyof typeof HOSPITAL_CATEGORIES]?.specializations ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SectionTitle>Capacity</SectionTitle>
        <FieldGrid cols={3}>
          <NumberField name="bedCount" label="Total Beds" placeholder="0" />
          <NumberField name="icuBeds" label="ICU Beds" placeholder="0" />
          <NumberField name="nicuBeds" label="NICU Beds" placeholder="0" />
        </FieldGrid>
        <FieldGrid cols={3}>
          <NumberField name="emergencyBeds" label="Emergency Beds" placeholder="0" />
          <NumberField name="operationTheatres" label="Operation Theatres" placeholder="0" />
          <NumberField name="ambulanceCount" label="Ambulances" placeholder="0" />
        </FieldGrid>
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-5">
        <SectionTitle>On-site Services</SectionTitle>
        <p className="text-xs text-slate-400">
          What the building has. Separate from the feature modules the hospital has purchased — a
          40-bed hospital that has not bought the IPD module is a normal state.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <CheckboxField name="hasPharmacy" label="Pharmacy" description="In-house dispensing" />
          <CheckboxField name="hasLab" label="Laboratory" description="On-site pathology" />
          <CheckboxField name="hasRadiology" label="Radiology" description="X-ray, USG, CT" />
          <CheckboxField name="hasBloodBank" label="Blood Bank" description="Storage or issue" />
          <CheckboxField name="hasEmergency" label="Emergency / Casualty" description="24×7 intake" />
          <CheckboxField name="hasAmbulance" label="Ambulance" description="Own fleet" />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <ChipMultiSelect name="specialties" label="Specialties Offered" options={suggested} />
      </div>
    </div>
  );
}

// --- 5. Licences -------------------------------------------------------------

const LICENCE_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
];

export function LicencesStep({ meta }: StepProps) {
  const { values, setFieldValue, errors, touched } = useFormikContext<WizardValues>();
  const types = meta?.licenceTypes ?? [];
  const rowErrors = (errors.licences ?? []) as Array<Partial<Record<keyof LicenceRow, string>>>;
  const rowTouched = (touched.licences ?? []) as Array<Partial<Record<keyof LicenceRow, boolean>>>;

  const addRow = (type = '') =>
    setFieldValue('licences', [
      ...values.licences,
      { type, number: '', issuingAuthority: '', issuedOn: '', expiresOn: '', status: 'active' },
    ]);

  const removeRow = (index: number) =>
    setFieldValue(
      'licences',
      values.licences.filter((_, i) => i !== index),
    );

  const update = (index: number, key: keyof LicenceRow, value: string) =>
    setFieldValue(
      'licences',
      values.licences.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );

  const used = new Set(values.licences.map((l) => l.type));
  const suggestions = types.filter((t) => t.code !== 'other' && !used.has(t.code));

  return (
    <div className="space-y-5">
      {suggestions.length > 0 && (
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
          <p className="text-xs font-medium text-slate-600 mb-2">
            Applicable to this category and plan — click to add:
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => addRow(t.code)}
                title={t.description}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-slate-200 text-xs text-slate-600 hover:border-cyan-400 hover:text-cyan-700 transition"
              >
                <Plus className="w-3 h-3" /> {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {values.licences.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-200 rounded-lg">
          <p className="text-sm text-slate-500">No licences recorded yet.</p>
          <p className="text-xs text-slate-400 mt-1">
            You can add these later — nothing here blocks onboarding.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {values.licences.map((row, index) => {
            const authority = types.find((t) => t.code === row.type)?.authority;
            return (
              <div key={index} className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Licence Type</label>
                      <select
                        value={row.type}
                        onChange={(e) => update(index, 'type', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-cyan-500"
                      >
                        <option value="">Select type…</option>
                        {types.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Licence Number
                      </label>
                      <input
                        value={row.number}
                        onChange={(e) => update(index, 'number', e.target.value)}
                        placeholder="e.g. KA/20B/9931"
                        className={`w-full px-3 py-2 border rounded text-sm focus:outline-none ${
                          rowTouched[index]?.number && rowErrors[index]?.number
                            ? 'border-red-400'
                            : 'border-slate-300 focus:border-cyan-500'
                        }`}
                      />
                      {rowErrors[index]?.number && (
                        <p className="text-red-500 text-xs mt-1">{rowErrors[index]?.number}</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    aria-label="Remove licence"
                    className="mt-6 p-1.5 text-slate-400 hover:text-red-500 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Issuing Authority
                    </label>
                    <input
                      value={row.issuingAuthority}
                      onChange={(e) => update(index, 'issuingAuthority', e.target.value)}
                      placeholder={authority || 'Authority'}
                      className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Issued On</label>
                    <input
                      type="date"
                      value={row.issuedOn}
                      onChange={(e) => update(index, 'issuedOn', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Expires On</label>
                    <input
                      type="date"
                      value={row.expiresOn}
                      onChange={(e) => update(index, 'expiresOn', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <select
                    value={row.status}
                    onChange={(e) => update(index, 'status', e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:border-cyan-500"
                  >
                    {LICENCE_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {row.expiresOn && new Date(row.expiresOn) < new Date() && (
                    <span className="flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle className="w-3.5 h-3.5" /> Already expired
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => addRow()}
        className="flex items-center gap-2 text-sm text-cyan-600 hover:text-cyan-700 font-medium"
      >
        <Plus className="w-4 h-4" /> Add a licence
      </button>
    </div>
  );
}

// --- 6. Documents ------------------------------------------------------------

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.tiff';

// --- 6. Departments ----------------------------------------------------------

export function DepartmentsStep({ meta }: StepProps) {
  const { values, setFieldValue, errors, touched } = useFormikContext<WizardValues>();
  const suggested = meta?.suggestedDepartments ?? [];

  // The suggestions arrive with the category's meta, so the rows are seeded the
  // first time this step is opened — and re-seeded if the category changed
  // underneath it. Anything the operator typed is preserved: their custom rows
  // are kept, and a suggestion they already ticked or unticked keeps that state.
  useEffect(() => {
    if (!suggested.length) return;
    const previous = new Map(
      values.departments.map((d) => [d.name.trim().toLowerCase(), d]),
    );
    const custom = values.departments.filter((d) => !d.fromTemplate);
    const seeded: DepartmentRow[] = suggested.map((s) => {
      const prior = previous.get(s.name.trim().toLowerCase());
      return {
        name: s.name,
        description: s.description,
        // Pre-ticked: the common case is "yes, these are right", and it should
        // cost one click rather than five.
        selected: prior ? prior.selected : true,
        fromTemplate: true,
      };
    });
    const next = [...seeded, ...custom];
    const unchanged =
      next.length === values.departments.length &&
      next.every((d, i) => {
        const cur = values.departments[i];
        return cur && cur.name === d.name && cur.selected === d.selected;
      });
    if (!unchanged) setFieldValue('departments', next);
    // values.departments is deliberately absent: including it would re-run on
    // every tick and fight the operator for control of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested, setFieldValue]);

  const update = (index: number, key: keyof DepartmentRow, value: string | boolean) =>
    setFieldValue(
      'departments',
      values.departments.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );

  const addCustom = () =>
    setFieldValue('departments', [
      ...values.departments,
      { name: '', description: '', selected: true, fromTemplate: false },
    ]);

  const removeRow = (index: number) =>
    setFieldValue(
      'departments',
      values.departments.filter((_, i) => i !== index),
    );

  const error = touched.departments && typeof errors.departments === 'string'
    ? errors.departments
    : '';
  const chosen = values.departments.filter((d) => d.selected && d.name.trim()).length;

  return (
    <div className="space-y-5">
      <SectionTitle>Departments</SectionTitle>
      <p className="text-sm text-slate-600 -mt-3">
        Suggested from the category you picked. Untick anything this hospital
        does not run — reception can book a patient into any department listed
        here, so one nobody staffs is worse than one that is missing.
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="space-y-2">
        {values.departments.map((row, index) => (
          <div
            key={`${row.fromTemplate ? 'tpl' : 'custom'}-${index}`}
            className="flex gap-3 items-start rounded-lg border border-slate-200 p-3"
          >
            <input
              type="checkbox"
              checked={row.selected}
              onChange={(e) => update(index, 'selected', e.target.checked)}
              className="mt-2 h-4 w-4 shrink-0 accent-cyan-600"
              aria-label={row.name || 'New department'}
            />
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={row.name}
                onChange={(e) => update(index, 'name', e.target.value)}
                placeholder="Department name"
                readOnly={row.fromTemplate}
                className={`px-3 py-2 border rounded-lg text-sm ${
                  row.fromTemplate
                    ? 'border-transparent bg-transparent font-medium text-slate-900'
                    : 'border-slate-300'
                }`}
              />
              <input
                value={row.description}
                onChange={(e) => update(index, 'description', e.target.value)}
                placeholder="What it covers (optional)"
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            {!row.fromTemplate && (
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="mt-1 p-2 text-slate-400 hover:text-red-600"
                aria-label="Remove department"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addCustom}
          className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-600 hover:text-cyan-700"
        >
          <Plus className="h-4 w-4" /> Add a department
        </button>
        <span className="text-xs text-slate-500">
          {chosen} selected
        </span>
      </div>

      <p className="text-xs text-slate-500">
        These can be changed later from the hospital&apos;s own dashboard — nothing here is permanent.
      </p>
    </div>
  );
}


// --- 7. Documents ------------------------------------------------------------

export function DocumentsStep({
  meta,
  documents,
  onAdd,
  onRemove,
  onChange,
}: StepProps & {
  documents: PendingDocument[];
  onAdd: (files: FileList) => void;
  onRemove: (key: string) => void;
  onChange: (key: string, patch: Partial<PendingDocument>) => void;
}) {
  const { values } = useFormikContext<WizardValues>();
  const docTypes = meta?.documentTypes ?? [];
  const licenceTypes = meta?.licenceTypes ?? [];
  // Only licences actually recorded on the previous step can be backed by a
  // scan here — offering the full catalog would invite attaching a document to
  // a licence that does not exist.
  const recorded = values.licences.filter((l) => l.type);

  return (
    <div className="space-y-4">
      <label className="block border-2 border-dashed border-slate-200 rounded-lg py-10 text-center cursor-pointer hover:border-cyan-400 transition">
        <input
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onAdd(e.target.files);
            // Reset so picking the same file twice still fires a change.
            e.target.value = '';
          }}
        />
        <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-600">Click to choose files</p>
        <p className="text-xs text-slate-400 mt-1">PDF or image, up to 10MB each</p>
      </label>

      {documents.length === 0 ? (
        <p className="text-xs text-slate-400 text-center">
          Nothing attached yet. Documents can also be uploaded after onboarding.
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const tooBig = doc.file.size > MAX_UPLOAD_BYTES;
            return (
              <div
                key={doc.key}
                className={`rounded-lg border p-3 space-y-3 ${
                  tooBig ? 'border-red-200 bg-red-50/40' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{doc.file.name}</p>
                    <p className={`text-xs ${tooBig ? 'text-red-500' : 'text-slate-400'}`}>
                      {(doc.file.size / 1024).toFixed(0)} KB
                      {tooBig && ' — too large, the server will reject this'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(doc.key)}
                    aria-label="Remove document"
                    className="p-1 text-slate-400 hover:text-red-500 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select
                    value={doc.docType}
                    onChange={(e) => onChange(doc.key, { docType: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-cyan-500"
                  >
                    {docTypes.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.label}
                      </option>
                    ))}
                  </select>

                  {doc.docType === 'licence' && (
                    <select
                      value={doc.licenceType}
                      onChange={(e) => onChange(doc.key, { licenceType: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">Which licence?</option>
                      {recorded.map((l) => (
                        <option key={l.type} value={l.type}>
                          {licenceTypes.find((t) => t.code === l.type)?.label ?? l.type}
                        </option>
                      ))}
                    </select>
                  )}

                  <input
                    value={doc.title}
                    onChange={(e) => onChange(doc.key, { title: e.target.value })}
                    placeholder="Label (optional)"
                    className="px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- 7. Operations & Plan ----------------------------------------------------

export function OperationsStep({ meta }: StepProps) {
  const { values } = useFormikContext<WizardValues>();
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SectionTitle>Numbering & Scheduling</SectionTitle>
        <FieldGrid cols={4}>
          <FormField name="invoicePrefix" label="Invoice Prefix" placeholder="INV" />
          <NumberField name="invoiceSeriesStart" label="Invoice Starts At" min={1} />
          <FormField name="mrnPrefix" label="MRN Prefix" placeholder="MRN" />
          <NumberField
            name="appointmentSlotMinutes"
            label="Slot Length"
            min={5}
            hint="Minutes"
          />
        </FieldGrid>
        <FieldGrid cols={3}>
          <FormField name="timezone" label="Timezone" placeholder="Asia/Kolkata" />
          <FormField
            name="financialYearStart"
            label="Financial Year Starts"
            placeholder="04-01"
          />
          <FormField name="currency" label="Currency" placeholder="INR" />
        </FieldGrid>
        <p className="text-xs text-slate-400">
          Patient numbers will look like{' '}
          <span className="font-mono text-slate-600">{values.mrnPrefix || 'MRN'}-000001</span> and
          invoices like{' '}
          <span className="font-mono text-slate-600">
            {values.invoicePrefix || 'INV'}-{String(values.invoiceSeriesStart || 1).padStart(5, '0')}
          </span>
          .
        </p>
      </div>

      <div className="space-y-4 border-t border-slate-100 pt-5">
        <SectionTitle>Subscription</SectionTitle>
        <FieldGrid cols={4}>
          <FormField
            name="plan"
            label="Plan"
            as="select"
            options={asOptions(meta?.subscriptionPlans)}
            placeholder="Select…"
          />
          <FormField
            name="subscriptionStatus"
            label="Status"
            as="select"
            options={[
              { value: 'trial', label: 'Trial' },
              { value: 'active', label: 'Active' },
              { value: 'past_due', label: 'Past Due' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
          <FormField
            name="billingCycle"
            label="Billing Cycle"
            as="select"
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'quarterly', label: 'Quarterly' },
              { value: 'annual', label: 'Annual' },
            ]}
          />
          <NumberField name="price" label="Price" placeholder="0" hint={`per ${values.billingCycle}`} />
        </FieldGrid>
        <FieldGrid cols={4}>
          <FormField name="trialEndsOn" label="Trial Ends" type="date" />
          <NumberField name="maxUsers" label="Max Users" placeholder="0" hint="0 = unlimited" />
          <NumberField name="maxDoctors" label="Max Doctors" placeholder="0" hint="0 = unlimited" />
          <NumberField name="maxBeds" label="Max Beds" placeholder="0" hint="0 = unlimited" />
        </FieldGrid>
      </div>

      <div className="space-y-4 border-t border-slate-100 pt-5">
        <SectionTitle>Billing Contact</SectionTitle>
        <FieldGrid cols={3}>
          <FormField name="billingContactName" label="Name" />
          <FormField name="billingContactEmail" label="Email" type="email" />
          <PhoneField name="billingContactPhone" label="Phone" />
        </FieldGrid>
        <FieldGrid>
          <FormField name="billingGstin" label="Billing GSTIN" placeholder="If different from above" />
          <FormField name="billingAddress" label="Billing Address" as="textarea" rows={2} />
        </FieldGrid>
      </div>
    </div>
  );
}

// --- 8. Admin & Review -------------------------------------------------------

export function AdminReviewStep({
  meta,
  documents,
}: StepProps & { documents: PendingDocument[] }) {
  const { values } = useFormikContext<WizardValues>();
  const label = (items: CatalogOption[] = [], code: string) =>
    items.find((i) => i.code === code)?.label ?? code;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SectionTitle>First Admin Account</SectionTitle>
        <p className="text-xs text-slate-400 -mt-2">
          This account can sign in the moment the hospital is created and add the rest of the staff.
        </p>
        <FieldGrid>
          <FormField name="adminName" label="Admin Name" placeholder="e.g. Dr. Raj Kumar" required />
          <FormField name="adminEmail" label="Admin Email" type="email" placeholder="admin@hospital.com" required />
        </FieldGrid>
        <FieldGrid>
          <FormField name="adminPassword" label="Temporary Password" type="password" required />
          <PhoneField name="adminPhone" label="Admin Phone" />
        </FieldGrid>
      </div>

      <div className="space-y-4 border-t border-slate-100 pt-5">
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
            <ReviewRow label="Category" value={label(meta?.categories, values.category)} />
            <ReviewRow label="Entity" value={label(meta?.entityTypes, values.entityType)} />

            <p className="text-xs font-semibold text-slate-400 mt-4 mb-1">Registration</p>
            <ReviewRow label="Registration no." value={values.registrationNo} />
            <ReviewRow label="PAN" value={values.pan} />
            <ReviewRow label="GSTIN" value={values.gstin} />
            <ReviewRow label="HFR ID" value={values.hfrId} />
            <ReviewRow label="NABH" value={label(meta?.nabhStatuses, values.nabhStatus)} />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1">Facility</p>
            <ReviewRow
              label="Location"
              value={[values.city, values.state].filter(Boolean).join(', ')}
            />
            <ReviewRow label="Type" value={label(meta?.facilityTypes, values.facilityType)} />
            <ReviewRow label="Beds" value={values.bedCount} />
            <ReviewRow label="Medical director" value={values.medicalDirectorName} />
            <ReviewRow label="Specialties" value={values.specialties.length || ''} />

            <p className="text-xs font-semibold text-slate-400 mt-4 mb-1">Records</p>
            <ReviewRow
              label="Licences"
              value={values.licences.filter((l) => l.type && l.number).length}
            />
            <ReviewRow label="Documents" value={documents.length} />
            <ReviewRow label="Plan" value={label(meta?.subscriptionPlans, values.plan)} />
            <ReviewRow label="Admin" value={values.adminEmail} />
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Hospital configuration — the SINGLE source of truth for everything that would
// differ from one hospital to another.
//
// This is now a REGISTRY: many hospitals keyed by id (HOSPITAL_REGISTRY), plus
// runtime-created ones persisted in localStorage. The *active* tenant is chosen
// by lib/tenant.ts (subdomain / switcher); read it via getActiveHospitalConfig()
// — never hardcode a single config in components/pages.
//
// Nothing hospital-specific (name, branding, departments, catalog, which modules
// are enabled) should be hardcoded inside components or pages — it lives here.
// -----------------------------------------------------------------------------

import {
  getCurrentHospitalId,
  registerTenantSubdomains,
} from './tenant';
import { CUSTOM_HOSPITALS_KEY, DEFAULT_HOSPITAL_ID } from './constants';
import type { HospitalConfig } from './types';

// Re-export the hospital config types (definitions live in ./types).
export type { HospitalConfig, HospitalModules } from './types';

const MATERNITY_HOSPITAL: HospitalConfig = {
  id: 'hosp-1',
  subdomain: 'medicare',
  name: 'MediCare Maternity',
  tagline: 'Maternity & Newborn Care',
  type: 'maternity',
  currency: 'INR',
  theme: {
    primary: '#0891b2', // cyan-600
    primaryDark: '#0d9488', // teal-600
  },
  modules: {
    lab: true,
    pharmacy: true,
    nursing: true,
    payments: true,
    medicalRecords: true,
    telemedicine: false,
    anc: true,
  },

  specializations: [
    'Obstetrics & Gynecology',
    'Neonatology',
    'Maternal Wellness',
    'Pediatric Care',
  ],

  departments: [
    { id: 'dept-1', name: 'Obstetrics & Gynecology', description: 'Pregnancy, childbirth, and postpartum care' },
    { id: 'dept-2', name: 'Neonatology', description: 'Newborn and infant care' },
    { id: 'dept-3', name: 'Maternal Wellness', description: 'Pre-conception and maternal health' },
    { id: 'dept-4', name: 'Labor & Delivery', description: 'Active labor and delivery services' },
    { id: 'dept-5', name: 'Pediatric Care', description: 'Child health and development' },
  ],

  medicines: [
    { id: 'med-c1', name: 'Prenatal Multivitamin', category: 'Prenatal', form: 'Tablet', strength: '1 tablet', price: 250, stock: 120 },
    { id: 'med-c2', name: 'Folic Acid', category: 'Supplement', form: 'Tablet', strength: '400 mcg', price: 80, stock: 300 },
    { id: 'med-c3', name: 'Ferrous Sulfate (Iron)', category: 'Supplement', form: 'Tablet', strength: '300 mg', price: 120, stock: 200 },
    { id: 'med-c4', name: 'Paracetamol', category: 'Analgesic', form: 'Tablet', strength: '500 mg', price: 30, stock: 500 },
    { id: 'med-c5', name: 'Amoxicillin', category: 'Antibiotic', form: 'Capsule', strength: '500 mg', price: 150, stock: 90 },
    { id: 'med-c6', name: 'Calcium + Vitamin D3', category: 'Supplement', form: 'Tablet', strength: '500 mg', price: 180, stock: 150 },
    { id: 'med-c7', name: 'Ondansetron', category: 'Antiemetic', form: 'Tablet', strength: '4 mg', price: 90, stock: 60 },
    { id: 'med-c8', name: 'Antacid Suspension', category: 'Antacid', form: 'Syrup', strength: '170 ml', price: 110, stock: 40 },
    { id: 'med-c9', name: 'Vitamin D3 (Cholecalciferol)', category: 'Vitamin', form: 'Capsule', strength: '60000 IU', price: 60, stock: 80 },
    { id: 'med-c10', name: 'Vitamin B12 (Methylcobalamin)', category: 'Vitamin', form: 'Tablet', strength: '1500 mcg', price: 95, stock: 110 },
    { id: 'med-c11', name: 'Doxylamine + Vitamin B6', category: 'Antiemetic', form: 'Tablet', strength: '10/10 mg', price: 140, stock: 70 },
    { id: 'med-c12', name: 'Metronidazole', category: 'Antibiotic', form: 'Tablet', strength: '400 mg', price: 60, stock: 130 },
    { id: 'med-c13', name: 'Azithromycin', category: 'Antibiotic', form: 'Tablet', strength: '500 mg', price: 130, stock: 85 },
    { id: 'med-c14', name: 'Ibuprofen', category: 'Analgesic', form: 'Tablet', strength: '400 mg', price: 40, stock: 260 },
    { id: 'med-c15', name: 'Pantoprazole', category: 'Antacid', form: 'Tablet', strength: '40 mg', price: 70, stock: 150 },
    { id: 'med-c16', name: 'Lactulose Solution', category: 'Other', form: 'Syrup', strength: '200 ml', price: 190, stock: 45 },
    { id: 'med-c17', name: 'Clotrimazole Cream', category: 'Other', form: 'Ointment', strength: '1% w/w', price: 85, stock: 55 },
    { id: 'med-c18', name: 'Omega-3 Fish Oil', category: 'Supplement', form: 'Capsule', strength: '1000 mg', price: 320, stock: 90 },
    { id: 'med-c19', name: 'Prenatal DHA', category: 'Prenatal', form: 'Capsule', strength: '200 mg', price: 280, stock: 65 },
    { id: 'med-c20', name: 'Paracetamol Syrup', category: 'Analgesic', form: 'Syrup', strength: '100 ml', price: 55, stock: 140 },
    { id: 'med-c21', name: 'Tetanus Toxoid (TT)', category: 'Other', form: 'Injection', strength: '0.5 ml', price: 50, stock: 100 },
    { id: 'med-c22', name: 'Oxytocin', category: 'Other', form: 'Injection', strength: '10 IU', price: 60, stock: 40 },
    { id: 'med-c23', name: 'Magnesium Supplement', category: 'Supplement', form: 'Tablet', strength: '250 mg', price: 160, stock: 0 },
    { id: 'med-c24', name: 'Cetirizine', category: 'Other', form: 'Tablet', strength: '10 mg', price: 35, stock: 220 },
  ],

  labTests: [
    { id: 'test-1', name: 'Complete Blood Count (CBC)', category: 'Blood Test', sampleType: 'Blood', price: 400, turnaroundTime: 'Same day', parameters: [
      { name: 'Hemoglobin', unit: 'g/dL', referenceRange: '12.0 – 15.5', low: 12, high: 15.5 },
      { name: 'WBC Count', unit: '/µL', referenceRange: '4000 – 11000', low: 4000, high: 11000 },
      { name: 'Platelet Count', unit: '/µL', referenceRange: '150000 – 410000', low: 150000, high: 410000 },
      { name: 'Hematocrit', unit: '%', referenceRange: '36 – 46', low: 36, high: 46 },
    ] },
    { id: 'test-2', name: 'Blood Glucose (Fasting)', category: 'Blood Test', sampleType: 'Blood', price: 150, turnaroundTime: 'Same day', parameters: [
      { name: 'Fasting Blood Sugar', unit: 'mg/dL', referenceRange: '70 – 100', low: 70, high: 100 },
    ] },
    { id: 'test-3', name: 'Obstetric Ultrasound', category: 'Imaging', sampleType: 'Imaging', price: 1500, turnaroundTime: '30 minutes' },
    { id: 'test-4', name: 'Urine Routine', category: 'Urine Test', sampleType: 'Urine', price: 200, turnaroundTime: 'Same day' },
    { id: 'test-5', name: 'Thyroid Profile (TSH)', category: 'Blood Test', sampleType: 'Blood', price: 600, turnaroundTime: '24 hours', parameters: [
      { name: 'TSH', unit: 'µIU/mL', referenceRange: '0.4 – 4.0', low: 0.4, high: 4.0 },
      { name: 'Free T4', unit: 'ng/dL', referenceRange: '0.8 – 1.8', low: 0.8, high: 1.8 },
    ] },
    { id: 'test-6', name: 'Double Marker Test', category: 'Prenatal Screening', sampleType: 'Blood', price: 2500, turnaroundTime: '3-5 days' },
    { id: 'test-7', name: 'Group B Strep Swab', category: 'Prenatal Screening', sampleType: 'Swab', price: 800, turnaroundTime: '48 hours' },
    { id: 'test-8', name: 'ECG', category: 'Cardiac', sampleType: 'None', price: 300, turnaroundTime: 'Same day' },
    { id: 'test-9', name: 'Hemoglobin (Hb)', category: 'Blood Test', sampleType: 'Blood', price: 120, turnaroundTime: 'Same day', parameters: [
      { name: 'Hemoglobin', unit: 'g/dL', referenceRange: '12.0 – 15.5', low: 12, high: 15.5 },
    ] },
    { id: 'test-10', name: 'Blood Group & Rh Typing', category: 'Blood Test', sampleType: 'Blood', price: 200, turnaroundTime: 'Same day' },
    { id: 'test-11', name: 'HbA1c', category: 'Blood Test', sampleType: 'Blood', price: 550, turnaroundTime: '24 hours' },
    { id: 'test-12', name: 'Lipid Profile', category: 'Blood Test', sampleType: 'Blood', price: 700, turnaroundTime: '24 hours', parameters: [
      { name: 'Total Cholesterol', unit: 'mg/dL', referenceRange: '< 200', high: 200 },
      { name: 'HDL Cholesterol', unit: 'mg/dL', referenceRange: '> 40', low: 40 },
      { name: 'LDL Cholesterol', unit: 'mg/dL', referenceRange: '< 100', high: 100 },
      { name: 'Triglycerides', unit: 'mg/dL', referenceRange: '< 150', high: 150 },
    ] },
    { id: 'test-13', name: 'Liver Function Test (LFT)', category: 'Blood Test', sampleType: 'Blood', price: 750, turnaroundTime: '24 hours' },
    { id: 'test-14', name: 'Kidney Function Test (KFT)', category: 'Blood Test', sampleType: 'Blood', price: 750, turnaroundTime: '24 hours' },
    { id: 'test-15', name: 'Vitamin D (25-OH)', category: 'Blood Test', sampleType: 'Blood', price: 1200, turnaroundTime: '3-5 days' },
    { id: 'test-16', name: 'Anomaly Scan (Level II)', category: 'Imaging', sampleType: 'Imaging', price: 2500, turnaroundTime: '45 minutes' },
    { id: 'test-17', name: 'NT Scan (Nuchal Translucency)', category: 'Imaging', sampleType: 'Imaging', price: 2000, turnaroundTime: '45 minutes' },
    { id: 'test-18', name: 'Quadruple Marker Test', category: 'Prenatal Screening', sampleType: 'Blood', price: 3200, turnaroundTime: '3-5 days' },
    { id: 'test-19', name: 'NIPT (Non-Invasive Prenatal Test)', category: 'Prenatal Screening', sampleType: 'Blood', price: 12000, turnaroundTime: '7-10 days' },
    { id: 'test-20', name: 'Oral Glucose Tolerance Test (OGTT)', category: 'Blood Test', sampleType: 'Blood', price: 500, turnaroundTime: 'Same day' },
    { id: 'test-21', name: 'Urine Culture', category: 'Urine Test', sampleType: 'Urine', price: 450, turnaroundTime: '48 hours' },
    { id: 'test-22', name: 'Pap Smear', category: 'Prenatal Screening', sampleType: 'Swab', price: 600, turnaroundTime: '3-5 days' },
    { id: 'test-23', name: '2D Echocardiography', category: 'Cardiac', sampleType: 'Imaging', price: 1800, turnaroundTime: 'Same day' },
    { id: 'test-24', name: 'HIV / Hepatitis B / VDRL Panel', category: 'Blood Test', sampleType: 'Blood', price: 900, turnaroundTime: '24 hours' },
  ],
};

// A second, hand-written tenant — a dental clinic. Demonstrates that one
// codebase serves distinct verticals: different branding, modules (lab/nursing
// off), specializations, and a dentistry-specific catalog.
const DENTAL_HOSPITAL: HospitalConfig = {
  id: 'hosp-2',
  subdomain: 'sunrise',
  name: 'Sunrise Dental',
  tagline: 'Dental & Oral Care',
  type: 'dental',
  currency: 'INR',
  theme: {
    primary: '#7c3aed', // violet-600
    primaryDark: '#4f46e5', // indigo-600
  },
  modules: {
    lab: false,
    pharmacy: true,
    nursing: false,
    payments: true,
    medicalRecords: true,
    telemedicine: true,
    anc: false,
  },
  specializations: [
    'General Dentistry',
    'Orthodontics',
    'Endodontics',
    'Periodontics',
    'Oral Surgery',
  ],
  departments: [
    { id: 'dept-1', name: 'General Dentistry', description: 'Routine dental care and checkups' },
    { id: 'dept-2', name: 'Orthodontics', description: 'Braces and teeth alignment' },
    { id: 'dept-3', name: 'Endodontics', description: 'Root canal and pulp treatment' },
    { id: 'dept-4', name: 'Oral Surgery', description: 'Extractions and surgical procedures' },
  ],
  medicines: [
    { id: 'med-d1', name: 'Amoxicillin', category: 'Antibiotic', form: 'Capsule', strength: '500 mg', price: 150, stock: 120 },
    { id: 'med-d2', name: 'Metronidazole', category: 'Antibiotic', form: 'Tablet', strength: '400 mg', price: 60, stock: 100 },
    { id: 'med-d3', name: 'Ibuprofen', category: 'Analgesic', form: 'Tablet', strength: '400 mg', price: 40, stock: 260 },
    { id: 'med-d4', name: 'Paracetamol', category: 'Analgesic', form: 'Tablet', strength: '500 mg', price: 30, stock: 500 },
    { id: 'med-d5', name: 'Chlorhexidine Mouthwash', category: 'Other', form: 'Syrup', strength: '0.2% 300 ml', price: 180, stock: 80 },
    { id: 'med-d6', name: 'Lignocaine (Local Anaesthetic)', category: 'Other', form: 'Injection', strength: '2% 30 ml', price: 120, stock: 60 },
    { id: 'med-d7', name: 'Diclofenac', category: 'Analgesic', form: 'Tablet', strength: '50 mg', price: 45, stock: 140 },
    { id: 'med-d8', name: 'Clove Oil (Eugenol)', category: 'Other', form: 'Ointment', strength: '15 ml', price: 90, stock: 40 },
    { id: 'med-d9', name: 'Fluoride Gel', category: 'Other', form: 'Ointment', strength: '1.23%', price: 210, stock: 55 },
    { id: 'med-d10', name: 'Ketorolac', category: 'Analgesic', form: 'Tablet', strength: '10 mg', price: 70, stock: 90 },
  ],
  // Dental clinics run imaging (not a pathology lab); the `lab` module is off,
  // but the catalog seeds a small imaging list for treatment planning.
  labTests: [
    { id: 'test-d1', name: 'Intraoral Periapical X-ray (IOPA)', category: 'Imaging', sampleType: 'Imaging', price: 200, turnaroundTime: 'Same day' },
    { id: 'test-d2', name: 'Orthopantomogram (OPG)', category: 'Imaging', sampleType: 'Imaging', price: 600, turnaroundTime: 'Same day' },
    { id: 'test-d3', name: 'Cone Beam CT (CBCT)', category: 'Imaging', sampleType: 'Imaging', price: 2500, turnaroundTime: '30 minutes' },
    { id: 'test-d4', name: 'Cephalometric X-ray', category: 'Imaging', sampleType: 'Imaging', price: 700, turnaroundTime: 'Same day' },
  ],
};

// -- Tenant registry ----------------------------------------------------------
// Built-in tenants. Runtime-created hospitals (from the platform onboarding
// page) are merged on top of these from localStorage.
export const HOSPITAL_REGISTRY: Record<string, HospitalConfig> = {
  [MATERNITY_HOSPITAL.id]: MATERNITY_HOSPITAL,
  [DENTAL_HOSPITAL.id]: DENTAL_HOSPITAL,
};

/** Runtime-created tenants persisted in localStorage (platform onboarding). */
export function getCustomHospitals(): HospitalConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_HOSPITALS_KEY);
    return raw ? (JSON.parse(raw) as HospitalConfig[]) : [];
  } catch {
    return [];
  }
}

/** Persist a new/updated runtime tenant. Returns the full custom list. */
export function saveCustomHospital(cfg: HospitalConfig): HospitalConfig[] {
  const existing = getCustomHospitals().filter((h) => h.id !== cfg.id);
  const next = [...existing, cfg];
  if (typeof window !== 'undefined') {
    localStorage.setItem(CUSTOM_HOSPITALS_KEY, JSON.stringify(next));
  }
  return next;
}

/** All tenants: built-in registry plus any runtime-created ones. */
export function getAllHospitals(): HospitalConfig[] {
  const custom = getCustomHospitals();
  const merged: Record<string, HospitalConfig> = { ...HOSPITAL_REGISTRY };
  for (const c of custom) merged[c.id] = c;
  return Object.values(merged);
}

/** Look up a tenant config by id (built-in or custom), falling back to default. */
export function getHospitalConfig(id: string): HospitalConfig {
  const custom = getCustomHospitals().find((h) => h.id === id);
  return custom ?? HOSPITAL_REGISTRY[id] ?? HOSPITAL_REGISTRY[DEFAULT_HOSPITAL_ID];
}

/** The config for the currently-active tenant (resolved via lib/tenant.ts). */
export function getActiveHospitalConfig(): HospitalConfig {
  return getHospitalConfig(getCurrentHospitalId());
}

// Wire the built-in subdomains into the resolver so sunrise.localhost → hosp-2.
registerTenantSubdomains(
  Object.fromEntries(
    Object.values(HOSPITAL_REGISTRY).map((h) => [h.subdomain, h.id]),
  ),
);


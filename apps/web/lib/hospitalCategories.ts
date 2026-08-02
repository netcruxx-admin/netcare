// -----------------------------------------------------------------------------
// Hospital categories (vertical templates)
//
// A hospital picks a CATEGORY (maternity, dental, eye…). The category decides
// which feature-modules are switched on, the suggested departments /
// specializations, and the "signature" features that make that vertical
// distinct. This is how one codebase serves many kinds of hospitals without
// becoming an infinitely-configurable monster — each category is a curated
// template.
//
// This file is the template CATALOG only — code-owned reference data, like the
// permission catalog on the backend. Which category a hospital actually is, and
// which modules it actually has, live on the Hospital record and arrive from
// `GET /hospitals/current`. Nothing here is per-browser state.
// -----------------------------------------------------------------------------

import {
  Baby,
  Building2,
  Eye,
  Stethoscope,
  TestTube,
} from 'lucide-react';

import type { HospitalCategory, HospitalCategoryId, HospitalModules } from './types';

// Re-export the category types (definitions live in ./types).
export type { CategoryFeature, HospitalCategory, HospitalCategoryId } from './types';

const ALL_ON: HospitalModules = {
  lab: true,
  pharmacy: true,
  nursing: true,
  payments: true,
  medicalRecords: true,
  telemedicine: true,
  anc: false,
};

export const HOSPITAL_CATEGORIES: Record<HospitalCategoryId, HospitalCategory> = {
  maternity: {
    id: 'maternity',
    label: 'Maternity & Newborn',
    tagline: 'Maternity & Newborn Care',
    icon: Baby,
    description:
      'Pregnancy, childbirth and newborn care. Antenatal tracking, high-risk flags and immunisation schedules.',
    modules: { ...ALL_ON, anc: true },
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
    signatureFeatures: [
      { label: 'ANC / Pregnancy Tracker', description: 'EDD, trimester timeline, weight/BP charts, visit checklist.', built: false },
      { label: 'High-Risk Pregnancy Flags', description: 'Auto-alerts from vitals (BP, low Hb, gestational diabetes).', built: false },
      { label: 'Immunisation Schedule', description: 'TT for mother, newborn IAP vaccination reminders.', built: false },
    ],
  },

  'multi-specialty': {
    id: 'multi-specialty',
    label: 'Multi-Specialty',
    tagline: 'Comprehensive Healthcare',
    icon: Building2,
    description:
      'A general hospital spanning many departments, with inpatient (IPD) care, OPD queues and telemedicine.',
    modules: { ...ALL_ON, telemedicine: true },
    specializations: [
      'General Medicine',
      'Cardiology',
      'Orthopedics',
      'Pediatrics',
      'Dermatology',
      'ENT',
    ],
    departments: [
      { id: 'dept-1', name: 'General Medicine', description: 'Primary and internal medicine' },
      { id: 'dept-2', name: 'Cardiology', description: 'Heart and vascular care' },
      { id: 'dept-3', name: 'Orthopedics', description: 'Bones, joints and musculoskeletal care' },
      { id: 'dept-4', name: 'Pediatrics', description: 'Child health and development' },
      { id: 'dept-5', name: 'Emergency', description: 'Casualty and emergency services' },
    ],
    signatureFeatures: [
      { label: 'IPD / Bed Management', description: 'Admissions, ward/bed allocation, discharge summaries.', built: false },
      { label: 'OPD Queue & Tokens', description: 'Live token queue with wait-time estimates.', built: false },
      { label: 'Telemedicine', description: 'Video consultations with in-call notes and prescriptions.', built: true },
    ],
  },

  dental: {
    id: 'dental',
    label: 'Dental Clinic',
    tagline: 'Dental & Oral Care',
    icon: Stethoscope,
    description:
      'Dentistry and oral surgery. Tooth charting, treatment plans and procedure-based billing.',
    modules: { ...ALL_ON, lab: false, nursing: false, anc: false },
    specializations: ['General Dentistry', 'Orthodontics', 'Endodontics', 'Periodontics', 'Oral Surgery'],
    departments: [
      { id: 'dept-1', name: 'General Dentistry', description: 'Routine dental care and checkups' },
      { id: 'dept-2', name: 'Orthodontics', description: 'Braces and teeth alignment' },
      { id: 'dept-3', name: 'Oral Surgery', description: 'Extractions and surgical procedures' },
    ],
    signatureFeatures: [
      { label: 'Dental Chart (Odontogram)', description: 'Per-tooth condition and treatment charting.', built: false },
      { label: 'Treatment Plans', description: 'Multi-visit plans with cost estimates and progress.', built: false },
      { label: 'Procedure Catalog', description: 'Procedure-based pricing (fillings, root canals, implants).', built: false },
    ],
  },

  eye: {
    id: 'eye',
    label: 'Eye Hospital',
    tagline: 'Ophthalmology & Vision Care',
    icon: Eye,
    description:
      'Ophthalmology and optometry. Vision testing, refraction records and an integrated optical shop.',
    modules: { ...ALL_ON, lab: false, nursing: false, anc: false },
    specializations: ['Ophthalmology', 'Optometry', 'Retina', 'Glaucoma', 'Cornea'],
    departments: [
      { id: 'dept-1', name: 'General Ophthalmology', description: 'Comprehensive eye examinations' },
      { id: 'dept-2', name: 'Optometry', description: 'Vision testing and corrective lenses' },
      { id: 'dept-3', name: 'Retina Clinic', description: 'Retinal and vitreous care' },
    ],
    signatureFeatures: [
      { label: 'Vision & Refraction Tests', description: 'Visual acuity, refraction and prescription records.', built: false },
      { label: 'Optical Shop', description: 'Frames/lenses inventory and order management.', built: false },
      { label: 'Surgery Scheduling', description: 'Cataract/LASIK OT scheduling and pre-op checklists.', built: false },
    ],
  },

  diagnostic: {
    id: 'diagnostic',
    label: 'Diagnostic Center',
    tagline: 'Diagnostics & Pathology',
    icon: TestTube,
    description:
      'Pathology and radiology labs. Test packages, home sample collection and fast report delivery.',
    modules: { ...ALL_ON, pharmacy: false, nursing: false, telemedicine: false, anc: false },
    specializations: ['Pathology', 'Radiology', 'Microbiology', 'Biochemistry'],
    departments: [
      { id: 'dept-1', name: 'Pathology', description: 'Blood, urine and tissue analysis' },
      { id: 'dept-2', name: 'Radiology', description: 'X-ray, ultrasound, CT and MRI imaging' },
      { id: 'dept-3', name: 'Sample Collection', description: 'Walk-in and home sample collection' },
    ],
    signatureFeatures: [
      { label: 'Home Sample Collection', description: 'Schedule phlebotomist visits and track samples.', built: false },
      { label: 'Test Packages', description: 'Bundled health-checkup packages with discounts.', built: false },
      { label: 'Report Delivery', description: 'Digital report delivery with abnormal-value flags.', built: false },
    ],
  },
};

export const CATEGORY_LIST: HospitalCategory[] = Object.values(HOSPITAL_CATEGORIES);

/** The template for a category code, or undefined for one this build doesn't
 *  know. The hospital's *actual* category and modules come from the API
 *  (`GET /hospitals/current`); this catalog only describes what each category
 *  suggests, for the setup screen's preview. */
export function getCategoryTemplate(
  id: string | undefined,
): HospitalCategory | undefined {
  return id && id in HOSPITAL_CATEGORIES
    ? HOSPITAL_CATEGORIES[id as HospitalCategoryId]
    : undefined;
}

// Mock database with localStorage persistence
// This simulates a full backend database
//
// Seed policy: the database is seeded with the demo login accounts + doctor
// profiles needed to actually use the prototype, and the hospital catalog
// (departments / medicines / lab tests) which comes from lib/hospitalConfig.ts.
// It deliberately contains NO sample patients, appointments, records, vitals,
// prescriptions, payments or lab orders — those start empty and are created
// through the app.

import { getAllHospitals, getHospitalConfig } from './hospitalConfig';
import { getCurrentHospitalId } from './tenant';
import { IAP_SCHEDULE, addDays as babyAddDays } from './baby';
import { DB_KEY, DB_VERSION, DB_VERSION_KEY } from './constants';
import type {
  ANCVisit,
  Appointment,
  Baby,
  Department,
  Doctor,
  GrowthMeasurement,
  Immunization,
  LabTest,
  MedicalRecord,
  Medicine,
  Patient,
  Payment,
  PregnancyRecord,
  Prescription,
  ScheduleBlock,
  TestOrder,
  TestResult,
  TimeSlot,
  User,
  Vitals,
  VideoSlot,
} from './types';

// Re-export the tenant seam so existing importers of `db` keep working.
export { getCurrentHospitalId } from './tenant';

// Re-export the domain record types so `import { X } from '@/lib/db'` still
// resolves (definitions now live in ./types).
export type {
  ANCVisit,
  Appointment,
  Baby,
  BlockType,
  Department,
  Doctor,
  GrowthMeasurement,
  Immunization,
  LabTest,
  MedicalRecord,
  Medicine,
  Patient,
  Payment,
  PregnancyRecord,
  Prescription,
  ScheduleBlock,
  TestOrder,
  TestOrderItem,
  TestOrderStatus,
  TestParameterTemplate,
  TestResult,
  TestResultParameter,
  TimeSlot,
  User,
  Vitals,
  VideoSlot,
} from './types';

// -- Multi-tenant scoping -----------------------------------------------------
// Every record carries a `hospitalId`. The active tenant is resolved at runtime
// by lib/tenant.ts (subdomain / in-app switcher), NOT baked into a single
// config. All reads below go through the scoping helpers so a hospital can only
// ever see its own rows — even when ids collide across tenants (e.g. every
// tenant's department catalog starts at dept-1).

// Stamps the current hospital onto a record if it isn't already tagged. Called
// on every write so callers (pages) never have to think about tenancy.
function withTenant<T extends { hospitalId?: string }>(row: T): T {
  if (!row.hospitalId) row.hospitalId = getCurrentHospitalId();
  return row;
}

// Narrows a collection to the current hospital's rows. Used by the list reads.
function scoped<T extends { hospitalId?: string }>(rows: T[]): T[] {
  const hid = getCurrentHospitalId();
  return rows.filter((r) => r.hospitalId === hid);
}

// Tenant-scoped single-row lookup: like Array.find, but only matches rows
// belonging to the current hospital (so a colliding id from another tenant is
// never returned).
function findOne<T extends { hospitalId?: string }>(
  rows: T[],
  pred: (r: T) => boolean,
): T | undefined {
  const hid = getCurrentHospitalId();
  return rows.find((r) => r.hospitalId === hid && pred(r));
}

// Tenant-scoped filter: like Array.filter, restricted to the current hospital.
function where<T extends { hospitalId?: string }>(
  rows: T[],
  pred: (r: T) => boolean,
): T[] {
  const hid = getCurrentHospitalId();
  return rows.filter((r) => r.hospitalId === hid && pred(r));
}

// Tenant-scoped index lookup, for in-place splice/mutation on the real array.
function findIndexScoped<T extends { hospitalId?: string }>(
  rows: T[],
  pred: (r: T) => boolean,
): number {
  const hid = getCurrentHospitalId();
  return rows.findIndex((r) => r.hospitalId === hid && pred(r));
}

// In-memory database
const db = {
  users: [] as User[],
  patients: [] as Patient[],
  doctors: [] as Doctor[],
  appointments: [] as Appointment[],
  departments: [] as Department[],
  medicalRecords: [] as MedicalRecord[],
  payments: [] as Payment[],
  prescriptions: [] as Prescription[],
  vitals: [] as Vitals[],
  medicines: [] as Medicine[],
  labTests: [] as LabTest[],
  testOrders: [] as TestOrder[],
  testResults: [] as TestResult[],
  scheduleBlocks: [] as ScheduleBlock[],
  pregnancyRecords: [] as PregnancyRecord[],
  ancVisits: [] as ANCVisit[],
  videoSlots: [] as VideoSlot[],
  babies: [] as Baby[],
  growthMeasurements: [] as GrowthMeasurement[],
  immunizations: [] as Immunization[],
};

// Initialize with sample data
function initializeDatabase() {
  if (typeof window !== 'undefined') {
    const version = localStorage.getItem(DB_VERSION_KEY);
    const stored = localStorage.getItem(DB_KEY);
    if (stored && version === String(DB_VERSION)) {
      try {
        Object.assign(db, JSON.parse(stored));
        return;
      } catch (e) {
        // Corrupt snapshot — fall through and re-seed.
      }
    }
    // Stale or missing snapshot: drop it and seed fresh below.
    localStorage.removeItem(DB_KEY);
  }

  // Fresh seed. Reset every collection, then seed EVERY registered tenant into
  // this one store; list/by-id reads are tenant-scoped, so a hospital only ever
  // sees its own rows. Persist at the end so subsequent loads restore the
  // snapshot instead of re-seeding.
  db.users = [];
  db.doctors = [];
  db.patients = [];
  db.appointments = [];
  db.departments = [];
  db.medicalRecords = [];
  db.payments = [];
  db.prescriptions = [];
  db.vitals = [];
  db.medicines = [];
  db.labTests = [];
  db.testOrders = [];
  db.testResults = [];
  db.scheduleBlocks = [];
  db.pregnancyRecords = [];
  db.ancVisits = [];
  db.videoSlots = [];
  db.babies = [];
  db.growthMeasurements = [];
  db.immunizations = [];

  for (const cfg of getAllHospitals()) {
    seedTenant(cfg.id);
  }

  saveDatabase();
}

// Seeds one tenant: its catalog (from its config) + demo accounts. The flagship
// maternity hospital also gets the full demo dataset; other tenants get a
// generic account set derived from their configured specializations.
function seedTenant(hid: string) {
  const cfg = getHospitalConfig(hid);

  // Catalog — copied so admin edits don't mutate the config object; tagged hid.
  db.departments.push(...cfg.departments.map((d) => ({ ...d, hospitalId: hid })));
  db.medicines.push(...cfg.medicines.map((m) => ({ ...m, hospitalId: hid })));
  db.labTests.push(...cfg.labTests.map((t) => ({ ...t, hospitalId: hid })));

  if (hid === 'hosp-1') {
    seedMaternityAccounts();
    populateMaternityDemo('hosp-1');
  } else {
    seedGenericAccounts(hid);
  }
}

// The flagship maternity hospital's rich, hand-tuned demo accounts.
function seedMaternityAccounts() {
  const hid = 'hosp-1';
  const now = () => new Date().toISOString();
  const users: User[] = [
    { id: 'user-1', email: 'patient@example.com', password: 'password123', name: 'Sarah Johnson', role: 'patient', createdAt: now() },
    { id: 'user-2', email: 'obgyn@example.com', password: 'password123', name: 'Olivia Gynae', phone: '+91 98111 22334', role: 'doctor', createdAt: now() },
    { id: 'user-3', email: 'neonatology@example.com', password: 'password123', name: 'Nikhil Neonatal', phone: '+91 98222 33445', role: 'doctor', createdAt: now() },
    { id: 'user-4', email: 'maternal@example.com', password: 'password123', name: 'Maya Maternal', phone: '+91 98333 44556', role: 'doctor', createdAt: now() },
    { id: 'user-11', email: 'pediatrics@example.com', password: 'password123', name: 'Pooja Pediatric', phone: '+91 98555 66778', role: 'doctor', createdAt: now() },
    { id: 'user-5', email: 'admin@example.com', password: 'password123', name: 'Hospital Admin', phone: '+91 98000 00000', role: 'admin', createdAt: now() },
    { id: 'user-9', email: 'lab@example.com', password: 'password123', name: 'Ravi Kumar', phone: '+91 98444 55667', role: 'lab', createdAt: now() },
    { id: 'user-10', email: 'nurse@example.com', password: 'password123', name: 'Sister Anita Rao', phone: '+91 98333 22110', role: 'nurse', createdAt: now() },
  ];
  const doctors: Doctor[] = [
    { id: 'doc-1', userId: 'user-2', qualification: 'MBBS, MD (Obstetrics & Gynecology), Fellowship (High-Risk Pregnancy)', specialization: 'Obstetrics & Gynecology', experienceYears: 15, consultationFee: 800, availableSlots: [] },
    { id: 'doc-2', userId: 'user-3', qualification: 'MBBS, MD (Pediatrics), Neonatology Certification', specialization: 'Neonatology', experienceYears: 12, consultationFee: 600, availableSlots: [] },
    { id: 'doc-3', userId: 'user-4', qualification: 'MBBS, MD (Obstetrics & Gynecology)', specialization: 'Maternal Wellness', experienceYears: 10, consultationFee: 700, availableSlots: [] },
    { id: 'doc-4', userId: 'user-11', qualification: 'MBBS, MD (Pediatrics)', specialization: 'Pediatric Care', experienceYears: 8, consultationFee: 650, availableSlots: [] },
  ];
  db.users.push(...users.map((u) => ({ ...u, hospitalId: hid })));
  db.doctors.push(...doctors.map((d) => ({ ...d, hospitalId: hid })));
}

// A generic account set for any non-flagship tenant: admin + patient + nurse/lab
// (only where the module is on) + one doctor per configured specialization. All
// tenants share the same demo credentials (admin@/patient@/…); reads are
// tenant-scoped, so the same login resolves to the right hospital per subdomain.
function seedGenericAccounts(hid: string) {
  const cfg = getHospitalConfig(hid);
  const now = () => new Date().toISOString();
  const p = (n: number) => `+91 900${String(n).padStart(2, '0')} 000${String(n).padStart(2, '0')}`;

  const users: User[] = [
    { id: `${hid}-user-admin`, hospitalId: hid, email: 'admin@example.com', password: 'password123', name: `${cfg.name} Admin`, phone: p(1), role: 'admin', createdAt: now() },
    { id: `${hid}-user-patient`, hospitalId: hid, email: 'patient@example.com', password: 'password123', name: 'Demo Patient', phone: p(2), role: 'patient', createdAt: now() },
  ];
  if (cfg.modules.nursing) {
    users.push({ id: `${hid}-user-nurse`, hospitalId: hid, email: 'nurse@example.com', password: 'password123', name: 'Demo Nurse', phone: p(3), role: 'nurse', createdAt: now() });
  }
  if (cfg.modules.lab) {
    users.push({ id: `${hid}-user-lab`, hospitalId: hid, email: 'lab@example.com', password: 'password123', name: 'Demo Lab Tech', phone: p(4), role: 'lab', createdAt: now() });
  }
  db.users.push(...users);

  // A patient profile so the demo patient login lands on a usable dashboard.
  db.patients.push({
    id: `${hid}-pat-1`, hospitalId: hid, userId: `${hid}-user-patient`, phone: p(2),
    dateOfBirth: '1990-01-01', gender: 'Female', bloodGroup: 'O+', allergies: 'None',
    chronicDiseases: 'None', emergencyContact: '', emergencyPhone: '', medicalHistory: '',
    insuranceProvider: '', insuranceNumber: '', documents: [],
  });

  cfg.specializations.forEach((spec, i) => {
    const uid = `${hid}-user-doc-${i + 1}`;
    db.users.push({ id: uid, hospitalId: hid, email: `doctor${i + 1}@example.com`, password: 'password123', name: `Dr. ${spec}`, phone: p(10 + i), role: 'doctor', createdAt: now() });
    db.doctors.push({ id: `${hid}-doc-${i + 1}`, hospitalId: hid, userId: uid, qualification: 'MBBS, MD', specialization: spec, experienceYears: 8 + i, consultationFee: 600 + i * 50, availableSlots: [] });
  });
}

function saveDatabase() {
  if (typeof window !== 'undefined') {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    localStorage.setItem(DB_VERSION_KEY, String(DB_VERSION));
  }
}

// Database operations
export const dbOperations = {
  // User operations
  getUserByEmail: (email: string) => {
    initializeDatabase();
    return findOne(db.users, u => u.email === email);
  },

  getUserById: (id: string) => {
    initializeDatabase();
    return findOne(db.users, u => u.id === id);
  },

  getAllUsers: () => {
    initializeDatabase();
    return scoped(db.users);
  },

  createUser: (user: User) => {
    initializeDatabase();
    db.users.push(withTenant(user));
    saveDatabase();
    return user;
  },

  updateUser: (id: string, updates: Partial<Omit<User, 'id'>>) => {
    initializeDatabase();
    const user = findOne(db.users, u => u.id === id);
    if (!user) return null;
    Object.assign(user, updates);
    saveDatabase();
    return user;
  },

  // Removes a user and any linked doctor/patient profile to avoid orphan records.
  deleteUser: (id: string) => {
    initializeDatabase();
    const index = findIndexScoped(db.users, u => u.id === id);
    if (index === -1) return false;
    db.users.splice(index, 1);
    const docIndex = findIndexScoped(db.doctors, d => d.userId === id);
    if (docIndex !== -1) db.doctors.splice(docIndex, 1);
    const patIndex = findIndexScoped(db.patients, p => p.userId === id);
    if (patIndex !== -1) db.patients.splice(patIndex, 1);
    saveDatabase();
    return true;
  },

  // Patient operations
  getPatientByUserId: (userId: string) => {
    initializeDatabase();
    return findOne(db.patients, p => p.userId === userId);
  },

  getAllPatients: () => {
    initializeDatabase();
    return scoped(db.patients);
  },

  createPatient: (patient: Patient) => {
    initializeDatabase();
    db.patients.push(withTenant(patient));
    saveDatabase();
    return patient;
  },

  updatePatient: (patientId: string, updates: Partial<Patient>) => {
    initializeDatabase();
    const patient = findOne(db.patients, p => p.id === patientId);
    if (patient) {
      Object.assign(patient, updates);
      saveDatabase();
    }
    return patient;
  },

  // Doctor operations
  getAllDoctors: () => {
    initializeDatabase();
    return scoped(db.doctors);
  },

  getDoctorById: (id: string) => {
    initializeDatabase();
    return findOne(db.doctors, d => d.id === id);
  },

  getDoctor: (id: string) => {
    initializeDatabase();
    return findOne(db.doctors, d => d.id === id);
  },

  getDoctorByUserId: (userId: string) => {
    initializeDatabase();
    return findOne(db.doctors, d => d.userId === userId);
  },

  // Pushes a fully-formed doctor profile (used at self-registration, where the
  // linked user account is created separately with the real password).
  createDoctorProfile: (doctor: Doctor) => {
    initializeDatabase();
    db.doctors.push(withTenant(doctor));
    saveDatabase();
    return doctor;
  },

  // Creates the linked user (role: doctor) and the doctor profile together.
  createDoctor: (data: {
    name: string;
    email: string;
    phone?: string;
    qualification: string;
    specialization: string;
    experienceYears: number;
    consultationFee: number;
  }) => {
    initializeDatabase();
    const ts = Date.now();
    const userId = `user-${ts}`;
    db.users.push({
      id: userId,
      hospitalId: getCurrentHospitalId(),
      email: data.email,
      password: 'password123',
      name: data.name,
      phone: data.phone,
      role: 'doctor',
      createdAt: new Date().toISOString(),
    });
    const doctor: Doctor = {
      id: `doc-${ts}`,
      userId,
      qualification: data.qualification,
      specialization: data.specialization,
      experienceYears: data.experienceYears,
      consultationFee: data.consultationFee,
      availableSlots: [],
    };
    db.doctors.push(withTenant(doctor));
    saveDatabase();
    return doctor;
  },

  // Updates doctor profile fields and the linked user's name/email.
  updateDoctor: (
    id: string,
    data: {
      name?: string;
      email?: string;
      phone?: string;
      qualification?: string;
      specialization?: string;
      experienceYears?: number;
      consultationFee?: number;
    }
  ) => {
    initializeDatabase();
    const doctor = findOne(db.doctors, d => d.id === id);
    if (!doctor) return null;
    const { name, email, phone, ...doctorFields } = data;
    for (const [key, value] of Object.entries(doctorFields)) {
      if (value !== undefined) (doctor as any)[key] = value;
    }
    const user = findOne(db.users, u => u.id === doctor.userId);
    if (user) {
      if (name !== undefined) user.name = name;
      if (email !== undefined) user.email = email;
      if (phone !== undefined) user.phone = phone;
    }
    saveDatabase();
    return doctor;
  },

  // Removes the doctor profile and its linked user account.
  deleteDoctor: (id: string) => {
    initializeDatabase();
    const index = findIndexScoped(db.doctors, d => d.id === id);
    if (index === -1) return false;
    const [doctor] = db.doctors.splice(index, 1);
    const userIndex = findIndexScoped(db.users, u => u.id === doctor.userId);
    if (userIndex !== -1) db.users.splice(userIndex, 1);
    saveDatabase();
    return true;
  },

  getPatient: (id: string) => {
    initializeDatabase();
    return findOne(db.patients, p => p.id === id);
  },

  // Appointment operations
  getAppointment: (id: string) => {
    initializeDatabase();
    return findOne(db.appointments, a => a.id === id);
  },

  getAllAppointments: () => {
    initializeDatabase();
    return scoped(db.appointments);
  },
  createAppointment: (appointment: Appointment) => {
    initializeDatabase();
    db.appointments.push(withTenant(appointment));
    saveDatabase();
    return appointment;
  },

  getAppointmentsByPatientId: (patientId: string) => {
    initializeDatabase();
    return where(db.appointments, a => a.patientId === patientId);
  },

  getAppointmentsByDoctorId: (doctorId: string) => {
    initializeDatabase();
    return where(db.appointments, a => a.doctorId === doctorId);
  },

  updateAppointment: (appointmentId: string, updates: Partial<Appointment>) => {
    initializeDatabase();
    const appointment = findOne(db.appointments, a => a.id === appointmentId);
    if (appointment) {
      Object.assign(appointment, updates);
      saveDatabase();
    }
    return appointment;
  },

  deleteAppointment: (appointmentId: string) => {
    initializeDatabase();
    const index = findIndexScoped(db.appointments, a => a.id === appointmentId);
    if (index === -1) return false;
    db.appointments.splice(index, 1);
    saveDatabase();
    return true;
  },

  // Department operations
  getAllDepartments: () => {
    initializeDatabase();
    return scoped(db.departments);
  },

  createDepartment: (department: Department) => {
    initializeDatabase();
    db.departments.push(withTenant(department));
    saveDatabase();
    return department;
  },

  updateDepartment: (id: string, updates: Partial<Omit<Department, 'id'>>) => {
    initializeDatabase();
    const dept = findOne(db.departments, d => d.id === id);
    if (!dept) return null;
    Object.assign(dept, updates);
    saveDatabase();
    return dept;
  },

  deleteDepartment: (id: string) => {
    initializeDatabase();
    const index = findIndexScoped(db.departments, d => d.id === id);
    if (index === -1) return false;
    db.departments.splice(index, 1);
    saveDatabase();
    return true;
  },

  // Medicine (pharmacy catalog) operations
  getAllMedicines: () => {
    initializeDatabase();
    return scoped(db.medicines);
  },

  createMedicine: (medicine: Medicine) => {
    initializeDatabase();
    db.medicines.push(withTenant(medicine));
    saveDatabase();
    return medicine;
  },

  updateMedicine: (id: string, updates: Partial<Omit<Medicine, 'id'>>) => {
    initializeDatabase();
    const medicine = findOne(db.medicines, m => m.id === id);
    if (!medicine) return null;
    Object.assign(medicine, updates);
    saveDatabase();
    return medicine;
  },

  deleteMedicine: (id: string) => {
    initializeDatabase();
    const index = findIndexScoped(db.medicines, m => m.id === id);
    if (index === -1) return false;
    db.medicines.splice(index, 1);
    saveDatabase();
    return true;
  },

  // Lab test (diagnostics catalog) operations
  getAllLabTests: () => {
    initializeDatabase();
    return scoped(db.labTests);
  },

  createLabTest: (test: LabTest) => {
    initializeDatabase();
    db.labTests.push(withTenant(test));
    saveDatabase();
    return test;
  },

  updateLabTest: (id: string, updates: Partial<Omit<LabTest, 'id'>>) => {
    initializeDatabase();
    const test = findOne(db.labTests, t => t.id === id);
    if (!test) return null;
    Object.assign(test, updates);
    saveDatabase();
    return test;
  },

  deleteLabTest: (id: string) => {
    initializeDatabase();
    const index = findIndexScoped(db.labTests, t => t.id === id);
    if (index === -1) return false;
    db.labTests.splice(index, 1);
    saveDatabase();
    return true;
  },

  // Medical records
  getMedicalRecordsByPatientId: (patientId: string) => {
    initializeDatabase();
    return where(db.medicalRecords, m => m.patientId === patientId);
  },

  getMedicalRecordsByAppointment: (appointmentId: string) => {
    initializeDatabase();
    return where(db.medicalRecords, m => m.appointmentId === appointmentId);
  },

  createMedicalRecord: (record: MedicalRecord) => {
    initializeDatabase();
    db.medicalRecords.push(withTenant(record));
    saveDatabase();
    return record;
  },

  // Payment operations
  createPayment: (payment: Payment) => {
    initializeDatabase();
    db.payments.push(withTenant(payment));
    saveDatabase();
    return payment;
  },

  getPaymentsByPatientId: (patientId: string) => {
    initializeDatabase();
    return where(db.payments, p => p.patientId === patientId);
  },

  getAllPayments: () => {
    initializeDatabase();
    return scoped(db.payments);
  },

  updatePayment: (id: string, updates: Partial<Omit<Payment, 'id'>>) => {
    initializeDatabase();
    const payment = findOne(db.payments, p => p.id === id);
    if (!payment) return null;
    Object.assign(payment, updates);
    saveDatabase();
    return payment;
  },

  // Prescription operations
  createPrescription: (prescription: Prescription) => {
    initializeDatabase();
    db.prescriptions.push(withTenant(prescription));
    saveDatabase();
    return prescription;
  },

  getPrescriptionsByPatientId: (patientId: string) => {
    initializeDatabase();
    return where(db.prescriptions, p => p.patientId === patientId);
  },

  getPrescriptionsByAppointmentId: (appointmentId: string) => {
    initializeDatabase();
    return where(db.prescriptions, p => p.appointmentId === appointmentId);
  },

  getPrescriptionsByAppointment: (appointmentId: string) => {
    initializeDatabase();
    return where(db.prescriptions, p => p.appointmentId === appointmentId);
  },

  getPrescriptionsByDoctorId: (doctorId: string) => {
    initializeDatabase();
    return where(db.prescriptions, p => p.doctorId === doctorId);
  },

  getAllPrescriptions: () => {
    initializeDatabase();
    return scoped(db.prescriptions);
  },

  // Vitals operations
  createVitals: (vitals: Vitals) => {
    initializeDatabase();
    db.vitals.push(withTenant(vitals));
    saveDatabase();
    return vitals;
  },

  getAllVitals: () => {
    initializeDatabase();
    return scoped(db.vitals);
  },

  getVitalsByPatientId: (patientId: string) => {
    initializeDatabase();
    return where(db.vitals, v => v.patientId === patientId);
  },

  getVitalsByAppointmentId: (appointmentId: string) => {
    initializeDatabase();
    return where(db.vitals, v => v.appointmentId === appointmentId);
  },

  getVitalsByAppointment: (appointmentId: string) => {
    initializeDatabase();
    return where(db.vitals, v => v.appointmentId === appointmentId);
  },

  // Lab test order operations
  getAllTestOrders: () => {
    initializeDatabase();
    return scoped(db.testOrders);
  },

  getTestOrderById: (id: string) => {
    initializeDatabase();
    return findOne(db.testOrders, o => o.id === id);
  },

  getTestOrdersByPatientId: (patientId: string) => {
    initializeDatabase();
    return where(db.testOrders, o => o.patientId === patientId);
  },

  getTestOrdersByDoctorId: (doctorId: string) => {
    initializeDatabase();
    return where(db.testOrders, o => o.doctorId === doctorId);
  },

  getTestOrdersByAppointment: (appointmentId: string) => {
    initializeDatabase();
    return where(db.testOrders, o => o.appointmentId === appointmentId);
  },

  createTestOrder: (order: TestOrder) => {
    initializeDatabase();
    db.testOrders.push(withTenant(order));
    saveDatabase();
    return order;
  },

  updateTestOrder: (id: string, updates: Partial<Omit<TestOrder, 'id'>>) => {
    initializeDatabase();
    const order = findOne(db.testOrders, o => o.id === id);
    if (!order) return null;
    Object.assign(order, updates, { updatedAt: new Date().toISOString() });
    saveDatabase();
    return order;
  },

  deleteTestOrder: (id: string) => {
    initializeDatabase();
    const index = findIndexScoped(db.testOrders, o => o.id === id);
    if (index === -1) return false;
    db.testOrders.splice(index, 1);
    db.testResults = db.testResults.filter(r => r.orderId !== id);
    saveDatabase();
    return true;
  },

  // Lab test result operations
  getAllTestResults: () => {
    initializeDatabase();
    return scoped(db.testResults);
  },

  getTestResultsByOrderId: (orderId: string) => {
    initializeDatabase();
    return where(db.testResults, r => r.orderId === orderId);
  },

  upsertTestResult: (result: TestResult) => {
    initializeDatabase();
    const existing = findIndexScoped(db.testResults, 
      r => r.orderId === result.orderId && r.testId === result.testId,
    );
    const stamped = withTenant(result);
    if (existing === -1) {
      db.testResults.push(stamped);
    } else {
      db.testResults[existing] = stamped;
    }
    saveDatabase();
    return result;
  },

  // Schedule block operations (breaks / OT / unavailable time)
  getAllScheduleBlocks: () => {
    initializeDatabase();
    return scoped(db.scheduleBlocks);
  },

  getScheduleBlocksByDoctorId: (doctorId: string) => {
    initializeDatabase();
    return where(db.scheduleBlocks, b => b.doctorId === doctorId);
  },

  createScheduleBlock: (block: ScheduleBlock) => {
    initializeDatabase();
    db.scheduleBlocks.push(withTenant(block));
    saveDatabase();
    return block;
  },

  deleteScheduleBlock: (id: string) => {
    initializeDatabase();
    const index = findIndexScoped(db.scheduleBlocks, b => b.id === id);
    if (index === -1) return false;
    db.scheduleBlocks.splice(index, 1);
    saveDatabase();
    return true;
  },

  // Pregnancy record operations (maternity ANC tracker)
  getAllPregnancies: () => {
    initializeDatabase();
    return scoped(db.pregnancyRecords);
  },

  // Returns the patient's active pregnancy (most recently created) if any.
  getActivePregnancyByPatientId: (patientId: string) => {
    initializeDatabase();
    return db.pregnancyRecords
      .filter(p => p.patientId === patientId && p.status === 'active')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  },

  getPregnancyById: (id: string) => {
    initializeDatabase();
    return findOne(db.pregnancyRecords, p => p.id === id);
  },

  createPregnancyRecord: (record: PregnancyRecord) => {
    initializeDatabase();
    db.pregnancyRecords.push(withTenant(record));
    saveDatabase();
    return record;
  },

  updatePregnancyRecord: (id: string, updates: Partial<Omit<PregnancyRecord, 'id'>>) => {
    initializeDatabase();
    const record = findOne(db.pregnancyRecords, p => p.id === id);
    if (!record) return null;
    Object.assign(record, updates);
    saveDatabase();
    return record;
  },

  // ANC visit operations
  getANCVisitsByPregnancyId: (pregnancyId: string) => {
    initializeDatabase();
    return db.ancVisits
      .filter(v => v.pregnancyId === pregnancyId)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  createANCVisit: (visit: ANCVisit) => {
    initializeDatabase();
    db.ancVisits.push(withTenant(visit));
    saveDatabase();
    return visit;
  },

  // Video-consultation slot operations
  getAllVideoSlots: () => {
    initializeDatabase();
    return scoped(db.videoSlots);
  },

  getVideoSlotsByDoctorId: (doctorId: string) => {
    initializeDatabase();
    return db.videoSlots
      .filter(s => s.doctorId === doctorId)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  },

  // Open, still-upcoming slots for a doctor (what a patient can book).
  getOpenVideoSlotsByDoctorId: (doctorId: string) => {
    initializeDatabase();
    const today = new Date().toISOString().split('T')[0];
    return db.videoSlots
      .filter(s => s.doctorId === doctorId && s.status === 'open' && s.date >= today)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  },

  createVideoSlot: (slot: VideoSlot) => {
    initializeDatabase();
    db.videoSlots.push(withTenant(slot));
    saveDatabase();
    return slot;
  },

  deleteVideoSlot: (id: string) => {
    initializeDatabase();
    const index = findIndexScoped(db.videoSlots, s => s.id === id);
    if (index === -1) return false;
    db.videoSlots.splice(index, 1);
    saveDatabase();
    return true;
  },

  // Marks a slot booked and links it to the created appointment.
  bookVideoSlot: (id: string, appointmentId: string) => {
    initializeDatabase();
    const slot = findOne(db.videoSlots, s => s.id === id);
    if (!slot) return null;
    slot.status = 'booked';
    slot.appointmentId = appointmentId;
    saveDatabase();
    return slot;
  },

  // Baby / newborn operations
  getAllBabies: () => {
    initializeDatabase();
    return scoped(db.babies);
  },
  getBabyById: (id: string) => {
    initializeDatabase();
    return findOne(db.babies, b => b.id === id);
  },
  getBabiesByMother: (motherPatientId: string) => {
    initializeDatabase();
    return where(db.babies, b => b.motherPatientId === motherPatientId);
  },
  createBaby: (baby: Baby) => {
    initializeDatabase();
    db.babies.push(withTenant(baby));
    saveDatabase();
    return baby;
  },

  // Growth measurements
  getGrowthByBabyId: (babyId: string) => {
    initializeDatabase();
    return db.growthMeasurements
      .filter(g => g.babyId === babyId)
      .sort((a, b) => a.date.localeCompare(b.date));
  },
  addGrowthMeasurement: (m: GrowthMeasurement) => {
    initializeDatabase();
    db.growthMeasurements.push(withTenant(m));
    saveDatabase();
    return m;
  },

  // Immunizations
  getImmunizationsByBabyId: (babyId: string) => {
    initializeDatabase();
    return db.immunizations
      .filter(i => i.babyId === babyId)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  },
  createImmunization: (imm: Immunization) => {
    initializeDatabase();
    db.immunizations.push(withTenant(imm));
    saveDatabase();
    return imm;
  },
  markImmunizationGiven: (id: string, givenDate: string) => {
    initializeDatabase();
    const imm = findOne(db.immunizations, i => i.id === id);
    if (!imm) return null;
    imm.status = 'given';
    imm.givenDate = givenDate;
    saveDatabase();
    return imm;
  },

  // ---------------------------------------------------------------------------
  // Demo data (for pitching). Populates a realistic maternity scenario on
  // demand — kept OUT of the default seed so the app starts clean.
  // ---------------------------------------------------------------------------
  hasDemoData: () => {
    initializeDatabase();
    return db.appointments.length > 0 || db.pregnancyRecords.length > 0;
  },

  clearOperationalData: () => {
    initializeDatabase();
    // Only clear the ACTIVE tenant's rows — other hospitals in the store keep
    // their data.
    const hid = getCurrentHospitalId();
    const drop = <T extends { hospitalId?: string }>(rows: T[]) =>
      rows.filter((r) => r.hospitalId !== hid);
    db.appointments = drop(db.appointments);
    db.medicalRecords = drop(db.medicalRecords);
    db.payments = drop(db.payments);
    db.prescriptions = drop(db.prescriptions);
    db.vitals = drop(db.vitals);
    db.testOrders = drop(db.testOrders);
    db.testResults = drop(db.testResults);
    db.scheduleBlocks = drop(db.scheduleBlocks);
    db.pregnancyRecords = drop(db.pregnancyRecords);
    db.ancVisits = drop(db.ancVisits);
    // Drop this tenant's demo-only patients (the primary demo login stays).
    db.patients = db.patients.filter((p) => !(p.hospitalId === hid && p.id.startsWith('pat-d')));
    db.users = db.users.filter((u) => !(u.hospitalId === hid && u.id.startsWith('user-d')));
    saveDatabase();
  },

  loadMaternityDemo: () => {
    initializeDatabase();
    populateMaternityDemo(getCurrentHospitalId());
    saveDatabase();
  },

  // Seeds a newly-onboarded tenant (catalog + demo accounts) into the existing
  // store without wiping other hospitals. No-op if it's already seeded.
  ensureTenantSeeded: (hid: string) => {
    initializeDatabase();
    const already = db.users.some((u) => u.hospitalId === hid);
    if (!already) {
      seedTenant(hid);
      saveDatabase();
    }
  },
};

// Full maternity demo dataset (patients, pregnancies, ANC visits, appointments,
// labs, newborn records). Assumes the DB has already been initialized. Called
// both on first seed and by the admin "Load sample data" action.
function populateMaternityDemo(hid: string = getCurrentHospitalId()) {
    // Clean this tenant's operational slate first, preserving other tenants.
    const drop = <T extends { hospitalId?: string }>(rows: T[]) =>
      rows.filter((r) => r.hospitalId !== hid);
    db.appointments = drop(db.appointments);
    db.medicalRecords = drop(db.medicalRecords);
    db.payments = drop(db.payments);
    db.prescriptions = drop(db.prescriptions);
    db.vitals = drop(db.vitals);
    db.testOrders = drop(db.testOrders);
    db.testResults = drop(db.testResults);
    db.scheduleBlocks = drop(db.scheduleBlocks);
    db.pregnancyRecords = drop(db.pregnancyRecords);
    db.ancVisits = drop(db.ancVisits);
    db.videoSlots = drop(db.videoSlots);
    db.babies = drop(db.babies);
    db.growthMeasurements = drop(db.growthMeasurements);
    db.immunizations = drop(db.immunizations);
    db.patients = db.patients.filter((p) => !(p.hospitalId === hid && p.id.startsWith('pat-d')));
    db.users = db.users.filter((u) => !(u.hospitalId === hid && u.id.startsWith('user-d')));

    const now = Date.now();
    const DAY = 86400000;
    const dstr = (off: number) => new Date(now + off * DAY).toISOString().split('T')[0];
    const istr = (off: number) => new Date(now + off * DAY).toISOString();

    // Ensure the demo login patient (user-1) has a profile.
    if (!db.patients.some((p) => p.id === 'pat-1')) {
      db.patients.push({
        id: 'pat-1', hospitalId: hid, userId: 'user-1', phone: '+91 98765 43210',
        dateOfBirth: '1994-03-14', gender: 'Female', bloodGroup: 'A+', allergies: 'None',
        chronicDiseases: 'None', emergencyContact: 'Robert Johnson', emergencyPhone: '+91 98765 00000',
        medicalHistory: 'G1P0, healthy pregnancy', insuranceProvider: 'Star Health',
        insuranceNumber: 'SH-2026-0912', documents: [],
      });
    }

    // Extra demo patients.
    const demoPatients = [
      { uid: 'user-d1', pid: 'pat-d1', name: 'Priya Menon', phone: '+91 90012 34501', dob: '1996-07-22', blood: 'O+' },
      { uid: 'user-d2', pid: 'pat-d2', name: 'Aisha Khan', phone: '+91 90012 34502', dob: '1989-11-02', blood: 'B+' },
      { uid: 'user-d3', pid: 'pat-d3', name: 'Meera Nair', phone: '+91 90012 34503', dob: '1993-01-30', blood: 'AB+' },
    ];
    demoPatients.forEach((p) => {
      db.users.push({ id: p.uid, hospitalId: hid, email: `${p.pid}@example.com`, password: 'password123', name: p.name, phone: p.phone, role: 'patient', createdAt: istr(-120) });
      db.patients.push({ id: p.pid, hospitalId: hid, userId: p.uid, phone: p.phone, dateOfBirth: p.dob, gender: 'Female', bloodGroup: p.blood, allergies: 'None', chronicDiseases: 'None', emergencyContact: '', emergencyPhone: '', medicalHistory: '', insuranceProvider: '', insuranceNumber: '', documents: [] });
    });

    // Pregnancies. LMP offsets chosen to hit target gestational age.
    const preg = (id: string, pid: string, lmpOff: number, gravida: number, para: number, risk: string[], status: PregnancyRecord['status'] = 'active') => {
      const lmp = dstr(lmpOff);
      const edd = new Date(new Date(lmp + 'T00:00:00').getTime() + 280 * DAY).toISOString().split('T')[0];
      db.pregnancyRecords.push({ id, hospitalId: hid, patientId: pid, lmp, edd, gravida, para, height: 162, prePregnancyWeight: 58, bloodGroup: '', riskFactors: risk, status, notes: '', createdAt: istr(lmpOff) });
    };
    preg('preg-1', 'pat-1', -210, 1, 0, []);                                                 // Sarah ~30w
    preg('preg-2', 'pat-d1', -91, 2, 1, []);                                                 // Priya ~13w
    preg('preg-3', 'pat-d2', -245, 3, 1, ['Previous C-section', 'Gestational hypertension']);// Aisha ~35w, high-risk
    preg('preg-4', 'pat-d3', -300, 2, 2, [], 'delivered');                                   // Meera, delivered

    // ANC visits.
    const visit = (id: string, pid: string, pregId: string, off: number, weeks: number, weight: number, sys: number, dia: number, fundal: number, hb: number, fhr: number) => {
      db.ancVisits.push({ id, hospitalId: hid, pregnancyId: pregId, patientId: pid, doctorId: 'doc-1', date: dstr(off), weeks, weight, systolic: sys, diastolic: dia, fundalHeight: fundal, hemoglobin: hb, fetalHeartRate: fhr, notes: '', createdAt: istr(off) });
    };
    // Sarah: normal progression.
    visit('anc-1', 'pat-1', 'preg-1', -154, 8, 59, 112, 72, 0, 12.1, 0);
    visit('anc-2', 'pat-1', 'preg-1', -126, 12, 61, 114, 74, 12, 11.8, 160);
    visit('anc-3', 'pat-1', 'preg-1', -70, 20, 65, 116, 76, 20, 11.5, 150);
    visit('anc-4', 'pat-1', 'preg-1', -28, 26, 68, 118, 76, 26, 11.2, 145);
    visit('anc-5', 'pat-1', 'preg-1', -3, 30, 70, 120, 78, 30, 11.0, 142);
    // Priya: early.
    visit('anc-6', 'pat-d1', 'preg-2', -35, 8, 55, 110, 70, 0, 12.4, 0);
    visit('anc-7', 'pat-d1', 'preg-2', -7, 12, 56, 112, 72, 11, 12.0, 158);
    // Aisha: high-risk — rising BP + anemia (drives risk flags).
    visit('anc-8', 'pat-d2', 'preg-3', -140, 20, 66, 128, 84, 20, 10.9, 148);
    visit('anc-9', 'pat-d2', 'preg-3', -70, 28, 71, 138, 88, 28, 10.5, 144);
    visit('anc-10', 'pat-d2', 'preg-3', -5, 34, 76, 148, 96, 34, 10.2, 140);

    // Appointments (+ matching payments).
    const feeByDoctor: Record<string, number> = { 'doc-1': 800, 'doc-2': 600, 'doc-3': 700 };
    const appt = (id: string, pid: string, docId: string, deptId: string, off: number, time: string, status: Appointment['status'], reason: string, followUpOf?: string, mode: Appointment['mode'] = 'in-person') => {
      db.appointments.push({ id, hospitalId: hid, patientId: pid, doctorId: docId, departmentId: deptId, date: dstr(off), time, status, mode, reason, notes: '', followUpOf, createdAt: istr(off) });
      const payStatus: Payment['status'] = status === 'completed' ? 'completed' : status === 'cancelled' ? 'failed' : 'pending';
      db.payments.push({ id: `pay-${id}`, hospitalId: hid, appointmentId: id, patientId: pid, amount: feeByDoctor[docId] ?? 800, status: payStatus, paymentMethod: status === 'completed' ? 'UPI' : 'Insurance', createdAt: istr(off) });
    };
    appt('apt-1', 'pat-1', 'doc-1', 'dept-1', -3, '10:00 AM', 'completed', '3rd Trimester Checkup');
    appt('apt-2', 'pat-1', 'doc-1', 'dept-1', 7, '10:30 AM', 'scheduled', 'Growth Scan Review');
    appt('apt-3', 'pat-d1', 'doc-3', 'dept-3', -7, '11:00 AM', 'completed', '1st Trimester Screening');
    appt('apt-4', 'pat-d1', 'doc-1', 'dept-1', 10, '09:30 AM', 'scheduled', 'Anomaly Scan');
    appt('apt-5', 'pat-d2', 'doc-1', 'dept-1', -5, '02:00 PM', 'completed', 'High-Risk Antenatal Visit');
    appt('apt-6', 'pat-d2', 'doc-1', 'dept-1', 2, '02:30 PM', 'scheduled', 'BP Monitoring (video follow-up)', undefined, 'video');
    appt('apt-7', 'pat-d3', 'doc-2', 'dept-2', -20, '03:00 PM', 'completed', 'Postnatal Newborn Check');
    appt('apt-8', 'pat-1', 'doc-1', 'dept-1', -14, '09:00 AM', 'completed', 'Antenatal Checkup');
    appt('apt-9', 'pat-d1', 'doc-1', 'dept-1', -21, '10:00 AM', 'completed', 'Booking Visit');
    appt('apt-10', 'pat-d2', 'doc-1', 'dept-1', -35, '11:30 AM', 'completed', 'Antenatal Checkup');
    appt('apt-11', 'pat-1', 'doc-1', 'dept-1', 1, '12:00 PM', 'scheduled', 'Follow-up Consultation', 'apt-1');

    // Prescriptions (Sarah's recent completed visit).
    const rx = (id: string, med: string, dose: string, freq: string, dur: string, instr: string) =>
      db.prescriptions.push({ id, hospitalId: hid, appointmentId: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', medicineName: med, dosage: dose, frequency: freq, duration: dur, instructions: instr, createdAt: istr(-3) });
    rx('rx-1', 'Prenatal Multivitamin', '1 tablet', 'Once daily', 'Throughout pregnancy', 'Take with food');
    rx('rx-2', 'Ferrous Sulfate (Iron)', '300 mg', 'Once daily', '3rd trimester', 'Take with orange juice, avoid dairy');
    rx('rx-3', 'Calcium + Vitamin D3', '500 mg', 'Twice daily', '3rd trimester', 'After meals');

    // Vitals (Sarah's recent completed visit).
    db.vitals.push({ id: 'vit-1', hospitalId: hid, appointmentId: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', temperature: 36.8, bloodPressure: '120/78', heartRate: 80, respiratoryRate: 16, weight: 70, height: 162, notes: 'FHR 142 bpm, fundal height 30 cm — appropriate for gestational age', createdAt: istr(-3) });

    // Lab orders + results.
    db.testOrders.push({ id: 'ord-1', hospitalId: hid, patientId: 'pat-d2', doctorId: 'doc-1', appointmentId: 'apt-5', items: [{ testId: 'test-1', name: 'Complete Blood Count (CBC)', price: 400 }], status: 'reviewed', priority: 'urgent', clinicalNote: 'High-risk, rule out anemia', orderedAt: istr(-5), updatedAt: istr(-4) });
    db.testOrders.push({ id: 'ord-2', hospitalId: hid, patientId: 'pat-1', doctorId: 'doc-1', appointmentId: 'apt-2', items: [{ testId: 'test-20', name: 'Oral Glucose Tolerance Test (OGTT)', price: 500 }], status: 'ordered', priority: 'routine', clinicalNote: 'Routine GDM screening at 30 weeks', orderedAt: istr(-1), updatedAt: istr(-1) });
    db.testResults.push({ id: 'res-1', hospitalId: hid, orderId: 'ord-1', testId: 'test-1', testName: 'Complete Blood Count (CBC)', parameters: [
      { name: 'Hemoglobin', value: '10.2', unit: 'g/dL', referenceRange: '12.0 – 15.5', flag: 'low' },
      { name: 'WBC Count', value: '8200', unit: '/µL', referenceRange: '4000 – 11000', flag: 'normal' },
      { name: 'Platelet Count', value: '230000', unit: '/µL', referenceRange: '150000 – 410000', flag: 'normal' },
    ], remarks: 'Iron-deficiency anemia; start supplementation.', reportedBy: 'Ravi Kumar', reportedAt: istr(-4) });

    // Schedule block — a scheduled C-section.
    db.scheduleBlocks.push({ id: 'blk-1', hospitalId: hid, doctorId: 'doc-1', date: dstr(1), startTime: '02:00 PM', endTime: '04:00 PM', type: 'ot', note: 'Scheduled C-section', createdAt: istr(0) });

    // Video-consultation slots. Aisha's video appointment (apt-6) has a booked
    // slot; the rest are open for a patient to book live during the demo.
    db.videoSlots.push({ id: 'vs-booked', hospitalId: hid, doctorId: 'doc-1', date: dstr(2), time: '02:30 PM', status: 'booked', appointmentId: 'apt-6', createdAt: istr(-1) });
    const openSlots: { doc: string; off: number; time: string }[] = [
      { doc: 'doc-1', off: 1, time: '11:00 AM' }, { doc: 'doc-1', off: 1, time: '11:30 AM' },
      { doc: 'doc-1', off: 3, time: '04:00 PM' }, { doc: 'doc-1', off: 3, time: '04:30 PM' },
      { doc: 'doc-3', off: 2, time: '10:00 AM' }, { doc: 'doc-3', off: 2, time: '10:30 AM' },
      { doc: 'doc-3', off: 4, time: '03:00 PM' },
    ];
    openSlots.forEach((s, i) => db.videoSlots.push({ id: `vs-open-${i + 1}`, hospitalId: hid, doctorId: s.doc, date: dstr(s.off), time: s.time, status: 'open', createdAt: istr(0) }));

    // Newborn (Meera's baby, ~5 months old) with growth + immunisations.
    const babyDob = dstr(-150);
    db.babies.push({ id: 'baby-1', hospitalId: hid, motherPatientId: 'pat-d3', pregnancyId: 'preg-4', name: 'Baby Nair', dateOfBirth: babyDob, sex: 'female', birthWeight: 3.1, birthLength: 49, headCircumference: 34, deliveryType: 'normal', gestationalWeeks: 39, createdAt: istr(-150) });
    const growthPts: [number, number, number][] = [
      [0, 3.1, 49], [30, 4.0, 53], [61, 5.0, 57], [91, 5.8, 60], [122, 6.4, 62], [145, 6.9, 64],
    ];
    growthPts.forEach(([d, w, h], i) => db.growthMeasurements.push({ id: `gm-demo-${i}`, hospitalId: hid, babyId: 'baby-1', date: dstr(-150 + d), weight: w, height: h, headCircumference: 34 + i, createdAt: istr(-150 + d) }));
    // Immunisations: birth/6wk/10wk given; 14wk overdue; later doses upcoming.
    IAP_SCHEDULE.forEach((v, i) => {
      const given = v.ageDays <= 70;
      db.immunizations.push({
        id: `imm-demo-${i}`, hospitalId: hid, babyId: 'baby-1', vaccine: v.vaccine, ageLabel: v.ageLabel,
        dueDate: babyAddDays(babyDob, v.ageDays), status: given ? 'given' : 'pending',
        givenDate: given ? babyAddDays(babyDob, v.ageDays) : undefined, createdAt: istr(-150),
      });
    });

    saveDatabase();
}

// Initialize on first import
if (typeof window !== 'undefined') {
  initializeDatabase();
}

import { dbOperations, Patient } from './db';
import { setCurrentHospitalId } from './tenant';
import { AUTH_SESSION_KEY, DEFAULT_HOSPITAL_ID } from './constants';
import type {
  AuthSession,
  DoctorDetails,
  PatientDetails,
  RegisterDetails,
} from './types';

// Re-export the auth types (definitions live in ./types).
export type { AuthSession, DoctorDetails, PatientDetails, RegisterDetails } from './types';

// Simulate JWT token generation
function generateToken(userId: string): string {
  return btoa(JSON.stringify({ userId, iat: Date.now() }));
}

// Parse token
function parseToken(token: string): { userId: string } | null {
  try {
    return JSON.parse(atob(token));
  } catch {
    return null;
  }
}

// Auth operations
export const authOperations = {
  register: async (
    email: string,
    password: string,
    name: string,
    role: 'patient' | 'doctor' | 'admin' | 'lab' | 'nurse',
    phone?: string,
    details?: RegisterDetails
  ): Promise<AuthSession | null> => {
    // Check if user exists
    if (dbOperations.getUserByEmail(email)) {
      return null;
    }

    // Create user
    const ts = Date.now();
    const userId = `user-${ts}`;
    const user = dbOperations.createUser({
      id: userId,
      email,
      password, // In production, use bcrypt
      name,
      phone,
      role,
      createdAt: new Date().toISOString(),
    });

    let patient: Patient | undefined;

    // Create the linked role profile, seeded with details from the wizard.
    if (role === 'patient') {
      const d = (details ?? {}) as PatientDetails;
      patient = dbOperations.createPatient({
        id: `pat-${ts}`,
        userId,
        phone: phone ?? '',
        dateOfBirth: d.dateOfBirth ?? '',
        gender: d.gender ?? '',
        bloodGroup: d.bloodGroup ?? '',
        allergies: d.allergies ?? '',
        chronicDiseases: d.chronicDiseases ?? '',
        emergencyContact: d.emergencyContact ?? '',
        emergencyPhone: d.emergencyPhone ?? '',
        medicalHistory: '',
        insuranceProvider: d.insuranceProvider ?? '',
        insuranceNumber: d.insuranceNumber ?? '',
        documents: [],
      });
    } else if (role === 'doctor') {
      const d = (details ?? {}) as DoctorDetails;
      dbOperations.createDoctorProfile({
        id: `doc-${ts}`,
        userId,
        qualification: d.qualification ?? '',
        specialization: d.specialization ?? '',
        experienceYears: d.experienceYears ?? 0,
        consultationFee: d.consultationFee ?? 0,
        availableSlots: [],
        licenseNumber: d.licenseNumber ?? '',
        medicalCouncil: d.medicalCouncil ?? '',
        registrationYear: d.registrationYear ?? '',
        // New self-registered doctors await admin/council verification.
        verificationStatus: 'pending',
      });
    }

    const token = generateToken(userId);
    return {
      user,
      patient,
      hospitalId: user.hospitalId ?? DEFAULT_HOSPITAL_ID,
      token,
      isAuthenticated: true,
    };
  },

  login: async (email: string, password: string): Promise<AuthSession | null> => {
    // getUserByEmail is tenant-scoped, so the same demo email (admin@…) resolves
    // to the hospital of the current subdomain / active tenant.
    const user = dbOperations.getUserByEmail(email);

    if (!user || user.password !== password) {
      return null;
    }

    // Lock the active tenant to the user's hospital so all subsequent data reads
    // scope correctly (matters on the bare host where there's no subdomain).
    const hospitalId = user.hospitalId ?? DEFAULT_HOSPITAL_ID;
    setCurrentHospitalId(hospitalId);

    const token = generateToken(user.id);
    const patient = user.role === 'patient' ? dbOperations.getPatientByUserId(user.id) : undefined;

    return {
      user,
      patient,
      hospitalId,
      token,
      isAuthenticated: true,
    };
  },

  // Session management
  getSessionFromToken: (token: string): AuthSession | null => {
    const parsed = parseToken(token);
    if (!parsed) return null;

    const user = dbOperations.getUserById(parsed.userId);
    if (!user) return null;

    const patient = user.role === 'patient' ? dbOperations.getPatientByUserId(user.id) : undefined;

    return {
      user,
      patient,
      hospitalId: user.hospitalId ?? DEFAULT_HOSPITAL_ID,
      token,
      isAuthenticated: true,
    };
  },

  validateToken: (token: string): boolean => {
    return parseToken(token) !== null;
  },
};

/**
 * Returns true if the session holds the given permission code.
 *
 * - If `session` is null → false (not authenticated).
 * - If `session.permissions` is undefined → true (old stored session without
 *   permission data; fall back to allowing so existing sessions aren't broken).
 * - If `session.permissions` is an empty array → false (no permissions granted).
 */
export function hasPermission(
  session: AuthSession | null,
  code: string,
): boolean {
  if (!session) return false;
  if (session.permissions === undefined) return true;
  return session.permissions.some((p) => p.code === code);
}

// Helper to store auth in localStorage
export const authStorage = {
  setSession: (session: AuthSession) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    }
  },

  getSession: (): AuthSession | null => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(AUTH_SESSION_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return null;
        }
      }
    }
    return null;
  },

  clearSession: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_SESSION_KEY);
    }
  },
};

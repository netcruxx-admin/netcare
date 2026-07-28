# Maternity Hospital API — Full Reference

Base URL (dev): `http://localhost:8000`

- All request/response bodies are **JSON** with **camelCase** keys.
- IDs are **strings** (`user-1`, `pat-1`, `doc-1`, `apt-1`, ...). New records get `<prefix>-<8hex>`.
- Protected endpoints require a header: `Authorization: Bearer <token>`.
- Get a token from `POST /auth/login` or `POST /auth/register`.
- Interactive docs are auto-generated at `/docs` (Swagger) and `/redoc`.

### Conventions

| Symbol | Meaning |
|--------|---------|
| 🔓 | Public — no token required |
| 🔒 | Protected — requires `Authorization: Bearer <token>` |

### Standard error shape

Every error returns:

```json
{ "detail": "Human readable message" }
```

| Status | When |
|--------|------|
| `401 Unauthorized` | Missing/invalid/expired token, or wrong login credentials |
| `403 Forbidden` | Token valid but role not allowed (where role checks apply) |
| `404 Not Found` | Resource id does not exist |
| `409 Conflict` | Registering an email that already exists |
| `422 Unprocessable Entity` | Body failed validation (missing/invalid fields) |

---

## Object schemas

### User
```json
{
  "id": "user-1",
  "email": "patient@example.com",
  "name": "Sarah Johnson",
  "role": "patient",                 // "patient" | "doctor" | "admin"
  "createdAt": "2026-06-30T09:38:48.179555+00:00"
}
```
> `password` is **never** returned.

### Patient
```json
{
  "id": "pat-1",
  "userId": "user-1",
  "dateOfBirth": "1992-05-20",
  "gender": "Female",
  "bloodGroup": "A+",
  "allergies": "No Known Allergies",
  "chronicDiseases": "None",
  "emergencyContact": "Robert Johnson",
  "emergencyPhone": "+1-555-0123",
  "medicalHistory": "Healthy pregnancy, no complications",
  "insuranceProvider": "MaternityCare Insurance",
  "insuranceNumber": "MC-2024-089456",
  "documents": []                    // string[]
}
```

### Doctor
```json
{
  "id": "doc-1",
  "userId": "user-2",
  "qualification": "MBBS, MD (Obstetrics & Gynecology), Fellowship (High-Risk Pregnancy)",
  "specialization": "Obstetrics & Gynecology",
  "experienceYears": 15,
  "consultationFee": 800,
  "availableSlots": []               // TimeSlot[]
}
```
**TimeSlot:** `{ "date": "2026-07-10", "startTime": "10:00 AM", "endTime": "10:30 AM", "available": true }`

### Department
```json
{ "id": "dept-1", "name": "Obstetrics & Gynecology", "description": "Pregnancy, childbirth, and postpartum care" }
```

### Appointment
```json
{
  "id": "apt-1",
  "patientId": "pat-1",
  "doctorId": "doc-1",
  "departmentId": "dept-1",
  "date": "2026-07-07",
  "time": "10:00 AM",
  "status": "scheduled",             // "scheduled" | "completed" | "cancelled"
  "reason": "3rd Trimester Checkup",
  "notes": "Routine antenatal visit, 32 weeks pregnancy",
  "createdAt": "2026-06-30T09:38:48.179555+00:00"
}
```

### MedicalRecord
```json
{
  "id": "med-1",
  "patientId": "pat-1",
  "appointmentId": "apt-2",
  "doctorId": "doc-1",
  "diagnosis": "Normal pregnancy, 20 weeks gestation",
  "prescription": "Prenatal vitamins with folic acid 400mcg, Iron supplement",
  "labReports": ["AFP Level: Normal", "Glucose screening: Normal"],
  "createdAt": "2026-06-16T09:38:48.179555+00:00"
}
```

### Payment
```json
{
  "id": "pay-1",
  "appointmentId": "apt-2",
  "patientId": "pat-1",
  "amount": 2500,
  "status": "completed",             // "pending" | "completed" | "failed"
  "paymentMethod": "Credit Card",
  "createdAt": "2026-06-16T09:38:48.179555+00:00"
}
```

### Prescription
```json
{
  "id": "presc-1",
  "appointmentId": "apt-2",
  "patientId": "pat-1",
  "doctorId": "doc-1",
  "medicineName": "Prenatal Multivitamin",
  "dosage": "1 tablet",
  "frequency": "Once daily",
  "duration": "Throughout pregnancy",
  "instructions": "Take with food in the morning",
  "createdAt": "2026-06-16T09:38:48.179555+00:00"
}
```

### Vitals
```json
{
  "id": "vit-1",
  "appointmentId": "apt-2",
  "patientId": "pat-1",
  "doctorId": "doc-1",
  "temperature": 36.8,
  "bloodPressure": "118/76",
  "heartRate": 78,
  "respiratoryRate": 16,
  "weight": 68.5,
  "height": 165,
  "notes": "Weight gain appropriate for 20 weeks gestation...",
  "createdAt": "2026-06-16T09:38:48.179555+00:00"
}
```

### AuthResponse (returned by login / register / me)
```json
{
  "user": { /* User */ },
  "patient": { /* Patient, only when role === "patient", else null */ },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "isAuthenticated": true
}
```

---

## Health

### `GET /` 🔓
Health/liveness check.

**200**
```json
{ "status": "ok", "service": "Maternity Hospital API" }
```

---

## Auth

### `POST /auth/register` 🔓
Create a new account. If `role` is `patient`, an empty Patient record is created and returned.

**Request**
```json
{
  "email": "new@example.com",
  "password": "secret123",
  "name": "New Mom",
  "role": "patient"          // "patient" | "doctor" | "admin"
}
```

**201 / 200** → `AuthResponse`

**Errors:** `409` email already registered · `422` invalid body

```bash
curl -X POST http://localhost:8000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"new@example.com","password":"secret123","name":"New Mom","role":"patient"}'
```

---

### `POST /auth/login` 🔓
Authenticate and receive a token.

**Request**
```json
{ "email": "patient@example.com", "password": "password123" }
```

**200** → `AuthResponse`

**Errors:** `401` invalid email or password

```bash
curl -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"patient@example.com","password":"password123"}'
```

---

### `GET /auth/me` 🔒
Return the current session for the bearer token (re-issues a fresh token).

**200** → `AuthResponse`

**Errors:** `401` missing/invalid/expired token

```bash
curl http://localhost:8000/auth/me -H "Authorization: Bearer $TOKEN"
```

---

## Departments

### `GET /departments` 🔓
List all departments.

**200** → `Department[]`

---

## Doctors

### `GET /doctors` 🔓
List all doctors. **200** → `Doctor[]`

### `GET /doctors/{doctorId}` 🔓
Get one doctor. **200** → `Doctor` · **404** not found

### `GET /doctors/by-user/{userId}` 🔒
Get the doctor profile linked to a user id. **200** → `Doctor` · **404** not found

### `GET /doctors/{doctorId}/appointments` 🔒
All appointments for a doctor. **200** → `Appointment[]`

```bash
curl http://localhost:8000/doctors/doc-1/appointments -H "Authorization: Bearer $TOKEN"
```

---

## Patients

### `GET /patients/{patientId}` 🔒
Get a patient. **200** → `Patient` · **404** not found

### `GET /patients/by-user/{userId}` 🔒
Get the patient profile linked to a user id. **200** → `Patient` · **404** not found

### `PUT /patients/{patientId}` 🔒
Update profile fields. Send only the fields you want to change (partial update).

**Request (any subset of Patient fields)**
```json
{
  "bloodGroup": "O+",
  "allergies": "Penicillin",
  "emergencyPhone": "+1-555-9999",
  "documents": ["ultrasound-32w.pdf"]
}
```
**200** → updated `Patient` · **404** not found

### `GET /patients/{patientId}/appointments` 🔒
**200** → `Appointment[]`

### `GET /patients/{patientId}/medical-records` 🔒
**200** → `MedicalRecord[]`

### `GET /patients/{patientId}/payments` 🔒
**200** → `Payment[]`

### `GET /patients/{patientId}/prescriptions` 🔒
**200** → `Prescription[]`

### `GET /patients/{patientId}/vitals` 🔒
**200** → `Vitals[]`

---

## Appointments

### `GET /appointments` 🔒
List appointments, optionally filtered by query params (combinable).

**Query params:** `patientId` (optional), `doctorId` (optional)

**200** → `Appointment[]`

```bash
curl "http://localhost:8000/appointments?patientId=pat-1" -H "Authorization: Bearer $TOKEN"
curl "http://localhost:8000/appointments?doctorId=doc-1"  -H "Authorization: Bearer $TOKEN"
```

### `POST /appointments` 🔒
Create an appointment. `id`, `createdAt` are server-generated. `status` defaults to `scheduled`; `notes` defaults to `""`.

**Request**
```json
{
  "patientId": "pat-1",
  "doctorId": "doc-2",
  "departmentId": "dept-2",
  "date": "2026-07-15",
  "time": "11:00 AM",
  "reason": "Newborn consult",
  "notes": "",
  "status": "scheduled"
}
```
**201** → `Appointment` · **422** invalid body

### `GET /appointments/{appointmentId}` 🔒
**200** → `Appointment` · **404** not found

### `PUT /appointments/{appointmentId}` 🔒
Partial update — commonly to reschedule or change status.

**Request (any subset)**
```json
{ "status": "completed", "notes": "Visit complete", "date": "2026-07-16", "time": "9:00 AM" }
```
**200** → updated `Appointment` · **404** not found

---

## Medical Records

### `GET /medical-records` 🔒
**Query params:** `patientId` (optional), `appointmentId` (optional)

**200** → `MedicalRecord[]`

### `POST /medical-records` 🔒
**Request**
```json
{
  "patientId": "pat-1",
  "appointmentId": "apt-1",
  "doctorId": "doc-1",
  "diagnosis": "Healthy, 32 weeks",
  "prescription": "Continue prenatal vitamins",
  "labReports": ["CBC: Normal"]
}
```
**201** → `MedicalRecord`

---

## Payments

### `GET /payments` 🔒
**Query params:** `patientId` (optional), `appointmentId` (optional)

**200** → `Payment[]`

### `POST /payments` 🔒
**Request**
```json
{
  "appointmentId": "apt-1",
  "patientId": "pat-1",
  "amount": 2500,
  "paymentMethod": "Credit Card",
  "status": "completed"
}
```
`status` defaults to `pending` if omitted.

**201** → `Payment`

---

## Prescriptions

### `GET /prescriptions` 🔒
**Query params:** `patientId` (optional), `appointmentId` (optional)

**200** → `Prescription[]`

### `POST /prescriptions` 🔒
**Request**
```json
{
  "appointmentId": "apt-1",
  "patientId": "pat-1",
  "doctorId": "doc-1",
  "medicineName": "Iron Supplement",
  "dosage": "300 mg",
  "frequency": "Once daily",
  "duration": "Third trimester",
  "instructions": "Take with orange juice"
}
```
**201** → `Prescription`

---

## Vitals

### `GET /vitals` 🔒
**Query params:** `patientId` (optional), `appointmentId` (optional)

**200** → `Vitals[]`

### `POST /vitals` 🔒
**Request**
```json
{
  "appointmentId": "apt-1",
  "patientId": "pat-1",
  "doctorId": "doc-1",
  "temperature": 36.8,
  "bloodPressure": "120/80",
  "heartRate": 76,
  "respiratoryRate": 16,
  "weight": 70.0,
  "height": 165,
  "notes": "All normal"
}
```
**201** → `Vitals`

---

## Endpoint index

| # | Method | Path | Auth |
|---|--------|------|------|
| 1 | GET | `/` | 🔓 |
| 2 | POST | `/auth/register` | 🔓 |
| 3 | POST | `/auth/login` | 🔓 |
| 4 | GET | `/auth/me` | 🔒 |
| 5 | GET | `/departments` | 🔓 |
| 6 | GET | `/doctors` | 🔓 |
| 7 | GET | `/doctors/{doctorId}` | 🔓 |
| 8 | GET | `/doctors/by-user/{userId}` | 🔒 |
| 9 | GET | `/doctors/{doctorId}/appointments` | 🔒 |
| 10 | GET | `/patients/{patientId}` | 🔒 |
| 11 | GET | `/patients/by-user/{userId}` | 🔒 |
| 12 | PUT | `/patients/{patientId}` | 🔒 |
| 13 | GET | `/patients/{patientId}/appointments` | 🔒 |
| 14 | GET | `/patients/{patientId}/medical-records` | 🔒 |
| 15 | GET | `/patients/{patientId}/payments` | 🔒 |
| 16 | GET | `/patients/{patientId}/prescriptions` | 🔒 |
| 17 | GET | `/patients/{patientId}/vitals` | 🔒 |
| 18 | GET | `/appointments` | 🔒 |
| 19 | POST | `/appointments` | 🔒 |
| 20 | GET | `/appointments/{appointmentId}` | 🔒 |
| 21 | PUT | `/appointments/{appointmentId}` | 🔒 |
| 22 | GET | `/medical-records` | 🔒 |
| 23 | POST | `/medical-records` | 🔒 |
| 24 | GET | `/payments` | 🔒 |
| 25 | POST | `/payments` | 🔒 |
| 26 | GET | `/prescriptions` | 🔒 |
| 27 | POST | `/prescriptions` | 🔒 |
| 28 | GET | `/vitals` | 🔒 |
| 29 | POST | `/vitals` | 🔒 |

## Frontend mapping (lib/db.ts & lib/auth.ts → API)

| Frontend helper | API call |
|-----------------|----------|
| `authOperations.register` | `POST /auth/register` |
| `authOperations.login` | `POST /auth/login` |
| `authOperations.getSessionFromToken` | `GET /auth/me` |
| `dbOperations.getAllDepartments` | `GET /departments` |
| `dbOperations.getAllDoctors` | `GET /doctors` |
| `dbOperations.getDoctorById` / `getDoctor` | `GET /doctors/{id}` |
| `dbOperations.getDoctorByUserId` | `GET /doctors/by-user/{userId}` |
| `dbOperations.getPatient` | `GET /patients/{id}` |
| `dbOperations.getPatientByUserId` | `GET /patients/by-user/{userId}` |
| `dbOperations.updatePatient` | `PUT /patients/{id}` |
| `dbOperations.getAppointment` | `GET /appointments/{id}` |
| `dbOperations.createAppointment` | `POST /appointments` |
| `dbOperations.getAppointmentsByPatientId` | `GET /appointments?patientId=` or `/patients/{id}/appointments` |
| `dbOperations.getAppointmentsByDoctorId` | `GET /appointments?doctorId=` or `/doctors/{id}/appointments` |
| `dbOperations.updateAppointment` | `PUT /appointments/{id}` |
| `dbOperations.getMedicalRecordsByPatientId` | `GET /medical-records?patientId=` |
| `dbOperations.getMedicalRecordsByAppointment` | `GET /medical-records?appointmentId=` |
| `dbOperations.createMedicalRecord` | `POST /medical-records` |
| `dbOperations.getPaymentsByPatientId` | `GET /payments?patientId=` |
| `dbOperations.createPayment` | `POST /payments` |
| `dbOperations.getPrescriptionsByPatientId` | `GET /prescriptions?patientId=` |
| `dbOperations.getPrescriptionsByAppointment(Id)` | `GET /prescriptions?appointmentId=` |
| `dbOperations.createPrescription` | `POST /prescriptions` |
| `dbOperations.getVitalsByPatientId` | `GET /vitals?patientId=` |
| `dbOperations.getVitalsByAppointment(Id)` | `GET /vitals?appointmentId=` |
| `dbOperations.createVitals` | `POST /vitals` |

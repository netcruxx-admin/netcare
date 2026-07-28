# Hospital Appointment System - Complete Documentation

## Project Overview

A full-featured hospital appointment management system built with Next.js 16, React 19, and TypeScript. The system supports three user roles: Patients, Doctors, and Administrators with comprehensive features for appointment booking, medical records management, payments, and hospital operations.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS
- **State Management**: React Hooks, localStorage for session management
- **Database**: Mock in-memory database with localStorage persistence
- **UI Components**: Custom components with Lucide icons
- **Authentication**: Custom JWT-based authentication system

## Project Structure

```
/app
├── page.tsx                          # Landing page
├── login/page.tsx                    # Login page
├── register/page.tsx                 # Registration page
├── profile-setup/page.tsx            # Patient profile setup
├── dashboard/
│   ├── patient/page.tsx             # Patient dashboard
│   ├── doctor/page.tsx              # Doctor dashboard
│   └── admin/page.tsx               # Admin dashboard
├── appointment/
│   └── book/page.tsx                # Appointment booking
├── medical-history/page.tsx         # Medical records view
├── payments/page.tsx                # Payments & billing
└── layout.tsx                       # Root layout

/lib
├── db.ts                            # Mock database & operations
├── auth.ts                          # Authentication system

/components
└── ProtectedRoute.tsx               # Route protection component
```

## User Roles & Features

### 1. Patient Role
**Login Credentials**: 
- Email: `patient@example.com`
- Password: `password123`

**Features**:
- Profile setup with personal, contact, medical, and insurance information
- Book appointments with doctors across departments
- View upcoming and past appointments
- Access medical history and records
- View and manage payments
- Download invoices and prescriptions

**Key Pages**:
- `/dashboard/patient` - Main dashboard
- `/appointment/book` - Multi-step appointment booking
- `/medical-history` - Medical records and history
- `/payments` - Payment and billing interface

### 2. Doctor Role
**Login Credentials**:
- Email: `doctor@example.com`
- Password: `password123`

**Features**:
- View schedule and appointments
- Manage patient consultations
- Update patient medical records
- Add prescriptions and lab reports
- View patient medical history

**Key Pages**:
- `/dashboard/doctor` - Doctor's appointment schedule

### 3. Administrator Role
**Login Credentials**:
- Email: `admin@example.com`
- Password: `password123`

**Features**:
- Manage hospital departments
- Add and manage doctors
- Monitor system users and roles
- View appointment statistics
- System settings and configuration

**Key Pages**:
- `/dashboard/admin` - Admin control panel

## Key Features

### 1. Authentication System
- Multi-role login (Patient, Doctor, Admin)
- Custom registration with role selection
- Session management with localStorage
- Protected routes with role-based access control

### 2. Appointment Management
- **4-Step Booking Process**:
  1. Select Department
  2. Select Doctor
  3. Choose Date & Time
  4. Confirm with Payment
- Real-time availability checking
- Appointment confirmation and tracking
- Cancel or reschedule appointments

### 3. Patient Profile Management
- **Comprehensive Profile Setup**:
  - Personal Information (DOB, Gender)
  - Contact Details (Phone, Emergency Contact)
  - Medical Information (Blood Group, Allergies, Chronic Diseases)
  - Insurance Information (Provider, Policy Number)

### 4. Medical Records
- Patient medical history visualization
- Prescription management
- Lab report storage and access
- Doctor's notes and diagnosis
- Download records as PDF

### 5. Payment System
- Transaction history tracking
- Multiple payment method support
- Invoice generation
- Payment status management (Pending, Completed, Failed)
- Billing summary and reports

### 6. Admin Controls
- Department management (CRUD operations)
- Doctor management and scheduling
- User role management
- System-wide statistics and monitoring

## Database Schema

### Core Tables

**Users**
- id, email, password, name, role, createdAt

**Patients**
- id, userId, dateOfBirth, gender, bloodGroup, allergies
- chronicDiseases, emergencyContact, emergencyPhone
- medicalHistory, insuranceProvider, insuranceNumber, documents

**Doctors**
- id, userId, qualification, specialization
- experienceYears, consultationFee, availableSlots

**Appointments**
- id, patientId, doctorId, departmentId
- date, time, status, reason, notes, createdAt

**Departments**
- id, name, description

**MedicalRecords**
- id, patientId, appointmentId, doctorId
- diagnosis, prescription, labReports, createdAt

**Payments**
- id, appointmentId, patientId, amount
- status, paymentMethod, createdAt

## Authentication Flow

1. **Registration**: User selects role → Fills form → Account created → Redirects to profile setup (patients)
2. **Login**: Role selection → Email/Password → Session stored → Dashboard redirect
3. **Session Management**: Stored in localStorage as JSON → Validated on protected routes
4. **Logout**: Session cleared from localStorage → Redirect to home

## How to Use

### Getting Started
1. Start the dev server: `pnpm dev`
2. Navigate to `http://localhost:3000`
3. Click "Get Started" or use demo credentials to login

### Testing the System

**Patient Flow**:
1. Login as patient
2. Complete profile setup
3. Book an appointment
4. View medical history
5. Check payments

**Doctor Flow**:
1. Login as doctor
2. View scheduled appointments
3. Manage patient records

**Admin Flow**:
1. Login as admin
2. Manage departments and doctors
3. Monitor users

## Data Persistence

Data is stored in browser's localStorage using a mock database system:
- Database initialized on first load
- Auto-saves after each operation
- Persists across page refreshes
- Data stored in `hospital_db` key
- Session info in `auth_session` key

## Color Scheme

- **Primary**: Blue (#0066FF)
- **Success**: Green (#10B981)
- **Warning**: Orange (#F97316)
- **Error**: Red (#EF4444)
- **Background**: Light Blue (#EBF5FF)
- **Text**: Dark Gray (#1F2937)

## Component Architecture

- **Page Components**: Handle routing and layout
- **Utility Functions**: Database operations and authentication
- **Protected Routes**: Role-based access control
- **Custom Hooks**: Session management
- **Tailwind CSS**: Responsive design utilities

## Future Enhancements

1. Connect to real backend API (Node.js/Express)
2. Integrate with PostgreSQL database
3. Add video consultation feature
4. Email notifications for appointments
5. SMS reminders
6. Advanced analytics and reporting
7. Doctor availability calendar
8. Patient-doctor chat system
9. Payment gateway integration (Stripe)
10. Mobile app development

## Security Considerations

- Session stored in localStorage (production: use httpOnly cookies)
- Password stored in plain text (production: use bcrypt hashing)
- No HTTPS enforcement (production: enforce HTTPS)
- Mock JWT tokens (production: use proper JWT signing)
- Client-side validation only (production: add server-side validation)

## Browser Compatibility

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile browsers: ✅ Responsive design

## Performance

- Next.js Turbopack for fast builds
- Client-side rendering for interactivity
- Optimized image loading
- Responsive layouts with Tailwind CSS
- Minimal dependencies for fast load times

## Support & Troubleshooting

**Issue**: Session lost after page refresh
- **Solution**: Check localStorage availability and clear cache if needed

**Issue**: Can't book appointment
- **Solution**: Ensure profile is complete before booking

**Issue**: Data not persisting
- **Solution**: Check browser localStorage settings, ensure it's not in private mode

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Patient | patient@example.com | password123 |
| Doctor | doctor@example.com | password123 |
| Admin | admin@example.com | password123 |

## License

Open source - feel free to modify and use for your needs.

## Created with v0

This Hospital Appointment System was created with v0 by Vercel - an AI-powered assistant for building web applications.

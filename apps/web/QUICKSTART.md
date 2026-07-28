# Hospital Appointment System - Quick Start Guide

## 🚀 Getting Started

### Running the Application

The dev server is already running on `http://localhost:3000`

Simply open the Preview to see your Hospital Appointment System in action!

## 👥 Demo Accounts

Use these credentials to login and explore the system:

### Patient Account
- **Email**: `patient@example.com`
- **Password**: `password123`

### Doctor Account
- **Email**: `doctor@example.com`
- **Password**: `password123`

### Admin Account
- **Email**: `admin@example.com`
- **Password**: `password123`

## 📋 Available Pages

### Public Pages
- `/` - Landing page with feature overview
- `/login` - Login page with role selection
- `/register` - Registration with role-based setup

### Patient Pages
- `/dashboard/patient` - Main patient dashboard
- `/profile-setup` - Complete patient profile information
- `/appointment/book` - 4-step appointment booking wizard
- `/medical-history` - View medical records and history
- `/payments` - Payment history and billing

### Doctor Pages
- `/dashboard/doctor` - Doctor's appointment schedule and patient management

### Admin Pages
- `/dashboard/admin` - Hospital management and system configuration

## ✨ Key Features to Try

### 1. Patient Experience
1. Click "Get Started" on landing page
2. Choose "Patient" role and register
3. Complete the 4-step profile setup
4. Navigate to "Book New Appointment"
5. Select department → doctor → date/time
6. View upcoming appointments in dashboard
7. Check medical history and payments

### 2. Doctor Experience
1. Login with doctor credentials
2. View scheduled appointments
3. Manage patient consultations
4. Access patient records

### 3. Admin Experience
1. Login with admin credentials
2. Manage departments and doctors
3. Monitor system users
4. View hospital statistics

## 🎨 UI Components

The application features:
- Clean, professional medical interface
- Responsive design for all devices
- Intuitive navigation
- Role-based color schemes:
  - **Blue**: Primary actions and patient features
  - **Green**: Success and confirmations
  - **Red**: Alerts and cancellations
  - **Purple**: Admin and system settings

## 📱 Responsive Design

The application works perfectly on:
- Desktop computers
- Tablets
- Mobile phones
- All modern browsers

## 💾 Data Storage

All data is stored in your browser's localStorage:
- Automatically saves after each action
- Persists across page refreshes
- Can be cleared from browser settings

## 🔐 Security Features

- Role-based access control
- Session management
- Protected routes
- Type-safe authentication

## 📞 System Walkthrough

### Patient Registration & Booking Flow
1. **Registration**: 3 roles available
2. **Profile Setup**: 4 steps for comprehensive information
3. **Appointment Booking**: 4-step guided process
4. **Medical Records**: Access history and documents
5. **Payments**: View and download invoices

### Doctor Management
- View daily appointments
- Access patient medical history
- Add notes and prescriptions
- Monitor patient care

### Admin Controls
- Department CRUD operations
- Doctor management
- User role management
- System statistics

## 🔄 Sample Data

The system comes with pre-populated:
- 3 demo user accounts (one for each role)
- 5 hospital departments
- 1 sample doctor
- 1 sample patient
- Complete appointment workflow data

## 🚨 Troubleshooting

**Q: Can't login?**
- Use demo credentials provided above
- Check email and password spelling

**Q: Data not saving?**
- Check browser localStorage is enabled
- Not in private/incognito mode

**Q: Can't see dashboard?**
- Login first at `/login`
- System redirects unlogged users to login page

## 📚 What's Included

✅ Complete authentication system
✅ Multi-role access control
✅ Appointment booking workflow
✅ Medical records management
✅ Payment tracking
✅ Admin dashboard
✅ Responsive UI design
✅ Form validation
✅ State management
✅ Mock database with localStorage

## 🎯 Next Steps

1. **Explore the UI**: Browse through all pages and features
2. **Test Workflows**: Try booking an appointment as a patient
3. **Admin Panel**: Manage departments and doctors
4. **Customize**: Modify colors, departments, and doctors as needed
5. **Extend**: Add more features like video consultations or notifications

## 📖 Full Documentation

For detailed information about the system architecture, database schema, and advanced features, see `HOSPITAL_SYSTEM.md`

## 💡 Tips & Tricks

- The demo email and password are pre-filled in login form
- Use the 4-step appointment wizard to understand the full booking flow
- Admin panel shows real statistics from the database
- All patient data is profile-specific
- Medical records sync with appointment history

## 🎉 You're All Set!

Your Hospital Appointment System is ready to use. Start by:
1. Going to the home page
2. Clicking "Get Started" 
3. Creating an account
4. Exploring the features

Happy exploring! 🏥

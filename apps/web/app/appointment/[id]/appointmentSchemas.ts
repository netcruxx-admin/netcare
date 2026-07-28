// Validation schemas and select-option constants for the appointment detail
// page's modals (reschedule / edit / vitals / prescription).
import * as Yup from 'yup';

export const today = new Date().toISOString().split('T')[0];

export const rescheduleSchema = Yup.object({
  date: Yup.string().required('Date is required'),
  time: Yup.string().required('Please select a time slot'),
});

const numOpt = Yup.number()
  .transform((v, o) => (o === '' ? undefined : v))
  .typeError('Must be a number')
  .min(0, 'Cannot be negative');

export const editSchema = Yup.object({
  status: Yup.string().oneOf(['scheduled', 'completed', 'cancelled']).required('Select a status'),
  reason: Yup.string().max(200, 'Too long'),
});

export const vitalsSchema = Yup.object({
  temperature: numOpt,
  heartRate: numOpt,
  respiratoryRate: numOpt,
  weight: numOpt,
  height: numOpt,
  bloodPressure: Yup.string().max(15, 'Too long'),
  notes: Yup.string().max(300, 'Too long'),
});

export const rxSchema = Yup.object({
  medicineName: Yup.string().trim().required('Select a medicine'),
  dosage: Yup.string().trim().required('Dosage is required').max(50, 'Too long'),
  frequency: Yup.string().trim().required('Frequency is required').max(50, 'Too long'),
  duration: Yup.string().trim().required('Duration is required').max(50, 'Too long'),
  instructions: Yup.string().max(300, 'Too long'),
});

export const statusOptions = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const timeSlots = [
  { value: '09:00 AM', label: '09:00 AM' },
  { value: '09:30 AM', label: '09:30 AM' },
  { value: '10:00 AM', label: '10:00 AM' },
  { value: '10:30 AM', label: '10:30 AM' },
  { value: '02:00 PM', label: '02:00 PM' },
  { value: '02:30 PM', label: '02:30 PM' },
  { value: '03:00 PM', label: '03:00 PM' },
  { value: '03:30 PM', label: '03:30 PM' },
];

/**
 * The OPD/IPD clinical-encounter sections (Vitals, Prescriptions, Injection
 * Orders, Lab Orders) are shared between the appointment detail page and the
 * IPD admission workspace — same charting, same ordering, just linked to a
 * different parent record. `EncounterContext` is that one linking id, spread
 * straight into a create call's body (`{ ...context, patientId, doctorId }`)
 * so each section stays agnostic to which context it was given.
 */
export type EncounterContext = { appointmentId: string } | { admissionId: string };

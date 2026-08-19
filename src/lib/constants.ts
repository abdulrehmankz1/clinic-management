// Shared, market-agnostic option lists. Currency and timezone are tenant-level
// settings with Pakistan defaults — nothing region-specific is hardcoded.

export const ROLES = ['superAdmin', 'owner', 'doctor', 'receptionist'] as const
export type Role = (typeof ROLES)[number]

export const TENANT_ROLES = ['owner', 'doctor', 'receptionist'] as const

export const APPOINTMENT_STATUSES = [
  'scheduled',
  'checked-in',
  'completed',
  'cancelled',
  'no-show',
] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

// Legal status transitions (spec §8.4). Terminal states have no outgoing edges.
export const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['checked-in', 'cancelled', 'no-show'],
  'checked-in': ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  'no-show': [],
}

// Statuses that occupy a doctor's slot for conflict detection.
export const ACTIVE_STATUSES: AppointmentStatus[] = ['scheduled', 'checked-in']

export const GENDERS = ['male', 'female', 'other'] as const

// Doctor availability patterns (covers daily / alternate / weekly / on-call / surgeon).
export const AVAILABILITY_TYPES = [
  { label: 'Regular (set days & hours)', value: 'regular' },
  { label: 'On call', value: 'onCall' },
  { label: 'By appointment (e.g. surgeon)', value: 'byAppointment' },
] as const
export type AvailabilityType = (typeof AVAILABILITY_TYPES)[number]['value']

export const WEEKDAYS = [
  { label: 'Sun', value: 'sun' },
  { label: 'Mon', value: 'mon' },
  { label: 'Tue', value: 'tue' },
  { label: 'Wed', value: 'wed' },
  { label: 'Thu', value: 'thu' },
  { label: 'Fri', value: 'fri' },
  { label: 'Sat', value: 'sat' },
] as const
export const ALL_DAYS = WEEKDAYS.map((d) => d.value)

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

// --- v2: clinical loop ---

// Appointment statuses on which a Visit (consultation) may be recorded.
export const VISIT_ALLOWED_APPOINTMENT_STATUSES: AppointmentStatus[] = ['checked-in', 'completed']

// Prescription dosing frequencies (standard medical shorthand). `other` reveals a note.
export const PRESCRIPTION_FREQUENCIES = [
  { label: 'OD — once a day', value: 'od' },
  { label: 'BD — twice a day', value: 'bd' },
  { label: 'TDS — thrice a day', value: 'tds' },
  { label: 'QID — four times a day', value: 'qid' },
  { label: 'SOS — as needed', value: 'sos' },
  { label: 'Other', value: 'other' },
] as const
export type PrescriptionFrequency = (typeof PRESCRIPTION_FREQUENCIES)[number]['value']

export const PAYMENT_METHODS = [
  { label: 'Cash', value: 'cash' },
  { label: 'Card', value: 'card' },
  { label: 'Bank transfer', value: 'bank-transfer' },
  { label: 'Other', value: 'other' },
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

// Derived — never set by a client. unpaid (paid=0) / partial / paid (balance=0).
export const INVOICE_STATUSES = ['unpaid', 'partial', 'paid'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

// Curated currency list (a full ISO list is overkill). `code` feeds Intl.NumberFormat.
export const CURRENCIES = [
  { label: 'PKR — Pakistani Rupee', value: 'PKR' },
  { label: 'USD — US Dollar', value: 'USD' },
  { label: 'GBP — British Pound', value: 'GBP' },
  { label: 'AED — UAE Dirham', value: 'AED' },
  { label: 'SAR — Saudi Riyal', value: 'SAR' },
  { label: 'INR — Indian Rupee', value: 'INR' },
] as const

// Curated IANA timezone list (a full dropdown is overkill for the launch markets).
export const TIMEZONES = [
  { label: 'Asia/Karachi (PKT)', value: 'Asia/Karachi' },
  { label: 'Asia/Dubai (GST)', value: 'Asia/Dubai' },
  { label: 'Asia/Riyadh (AST)', value: 'Asia/Riyadh' },
  { label: 'Asia/Kolkata (IST)', value: 'Asia/Kolkata' },
  { label: 'Europe/London (GMT/BST)', value: 'Europe/London' },
  { label: 'America/New_York (ET)', value: 'America/New_York' },
] as const

export const DEFAULT_CURRENCY = 'PKR'
export const DEFAULT_TIMEZONE = 'Asia/Karachi'
export const DEFAULT_APPOINTMENT_DURATION = 15
export const DEFAULT_OPEN_TIME = '09:00'
export const DEFAULT_CLOSE_TIME = '21:00'

// Self-serve signup (v3 spec §3.2): the country select suggests sensible
// currency/timezone defaults (still editable). Keys are the labels shown in the
// form; values seed the new tenant's settings.
export const COUNTRY_DEFAULTS = [
  { label: 'Pakistan', currency: 'PKR', timezone: 'Asia/Karachi' },
  { label: 'United Arab Emirates', currency: 'AED', timezone: 'Asia/Dubai' },
  { label: 'Saudi Arabia', currency: 'SAR', timezone: 'Asia/Riyadh' },
  { label: 'India', currency: 'INR', timezone: 'Asia/Kolkata' },
  { label: 'United Kingdom', currency: 'GBP', timezone: 'Europe/London' },
  { label: 'United States', currency: 'USD', timezone: 'America/New_York' },
] as const
export const DEFAULT_COUNTRY = 'Pakistan'

// v3 — audit log actions (spec §2.2). Append-only record of sensitive actions.
export const AUDIT_ACTIONS = [
  { value: 'appointment.created', label: 'Appointment booked' },
  { value: 'appointment.cancelled', label: 'Appointment cancelled' },
  { value: 'appointment.status-changed', label: 'Appointment status changed' },
  { value: 'invoice.voided', label: 'Invoice voided' },
  { value: 'payment.recorded', label: 'Payment recorded' },
  { value: 'user.created', label: 'Staff added' },
  { value: 'user.deactivated', label: 'Staff deactivated' },
  { value: 'user.role-changed', label: 'Role changed' },
  { value: 'settings.updated', label: 'Settings updated' },
  { value: 'tenant.suspended', label: 'Clinic suspended' },
  { value: 'tenant.reactivated', label: 'Clinic reactivated' },
  { value: 'plan.upgrade-requested', label: 'Upgrade requested' },
  { value: 'plan.upgrade-rejected', label: 'Upgrade declined' },
  { value: 'plan.changed', label: 'Plan changed' },
  // v4 — reports & exports. Patient exports carry PII (phone numbers), so every
  // export is an auditable event.
  { value: 'export.generated', label: 'Data exported' },
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]['value']

// Stable error codes — UI maps these to friendly messages (spec §9.1).
export const ERROR_CODES = {
  SLOT_TAKEN: 'SLOT_TAKEN',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',
  TENANT_PENDING: 'TENANT_PENDING',
  USER_INACTIVE: 'USER_INACTIVE',
  PLAN_LIMIT: 'PLAN_LIMIT',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION: 'VALIDATION',
  // v3 — self-serve onboarding
  SIGNUP_EMAIL_TAKEN: 'SIGNUP_EMAIL_TAKEN',
  SIGNUP_RATE_LIMITED: 'SIGNUP_RATE_LIMITED',
  SIGNUP_FAILED: 'SIGNUP_FAILED',
  // v3 — reminders (internal; never surfaced in the UI)
  CRON_UNAUTHORIZED: 'CRON_UNAUTHORIZED',
  // backlog — email hardening
  RESET_TOKEN_INVALID: 'RESET_TOKEN_INVALID',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  VERIFY_TOKEN_INVALID: 'VERIFY_TOKEN_INVALID',
  // v2 — clinical loop
  VISIT_EXISTS: 'VISIT_EXISTS',
  INVALID_APPOINTMENT_STATE: 'INVALID_APPOINTMENT_STATE',
  PAYMENT_EXCEEDS_BALANCE: 'PAYMENT_EXCEEDS_BALANCE',
  INVOICE_VOIDED: 'INVOICE_VOIDED',
  INVOICE_LOCKED: 'INVOICE_LOCKED',
} as const

// Maps server error codes to friendly UI messages (spec §9.1). Raw server text is
// never shown to the user; a cross-tenant resource's existence is never revealed.

import { ERROR_CODES } from './constants'

const MESSAGES: Record<string, string> = {
  [ERROR_CODES.SLOT_TAKEN]: 'That slot was just taken. Pick another time.',
  [ERROR_CODES.INVALID_TRANSITION]: "That status change isn't allowed.",
  [ERROR_CODES.TENANT_SUSPENDED]: "This clinic's account is suspended. Contact support.",
  [ERROR_CODES.PLAN_LIMIT]: 'Your plan limit has been reached. Request an upgrade to add more.',
  [ERROR_CODES.USER_INACTIVE]: 'Your account has been deactivated. Contact your clinic owner.',
  [ERROR_CODES.FORBIDDEN]: "You don't have permission to do that.",
  [ERROR_CODES.VALIDATION]: 'Please check the form and try again.',
  // v2 — clinical loop
  [ERROR_CODES.VISIT_EXISTS]: 'A visit has already been recorded for this appointment.',
  [ERROR_CODES.INVALID_APPOINTMENT_STATE]: 'Check the patient in before recording a visit.',
  [ERROR_CODES.PAYMENT_EXCEEDS_BALANCE]: 'Payment exceeds the remaining balance.',
  [ERROR_CODES.INVOICE_VOIDED]: "This invoice has been voided and can't be changed.",
  [ERROR_CODES.INVOICE_LOCKED]:
    "Line items can't be changed after a payment. Void the invoice and create a new one.",
}

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string }

/** Extract a stable code + friendly message from a thrown Payload/API error. */
export function toActionError(err: unknown): { code: string; message: string } {
  const anyErr = err as { data?: { code?: string }; code?: string; message?: string }
  const code = anyErr?.data?.code || anyErr?.code || 'UNKNOWN'
  // Prefer a catalog message; fall back to the server message for validation,
  // otherwise a generic line.
  const message =
    MESSAGES[code] ||
    (typeof anyErr?.message === 'string' && code === 'UNKNOWN'
      ? anyErr.message
      : 'Something went wrong. Please try again.')
  return { code, message }
}

export function friendly(code: string): string {
  return MESSAGES[code] || 'Something went wrong. Please try again.'
}

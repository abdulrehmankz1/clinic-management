// Subscription plans & limits (v3 spec §2.1, §4). Limits live in code, not the DB:
// at this scale plans change rarely and a code review is an acceptable, simple gate
// for changing them. This file is deliberately PURE (no payload imports) so the
// owner-facing plan page can import it client-side; enforcement lives in
// src/hooks/planLimit.ts.

export const PLAN_LIMITS = {
  free: { doctors: 1, patients: 50, label: 'Free' },
  clinic: { doctors: 5, patients: null, label: 'Clinic' }, // null = unlimited
  plus: { doctors: null, patients: null, label: 'Plus' },
} as const

export type Plan = keyof typeof PLAN_LIMITS
export type LimitedResource = 'doctors' | 'patients'

export const PLANS = Object.keys(PLAN_LIMITS) as Plan[]

/** Narrow an untrusted value to a known plan, defaulting to `free`. */
export function asPlan(value: unknown): Plan {
  return typeof value === 'string' && value in PLAN_LIMITS ? (value as Plan) : 'free'
}

/** The cap for a resource on a plan; `null` means unlimited. */
export function limitFor(plan: Plan, resource: LimitedResource): number | null {
  return PLAN_LIMITS[plan][resource]
}

export const planLabel = (plan: Plan): string => PLAN_LIMITS[plan].label

/**
 * Usage summary for a progress bar. `limit: null` ⇒ unlimited (no bar).
 * `atLimit` drives the "Request upgrade" prompt; `near` (≥80%) drives a quiet note.
 */
export function usage(
  plan: Plan,
  resource: LimitedResource,
  count: number,
): { count: number; limit: number | null; atLimit: boolean; near: boolean; ratio: number } {
  const limit = limitFor(plan, resource)
  if (limit === null) return { count, limit: null, atLimit: false, near: false, ratio: 0 }
  const ratio = limit === 0 ? 1 : Math.min(1, count / limit)
  return { count, limit, atLimit: count >= limit, near: count >= limit * 0.8, ratio }
}

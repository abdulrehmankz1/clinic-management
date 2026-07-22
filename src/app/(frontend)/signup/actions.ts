'use server'

import { headers } from 'next/headers'
import { getPayloadClient } from '@/lib/auth'
import { toActionError, type ActionResult } from '@/lib/errors'
import { signupClinic, type SignupInput } from '@/lib/signup'
import { sendVerificationEmail } from '@/lib/verification'
import { rateLimit } from '@/lib/rateLimit'
import { ERROR_CODES } from '@/lib/constants'

// Abuse guards (spec §3.2): paranoid-but-cheap. Same IP capped per hour; a honeypot
// field + minimum fill time silently rejects naive bots. When email is configured
// the owner also confirms their address before the clinic queues for approval
// (BACKLOG §1.1); without RESEND_API_KEY the step degrades away gracefully.
const MAX_SIGNUPS_PER_HOUR = 3
const MIN_FILL_MS = 2000

type SignupFormInput = SignupInput & {
  /** Honeypot — real users never fill this hidden field. */
  company?: string
  /** Client timestamp (ms) when the form mounted; bots submit too fast. */
  startedAt?: number
}

async function clientIp(): Promise<string> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? 'unknown'
}

export async function signupAction(
  input: SignupFormInput,
): Promise<ActionResult<{ slug: string; verifyEmail: boolean }>> {
  // Bot traps — fail silently as a generic validation error (don't teach the bot).
  if (input.company) {
    return { ok: false, code: ERROR_CODES.VALIDATION, message: 'Something went wrong. Please try again.' }
  }
  if (input.startedAt && Date.now() - input.startedAt < MIN_FILL_MS) {
    return { ok: false, code: ERROR_CODES.VALIDATION, message: 'Something went wrong. Please try again.' }
  }

  const ip = await clientIp()
  if (!rateLimit(`signup:${ip}`, MAX_SIGNUPS_PER_HOUR).allowed) {
    return {
      ok: false,
      code: ERROR_CODES.SIGNUP_RATE_LIMITED,
      message: 'Too many signups from this network. Try again later.',
    }
  }

  try {
    const payload = await getPayloadClient()
    const { slug, verificationToken } = await signupClinic(payload, {
      clinicName: input.clinicName,
      phone: input.phone,
      city: input.city,
      country: input.country,
      currency: input.currency,
      timezone: input.timezone,
      ownerName: input.ownerName,
      email: input.email,
      password: input.password,
    })

    // Confirmation link goes out best-effort — a mail hiccup must not undo the
    // signup; the "check your inbox" screen offers a resend.
    if (verificationToken) {
      const sent = await sendVerificationEmail({
        to: input.email.trim().toLowerCase(),
        clinicName: input.clinicName.trim(),
        token: verificationToken,
      })
      if (!sent.sent) {
        payload.logger?.info?.({ skipped: sent.skipped }, 'signup verification email not sent')
      }
    }

    // No auto-login: the clinic is created `pending` and a super admin must approve
    // it before the owner can sign in. The page shows a "pending approval" state.
    return { ok: true, data: { slug, verifyEmail: Boolean(verificationToken) } }
  } catch (err) {
    const mapped = toActionError(err)
    // Surface known signup/validation codes; otherwise a clean generic failure.
    const known = [
      ERROR_CODES.SIGNUP_EMAIL_TAKEN,
      ERROR_CODES.VALIDATION,
      ERROR_CODES.PLAN_LIMIT,
    ] as string[]
    if (known.includes(mapped.code)) return { ok: false, ...mapped }
    return { ok: false, code: ERROR_CODES.SIGNUP_FAILED, message: 'We couldn’t create your clinic. Please try again.' }
  }
}

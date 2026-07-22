'use server'

import { headers } from 'next/headers'
import { getPayloadClient } from '@/lib/auth'
import { resendVerification } from '@/lib/verification'
import { rateLimit } from '@/lib/rateLimit'
import { ERROR_CODES } from '@/lib/constants'
import type { ActionResult } from '@/lib/errors'

// Same posture as forgot-password: rate-limited per IP, and success is always
// generic — whether the account exists (or is already verified) stays private.
const MAX_RESENDS_PER_HOUR = 5

async function clientIp(): Promise<string> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? 'unknown'
}

export async function resendVerificationAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const email = String(formData.get('email') || '')
    .trim()
    .toLowerCase()
  if (!email) {
    return { ok: false, code: ERROR_CODES.VALIDATION, message: 'Enter your email address.' }
  }

  const ip = await clientIp()
  if (!rateLimit(`verify-resend:${ip}`, MAX_RESENDS_PER_HOUR).allowed) {
    return {
      ok: false,
      code: ERROR_CODES.SIGNUP_RATE_LIMITED,
      message: 'Too many requests from this network. Try again later.',
    }
  }

  const payload = await getPayloadClient()
  const summary = await resendVerification(payload, email)
  if (!summary.sent) {
    payload.logger?.info?.({ skipped: summary.skipped }, 'verification resend not sent')
  }
  return { ok: true, data: null }
}

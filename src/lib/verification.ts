// Email verification for self-serve signups (BACKLOG §1.1). A signup only proves
// someone can type an email; this proves they own it. Only the sha256 hash of the
// token is stored — a database leak alone can't verify anyone. Graceful when email
// isn't configured: signupClinic simply skips the step and owners stay verified,
// exactly like the rest of the optional email infrastructure.

import crypto from 'node:crypto'
import type { Payload } from 'payload'
import { APIError } from 'payload'
import type { Tenant, User } from '@/payload-types'
import { ERROR_CODES } from './constants'
import { appBaseUrl, sendEmail, type SendEmail } from './email'

export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/** Unverified self-serve signups older than this are purged by the cron. */
export const UNVERIFIED_PURGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex')

export type VerificationToken = { token: string; hash: string; expiresAt: Date }

export function createVerificationToken(now: Date = new Date()): VerificationToken {
  const token = crypto.randomBytes(32).toString('hex')
  return { token, hash: hashToken(token), expiresAt: new Date(now.getTime() + VERIFY_TOKEN_TTL_MS) }
}

export type VerifySendSummary = { sent: boolean; skipped?: string }

/** Mail the confirmation link to a freshly signed-up owner. */
export async function sendVerificationEmail(
  { to, clinicName, token }: { to: string; clinicName: string; token: string },
  send: SendEmail = sendEmail,
): Promise<VerifySendSummary> {
  const link = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`
  const res = await send({
    to,
    subject: `Confirm your email for ${clinicName}`,
    html: `<div style="font-family:Segoe UI,system-ui,sans-serif;color:#1c2422;max-width:520px">
      <h2 style="margin:0 0 2px;font-size:18px">One click to go</h2>
      <p style="margin:0 0 16px;color:#4b5f5a;font-size:14px">
        Confirm this is your email and ${clinicName} moves into the approval queue.
      </p>
      <p style="margin:0 0 18px">
        <a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">
          Confirm my email
        </a>
      </p>
      <p style="margin:0;font-size:12px;color:#8aa19b">
        The link expires in 24 hours. If you didn't sign up for matab, ignore this email.
      </p>
    </div>`,
  })
  if (res.ok) return { sent: true }
  return { sent: false, skipped: res.skipped ? 'email not configured' : res.error }
}

/**
 * Flip a user to verified from an emailed token. Invalid, expired and already-used
 * tokens all collapse into one VERIFY_TOKEN_INVALID.
 */
export async function verifyEmailToken(
  payload: Payload,
  token: string,
  now: Date = new Date(),
): Promise<{ email: string }> {
  const invalid = () =>
    new APIError('This verification link is invalid or has expired.', 400, {
      code: ERROR_CODES.VERIFY_TOKEN_INVALID,
    })
  if (!token) throw invalid()

  const found = await payload.find({
    collection: 'users',
    where: { verifyTokenHash: { equals: hashToken(token) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true, // the expiry lives in a hidden field
  })
  const user = found.docs[0] as User | undefined
  if (!user) throw invalid()
  if (!user.verifyTokenExp || new Date(user.verifyTokenExp) < now) throw invalid()

  await payload.update({
    collection: 'users',
    id: user.id,
    overrideAccess: true,
    data: { emailVerified: true, verifyTokenHash: null, verifyTokenExp: null } as never,
  })
  return { email: user.email }
}

export type ResendSummary = { sent: boolean; skipped?: string }

/**
 * Re-issue a verification link. Quiet about unknown or already-verified emails —
 * the caller shows the same "check your inbox" message either way.
 */
export async function resendVerification(
  payload: Payload,
  email: string,
  send: SendEmail = sendEmail,
  now: Date = new Date(),
): Promise<ResendSummary> {
  const found = await payload.find({
    collection: 'users',
    where: { email: { equals: email.trim().toLowerCase() } },
    limit: 1,
    depth: 1, // tenant name goes in the email subject
    overrideAccess: true,
  })
  const user = found.docs[0] as User | undefined
  if (!user) return { sent: false, skipped: 'no account for that email' }
  if (user.emailVerified !== false) return { sent: false, skipped: 'already verified' }

  // A new token replaces the old one — old links die with the old hash.
  const fresh = createVerificationToken(now)
  await payload.update({
    collection: 'users',
    id: user.id,
    overrideAccess: true,
    data: { verifyTokenHash: fresh.hash, verifyTokenExp: fresh.expiresAt.toISOString() } as never,
  })

  const clinicName = (user.tenant as Tenant | null)?.name ?? 'your clinic'
  return sendVerificationEmail({ to: user.email, clinicName, token: fresh.token }, send)
}

export type PurgeSummary = { purged: string[] }

/**
 * Delete self-serve signups whose owner never verified within the grace window
 * (BACKLOG §1.1 "cleanup — orphan na rahein"). Only `pending` clinics from
 * self-serve onboarding qualify; anything a super admin touched (approved,
 * rejected) or created manually is never purged. Sample data goes with the tenant.
 */
export async function purgeExpiredUnverifiedSignups(
  payload: Payload,
  { now = new Date(), olderThanMs = UNVERIFIED_PURGE_AFTER_MS }: { now?: Date; olderThanMs?: number } = {},
): Promise<PurgeSummary> {
  const cutoff = new Date(now.getTime() - olderThanMs)
  const stale = await payload.find({
    collection: 'tenants',
    where: {
      status: { equals: 'pending' },
      onboardingSource: { equals: 'self-serve' },
      createdAt: { less_than: cutoff.toISOString() },
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  const purged: string[] = []
  for (const tenant of stale.docs as Tenant[]) {
    try {
      const owners = await payload.find({
        collection: 'users',
        where: { tenant: { equals: tenant.id }, role: { equals: 'owner' } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const owner = owners.docs[0] as User | undefined
      // Verified owners keep their spot in the queue however long approval takes.
      if (!owner || owner.emailVerified !== false) continue

      // Children before parent so nothing dangles (same order as the test wipe).
      for (const collection of ['appointments', 'patients', 'users'] as const) {
        await payload.delete({
          collection,
          where: { tenant: { equals: tenant.id } },
          overrideAccess: true,
        })
      }
      await payload.delete({ collection: 'tenants', id: tenant.id, overrideAccess: true })
      purged.push(tenant.name)
    } catch (err) {
      // One stubborn tenant must never stop the sweep.
      payload.logger?.error?.({ err, tenant: tenant.name }, 'unverified purge failed (continuing)')
    }
  }
  return { purged }
}

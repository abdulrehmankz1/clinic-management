import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { Payload } from 'payload'
import { getTestPayload, wipe } from './fixtures'
import { signupClinic } from '@/lib/signup'
import {
  verifyEmailToken,
  resendVerification,
  purgeExpiredUnverifiedSignups,
  UNVERIFIED_PURGE_AFTER_MS,
} from '@/lib/verification'
import { ERROR_CODES } from '@/lib/constants'
import type { SendEmailInput } from '@/lib/email'

// Backlog §1.1 — email verification at signup. signupClinic is driven with
// requireEmailVerification forced on (tests run without RESEND_API_KEY, where the
// step would otherwise degrade away) and the raw token captured from its result.

describe('backlog — email verification at signup', () => {
  let payload: Payload

  const sent: SendEmailInput[] = []
  const capture = async (input: SendEmailInput) => {
    sent.push(input)
    return { ok: true }
  }

  beforeAll(async () => {
    payload = await getTestPayload()
  })
  beforeEach(async () => {
    await wipe(payload)
    sent.length = 0
  })

  let n = 0
  const signup = (over: { email?: string; requireVerify?: boolean } = {}) => {
    n += 1
    return signupClinic(
      payload,
      {
        clinicName: `Verify Test Clinic ${n}`,
        phone: '+92512345678',
        currency: 'PKR',
        timezone: 'Asia/Karachi',
        ownerName: 'Sara Ahmed',
        email: over.email ?? `owner-${n}@verify.test`,
        password: 'password123',
      },
      { requireEmailVerification: over.requireVerify ?? true },
    )
  }

  async function rejectsWithCode(promise: Promise<unknown>, code: string) {
    let thrown: { data?: { code?: string }; code?: string } | undefined
    try {
      await promise
    } catch (e) {
      thrown = e as typeof thrown
    }
    expect(thrown, 'expected the operation to reject').toBeTruthy()
    expect(thrown?.data?.code ?? thrown?.code).toBe(code)
  }

  it('creates an unverified owner with a token, and skips the step when not required', async () => {
    const withVerify = await signup({ email: 'needs-verify@verify.test' })
    expect(withVerify.verificationToken).toBeTruthy()
    const owner = await payload.findByID({ collection: 'users', id: withVerify.ownerId, overrideAccess: true })
    expect(owner.emailVerified).toBe(false)

    const without = await signup({ email: 'no-verify@verify.test', requireVerify: false })
    expect(without.verificationToken).toBeUndefined()
    const owner2 = await payload.findByID({ collection: 'users', id: without.ownerId, overrideAccess: true })
    expect(owner2.emailVerified).toBe(true)
  })

  it('blocks login with EMAIL_NOT_VERIFIED before the pending-tenant gate', async () => {
    const res = await signup({ email: 'blocked@verify.test' })

    await rejectsWithCode(
      payload.login({ collection: 'users', data: { email: 'blocked@verify.test', password: 'password123' } }),
      ERROR_CODES.EMAIL_NOT_VERIFIED,
    )

    // Verifying moves the block to the next gate: the clinic is still pending.
    await verifyEmailToken(payload, res.verificationToken!)
    await rejectsWithCode(
      payload.login({ collection: 'users', data: { email: 'blocked@verify.test', password: 'password123' } }),
      ERROR_CODES.TENANT_PENDING,
    )
  })

  it('verifies exactly once — the used token dies', async () => {
    const res = await signup()
    const { email } = await verifyEmailToken(payload, res.verificationToken!)
    expect(email).toBe(`owner-${n}@verify.test`)

    const owner = await payload.findByID({ collection: 'users', id: res.ownerId, overrideAccess: true })
    expect(owner.emailVerified).toBe(true)

    await rejectsWithCode(
      verifyEmailToken(payload, res.verificationToken!),
      ERROR_CODES.VERIFY_TOKEN_INVALID,
    )
  })

  it('rejects garbage and expired tokens with VERIFY_TOKEN_INVALID', async () => {
    const res = await signup()
    await rejectsWithCode(verifyEmailToken(payload, 'garbage-token'), ERROR_CODES.VERIFY_TOKEN_INVALID)

    // Same token, evaluated a day past its expiry.
    const dayLater = new Date(Date.now() + 25 * 60 * 60 * 1000)
    await rejectsWithCode(
      verifyEmailToken(payload, res.verificationToken!, dayLater),
      ERROR_CODES.VERIFY_TOKEN_INVALID,
    )
  })

  it('resend replaces the token — old link dies, new one works', async () => {
    const res = await signup({ email: 'resend@verify.test' })

    const summary = await resendVerification(payload, 'resend@verify.test', capture)
    expect(summary.sent).toBe(true)
    expect(sent).toHaveLength(1)

    const match = sent[0]!.html.match(/verify-email\?token=([A-Za-z0-9%._-]+)/)
    const freshToken = decodeURIComponent(match![1]!)

    await rejectsWithCode(verifyEmailToken(payload, res.verificationToken!), ERROR_CODES.VERIFY_TOKEN_INVALID)
    await verifyEmailToken(payload, freshToken)

    // Verified accounts and unknown emails both stay quiet.
    expect((await resendVerification(payload, 'resend@verify.test', capture)).sent).toBe(false)
    expect((await resendVerification(payload, 'nobody@verify.test', capture)).sent).toBe(false)
    expect(sent).toHaveLength(1)
  })

  it('purges only stale unverified self-serve signups', async () => {
    const staleUnverified = await signup({ email: 'stale@verify.test' })
    const staleVerified = await signup({ email: 'stale-verified@verify.test' })
    await verifyEmailToken(payload, staleVerified.verificationToken!)

    // Both are "old" once the sweep runs 8 days in the future; only the
    // unverified one goes — a verified owner keeps their spot in the queue.
    const future = new Date(Date.now() + UNVERIFIED_PURGE_AFTER_MS + 24 * 60 * 60 * 1000)
    const { purged } = await purgeExpiredUnverifiedSignups(payload, { now: future })
    expect(purged).toHaveLength(1)

    const remaining = await payload.find({ collection: 'tenants', overrideAccess: true, depth: 0 })
    const ids = remaining.docs.map((t) => String(t.id))
    expect(ids).not.toContain(staleUnverified.tenantId)
    expect(ids).toContain(staleVerified.tenantId)

    // A fresh unverified signup is still inside the grace window — untouched.
    const fresh = await signup({ email: 'fresh@verify.test' })
    const todaySweep = await purgeExpiredUnverifiedSignups(payload)
    expect(todaySweep.purged).toHaveLength(0)
    const after = await payload.find({ collection: 'tenants', overrideAccess: true, depth: 0 })
    expect(after.docs.map((t) => String(t.id))).toContain(fresh.tenantId)

    // The purged tenant left nothing behind — no orphan users or patients.
    const orphans = await payload.count({
      collection: 'users',
      where: { tenant: { equals: staleUnverified.tenantId } },
      overrideAccess: true,
    })
    expect(orphans.totalDocs).toBe(0)
  })
})

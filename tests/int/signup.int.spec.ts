import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { Payload } from 'payload'
import { getTestPayload, wipe } from './fixtures'
import { signupClinic, type SignupInput } from '@/lib/signup'
import { ERROR_CODES } from '@/lib/constants'

// v3 self-serve onboarding suite (spec §3, tests 1 & 2). signupClinic is exercised
// directly — the Next server action only adds rate-limiting + auto-login on top.

describe('v3 — self-serve signup', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getTestPayload()
  })
  beforeEach(async () => {
    await wipe(payload)
  })

  let n = 0
  const input = (over: Partial<SignupInput> = {}): SignupInput => {
    n += 1
    return {
      clinicName: 'City Care Clinic',
      phone: '+92512345678',
      city: 'Rawalpindi',
      country: 'Pakistan',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      ownerName: 'Sara Ahmed',
      email: `owner-${n}@signup.test`,
      password: 'password123',
      ...over,
    }
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

  const countTenants = async () => (await payload.count({ collection: 'tenants', overrideAccess: true })).totalDocs

  // ---- Test 1: success path builds everything ----

  it('creates a free self-serve clinic, an owner, and sample data', async () => {
    const res = await signupClinic(payload, input())
    expect(res.tenantId).toBeTruthy()
    expect(res.slug).toBe('city-care-clinic')

    const tenant = await payload.findByID({ collection: 'tenants', id: res.tenantId, overrideAccess: true })
    expect(tenant.plan).toBe('free')
    expect(tenant.onboardingSource).toBe('self-serve')
    expect(tenant.status).toBe('pending') // awaits super-admin approval

    const owner = await payload.findByID({ collection: 'users', id: res.ownerId, overrideAccess: true })
    expect(owner.role).toBe('owner')

    const [doctors, patients] = await Promise.all([
      payload.count({ collection: 'users', where: { tenant: { equals: res.tenantId }, role: { equals: 'doctor' } }, overrideAccess: true }),
      payload.count({ collection: 'patients', where: { tenant: { equals: res.tenantId } }, overrideAccess: true }),
    ])
    expect(doctors.totalDocs).toBe(1) // one sample doctor (the free plan's slot)
    expect(patients.totalDocs).toBe(3) // three sample patients
  })

  // ---- Test 2: duplicate email rejected, atomically ----

  it('rejects a duplicate owner email with SIGNUP_EMAIL_TAKEN and leaves no orphan clinic', async () => {
    await signupClinic(payload, input({ email: 'dupe@signup.test' }))
    expect(await countTenants()).toBe(1)

    await rejectsWithCode(
      signupClinic(payload, input({ email: 'dupe@signup.test', clinicName: 'Another Clinic' })),
      ERROR_CODES.SIGNUP_EMAIL_TAKEN,
    )
    // The clash is caught before any write — no second tenant dangles.
    expect(await countTenants()).toBe(1)
  })

  // ---- Admin-approval onboarding: pending blocks login until approved ----

  it('blocks login while pending and allows it once approved', async () => {
    // Verification off explicitly — this test is about the pending gate alone, and
    // the default tracks whether RESEND_API_KEY happens to be set in the local env.
    const res = await signupClinic(payload, input({ email: 'pending@signup.test' }), {
      requireEmailVerification: false,
    })

    // Pending clinic owner cannot sign in yet.
    await rejectsWithCode(
      payload.login({ collection: 'users', data: { email: 'pending@signup.test', password: 'password123' } }),
      ERROR_CODES.TENANT_PENDING,
    )

    // Super admin approves -> status active.
    await payload.update({ collection: 'tenants', id: res.tenantId, data: { status: 'active' }, overrideAccess: true })

    const ok = await payload.login({
      collection: 'users',
      data: { email: 'pending@signup.test', password: 'password123' },
    })
    expect(ok.token).toBeTruthy()
  })

  // ---- Slug collisions get a numbered suffix (spec §3.1.b) ----

  it('suffixes the slug when the clinic name is already taken', async () => {
    const a = await signupClinic(payload, input())
    const b = await signupClinic(payload, input())
    expect(a.slug).toBe('city-care-clinic')
    expect(b.slug).toBe('city-care-clinic-2')
  })

  // ---- Input validation ----

  it('rejects a short password with VALIDATION before touching the database', async () => {
    await rejectsWithCode(signupClinic(payload, input({ password: 'short' })), ERROR_CODES.VALIDATION)
    expect(await countTenants()).toBe(0)
  })

  it('rejects a malformed email with VALIDATION', async () => {
    await rejectsWithCode(signupClinic(payload, input({ email: 'not-an-email' })), ERROR_CODES.VALIDATION)
  })
})

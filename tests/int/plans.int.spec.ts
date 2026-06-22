import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { Payload } from 'payload'
import { getTestPayload, seedFixture, type Fixture } from './fixtures'
import { ERROR_CODES } from '@/lib/constants'

// v3 plan-limit suite (spec §4, tests 3 & 4). The shared fixture seeds each clinic on
// the unlimited `plus` plan with one active doctor and one patient already present;
// each test sets the plan it exercises so the cap is explicit, not incidental.

describe('v3 — plan limits', () => {
  let payload: Payload
  let f: Fixture

  beforeAll(async () => {
    payload = await getTestPayload()
  })
  beforeEach(async () => {
    f = await seedFixture(payload)
  })

  const setPlan = (tenantID: string | number, plan: string) =>
    payload.update({
      collection: 'tenants',
      id: tenantID,
      data: { plan } as never,
      overrideAccess: true,
    })

  let n = 0
  const addDoctor = (tenantID: string | number, over: Record<string, unknown> = {}) =>
    payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        name: `Doctor ${++n}`,
        email: `doc-${n}-${tenantID}@clinic.test`,
        password: 'password123',
        role: 'doctor',
        tenant: tenantID,
        active: true,
        ...over,
      } as never,
    })

  const addPatient = (tenantID: string | number, i: number) =>
    payload.create({
      collection: 'patients',
      overrideAccess: true,
      data: {
        tenant: tenantID,
        name: `Patient ${i}`,
        phone: `0300${String(i).padStart(7, '0')}`,
        gender: 'male',
        ageYears: 30,
      } as never,
    })

  /** Assert a create/update rejects with the given stable error code. */
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

  // ---- Test 3: free-plan enforcement ----

  it('free plan rejects a 2nd active doctor with PLAN_LIMIT', async () => {
    await setPlan(f.a.tenant.id, 'free')
    // Clinic A already has one active doctor (fixture) → at the free ceiling.
    await rejectsWithCode(addDoctor(f.a.tenant.id), ERROR_CODES.PLAN_LIMIT)
  })

  it('allows adding a doctor after deactivating one (deactivated do not count)', async () => {
    await setPlan(f.a.tenant.id, 'free')
    await payload.update({
      collection: 'users',
      id: f.a.doctor.id,
      data: { active: false },
      overrideAccess: true,
    })
    const doc = await addDoctor(f.a.tenant.id)
    expect(doc.id).toBeTruthy()
  })

  it('does not cap non-doctor roles (receptionist allowed at doctor limit)', async () => {
    await setPlan(f.a.tenant.id, 'free')
    const recept = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        name: 'Extra Reception',
        email: `recept-extra-${f.a.tenant.id}@clinic.test`,
        password: 'password123',
        role: 'receptionist',
        tenant: f.a.tenant.id,
      } as never,
    })
    expect(recept.id).toBeTruthy()
  })

  it('free plan rejects the 51st patient with PLAN_LIMIT', async () => {
    await setPlan(f.a.tenant.id, 'free')
    // Fixture leaves 1 patient; add up to the 50-patient cap, then the next fails.
    for (let i = 2; i <= 50; i++) await addPatient(f.a.tenant.id, i)
    await rejectsWithCode(addPatient(f.a.tenant.id, 51), ERROR_CODES.PLAN_LIMIT)
  })

  // ---- Test 4: downgrade over-limit ----

  it('downgrade over-limit keeps existing data editable but blocks new creates', async () => {
    await setPlan(f.a.tenant.id, 'clinic') // 5-doctor plan
    await addDoctor(f.a.tenant.id) // 2 active
    await addDoctor(f.a.tenant.id) // 3 active
    await setPlan(f.a.tenant.id, 'free') // downgrade — now over the 1-doctor limit

    // Existing records stay editable (update is never gated).
    const renamed = await payload.update({
      collection: 'users',
      id: f.a.doctor.id,
      data: { name: 'Renamed Doctor' },
      overrideAccess: true,
    })
    expect(renamed.name).toBe('Renamed Doctor')

    // Only *new* creates are blocked.
    await rejectsWithCode(addDoctor(f.a.tenant.id), ERROR_CODES.PLAN_LIMIT)
  })

  it('clinic plan admits doctors up to its higher ceiling', async () => {
    await setPlan(f.a.tenant.id, 'clinic') // limit 5, one already present
    for (let i = 0; i < 4; i++) {
      const d = await addDoctor(f.a.tenant.id)
      expect(d.id).toBeTruthy()
    }
    // 6th active doctor exceeds the clinic ceiling.
    await rejectsWithCode(addDoctor(f.a.tenant.id), ERROR_CODES.PLAN_LIMIT)
  })
})

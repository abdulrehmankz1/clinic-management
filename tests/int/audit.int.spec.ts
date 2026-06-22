import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import type { Payload } from 'payload'
import { getTestPayload, seedFixture, type Fixture } from './fixtures'

// v3 audit-log suite (spec §10, tests 5, 6, 8): entries are written by hooks, the
// REST surface is fully locked (even for super admin), an audit failure never breaks
// the business operation, and the log is tenant-isolated.

const relID = (v: unknown): string =>
  v && typeof v === 'object' && 'id' in (v as Record<string, unknown>)
    ? String((v as { id: unknown }).id)
    : String(v)

describe('v3 — audit log', () => {
  let payload: Payload
  let f: Fixture

  beforeAll(async () => {
    payload = await getTestPayload()
  })
  beforeEach(async () => {
    f = await seedFixture(payload)
  })

  const tomorrowAt = (hour: number) => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(hour, 0, 0, 0)
    return d.toISOString()
  }

  // Create an appointment AS the clinic owner (so the actor is attributable).
  async function bookAppt(clinic: Fixture['a'], hour = 10) {
    return payload.create({
      collection: 'appointments',
      user: clinic.owner,
      overrideAccess: false,
      data: {
        patient: clinic.patient.id,
        doctor: clinic.doctor.id,
        start: tomorrowAt(hour),
        durationMins: 15,
        status: 'scheduled',
      } as never,
    })
  }

  async function cancelAppt(clinic: Fixture['a'], id: string | number) {
    return payload.update({
      collection: 'appointments',
      id,
      user: clinic.owner,
      overrideAccess: false,
      data: { status: 'cancelled', cancellationReason: 'patient request' } as never,
    })
  }

  // ---- Test 5a: a cancel writes an entry with a sensible summary ----

  it('records an audit entry with a readable summary when an appointment is cancelled', async () => {
    const appt = await bookAppt(f.a)
    await cancelAppt(f.a, appt.id)

    const logs = await payload.find({
      collection: 'auditLogs',
      where: { tenant: { equals: f.a.tenant.id }, action: { equals: 'appointment.cancelled' } },
      overrideAccess: true,
    })
    expect(logs.totalDocs).toBeGreaterThanOrEqual(1)
    expect(logs.docs[0].summary).toMatch(/Cancelled/i)
    expect(relID(logs.docs[0].user)).toBe(String(f.a.owner.id))
  })

  // ---- Test 5b: the REST surface is locked for everyone, super admin included ----

  it('denies create / update / delete on auditLogs even for a super admin', async () => {
    // Seed one entry to attempt update/delete against.
    const appt = await bookAppt(f.a)
    await cancelAppt(f.a, appt.id)
    const existing = await payload.find({ collection: 'auditLogs', limit: 1, overrideAccess: true })
    const id = existing.docs[0].id

    const createAttempt = payload.create({
      collection: 'auditLogs',
      user: f.superAdmin,
      overrideAccess: false,
      data: { tenant: f.a.tenant.id, user: f.superAdmin.id, action: 'settings.updated', targetCollection: 'tenants', targetId: '1', summary: 'hacked' } as never,
    })
    await expect(createAttempt).rejects.toBeTruthy()

    const updateAttempt = payload.update({
      collection: 'auditLogs',
      id,
      user: f.superAdmin,
      overrideAccess: false,
      data: { summary: 'tampered' } as never,
    })
    await expect(updateAttempt).rejects.toBeTruthy()

    const deleteAttempt = payload.delete({
      collection: 'auditLogs',
      id,
      user: f.superAdmin,
      overrideAccess: false,
    })
    await expect(deleteAttempt).rejects.toBeTruthy()
  })

  // ---- Test 6: an audit-write failure must not fail the business operation ----

  it('does not fail the main operation when the audit write throws', async () => {
    const origCreate = payload.create.bind(payload)
    // Force every auditLogs insert to blow up.
    ;(payload as unknown as { create: unknown }).create = (async (args: { collection?: string }) => {
      if (args?.collection === 'auditLogs') throw new Error('boom: audit store down')
      return origCreate(args as never)
    }) as never
    try {
      const appt = await bookAppt(f.a) // afterChange tries (and fails) to audit
      expect(appt.id).toBeTruthy() // …but the appointment is still created
    } finally {
      ;(payload as unknown as { create: unknown }).create = origCreate as never
    }
  })

  // ---- Test 8: audit logs are isolated per clinic ----

  it('keeps audit logs isolated per clinic (owner A cannot read clinic B)', async () => {
    const apptA = await bookAppt(f.a, 9)
    await cancelAppt(f.a, apptA.id)
    const apptB = await bookAppt(f.b, 11)
    await cancelAppt(f.b, apptB.id)

    // Owner A, with access enforced, only ever sees clinic A's entries.
    const asOwnerA = await payload.find({
      collection: 'auditLogs',
      user: f.a.owner,
      overrideAccess: false,
      limit: 100,
    })
    expect(asOwnerA.totalDocs).toBeGreaterThan(0)
    expect(asOwnerA.docs.every((d) => relID(d.tenant) === String(f.a.tenant.id))).toBe(true)
  })
})

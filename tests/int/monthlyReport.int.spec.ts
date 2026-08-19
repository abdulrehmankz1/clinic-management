import { describe, it, expect, beforeAll } from 'vitest'
import type { Payload } from 'payload'
import { getTestPayload, seedFixture, type Fixture } from './fixtures'
import { getMonthlyReport, monthRangeUtc } from '@/lib/reports'

// v4-A — monthly report math on a fixed seed (spec §A.3). Everything lands in
// May 2026; the fixture tenants default to Asia/Karachi (UTC+5), so the month
// runs 2026-04-30T19:00Z → 2026-05-31T19:00Z.

const MAY = (day: number, hourUtc: number, min = 0) =>
  new Date(Date.UTC(2026, 4, day, hourUtc, min)).toISOString()

describe('v4-A — monthly report', () => {
  let payload: Payload
  let fixture: Fixture
  let doctor2Id: string

  beforeAll(async () => {
    payload = await getTestPayload()
    fixture = await seedFixture(payload)
    const { tenant, doctor, patient } = fixture.a

    const doctor2 = await payload.create({
      collection: 'users',
      data: {
        name: 'Second Doctor',
        email: 'doctor2-a@clinic.test',
        password: 'password123',
        role: 'doctor',
        tenant: tenant.id,
        active: true,
      },
      overrideAccess: true,
    })
    doctor2Id = String(doctor2.id)

    // Appointments (statuses set at create — transition rules only guard updates):
    // doctor1: completed ×2 + no-show ×1 · doctor2: completed ×1 + cancelled ×1.
    const mk = (start: string, doctorId: string, status: string) =>
      payload.create({
        collection: 'appointments',
        data: {
          tenant: tenant.id,
          patient: patient.id,
          doctor: doctorId,
          start,
          durationMins: 15,
          reason: 'report test',
          status,
        } as never,
        overrideAccess: true,
      })
    const a1 = await mk(MAY(4, 5), String(doctor.id), 'completed') // 4 May, 10:00 PKT
    await mk(MAY(5, 5), String(doctor.id), 'completed')
    await mk(MAY(6, 5), String(doctor.id), 'no-show')
    await mk(MAY(7, 5), doctor2Id, 'completed')
    await mk(MAY(8, 5), doctor2Id, 'cancelled')
    // Outside the month — must not count.
    await mk(new Date(Date.UTC(2026, 5, 2, 5)).toISOString(), String(doctor.id), 'completed')

    // Visit on a1 links invoice revenue to doctor1.
    const visit = await payload.create({
      collection: 'visits',
      data: {
        tenant: tenant.id,
        appointment: a1.id,
        patient: patient.id,
        doctor: doctor.id,
        symptoms: 'fever',
        diagnosis: 'flu',
      } as never,
      overrideAccess: true,
    })

    // inv1 (visit-linked): 1500 billed, 1000 paid on 10 May → doctor1 revenue.
    await payload.create({
      collection: 'invoices',
      data: {
        tenant: tenant.id,
        visit: visit.id,
        patient: patient.id,
        lineItems: [{ description: 'Consultation', quantity: 1, unitAmount: 1500 }],
        payments: [{ amount: 1000, method: 'cash', receivedAt: MAY(10, 6) }],
      } as never,
      overrideAccess: true,
    })
    // inv2 (no visit): 500 paid on 20 May → counts for the clinic, no doctor.
    await payload.create({
      collection: 'invoices',
      data: {
        tenant: tenant.id,
        patient: patient.id,
        lineItems: [{ description: 'Dressing', quantity: 1, unitAmount: 500 }],
        payments: [{ amount: 500, method: 'cash', receivedAt: MAY(20, 6) }],
      } as never,
      overrideAccess: true,
    })
    // inv3: 800 paid in May, then voided → excluded from every number.
    const inv3 = await payload.create({
      collection: 'invoices',
      data: {
        tenant: tenant.id,
        patient: patient.id,
        lineItems: [{ description: 'Mistake', quantity: 1, unitAmount: 800 }],
        payments: [{ amount: 800, method: 'cash', receivedAt: MAY(15, 6) }],
      } as never,
      overrideAccess: true,
    })
    await payload.update({
      collection: 'invoices',
      id: inv3.id,
      data: { voided: true, voidReason: 'test void' } as never,
      overrideAccess: true,
    })
  })

  it('computes tenant-timezone month boundaries', () => {
    const { start, end } = monthRangeUtc('Asia/Karachi', 2026, 5)
    expect(start.toISOString()).toBe('2026-04-30T19:00:00.000Z') // 1 May 00:00 PKT
    expect(end.toISOString()).toBe('2026-05-31T19:00:00.000Z')
  })

  it('tallies appointments, revenue and per-doctor rows — voided invoices excluded', async () => {
    const r = await getMonthlyReport(payload, String(fixture.a.tenant.id), fixture.a.tenant, 2026, 5)

    expect(r.appointments).toEqual({
      total: 5,
      completed: 3,
      cancelled: 1,
      noShows: 1,
      completionRate: 3 / 5,
    })

    // 1000 + 500; the voided invoice's 800 never appears.
    expect(r.revenueCollected).toBe(1500)
    // Both open invoices were *created* today (July), not in May.
    expect(r.outstandingAdded).toBe(0)
    expect(r.newPatients).toBe(0)

    // Daily buckets: 10 May and 20 May PKT, everything else zero.
    expect(r.daily).toHaveLength(31)
    expect(r.daily[9]).toEqual({ label: '10 May', amount: 1000 })
    expect(r.daily[19]).toEqual({ label: '20 May', amount: 500 })
    expect(r.daily.reduce((s, d) => s + d.amount, 0)).toBe(1500)

    // Per-doctor: doctor1 leads on revenue; the fixture's untouched doctors stay out.
    expect(r.doctors).toHaveLength(2)
    const [d1, d2] = r.doctors
    expect(d1).toMatchObject({
      id: String(fixture.a.doctor.id),
      total: 3,
      completed: 2,
      noShows: 1,
      revenue: 1000,
    })
    expect(d1.noShowRate).toBeCloseTo(1 / 3)
    expect(d2).toMatchObject({ id: doctor2Id, total: 2, completed: 1, noShows: 0, revenue: 0 })
  })

  it('keeps clinics isolated — clinic B sees an empty month', async () => {
    const r = await getMonthlyReport(payload, String(fixture.b.tenant.id), fixture.b.tenant, 2026, 5)
    expect(r.appointments.total).toBe(0)
    expect(r.revenueCollected).toBe(0)
    expect(r.doctors).toHaveLength(0)
  })
})

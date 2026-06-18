import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { Payload } from 'payload'
import { getTestPayload, seedFixture, type Fixture } from './fixtures'
import { getRevenueData } from '@/lib/reports'

// Phase 3 — revenue & outstanding aggregation, payments-based and tenant-isolated.

describe('revenue reporting', () => {
  let payload: Payload
  let f: Fixture

  beforeAll(async () => {
    payload = await getTestPayload()
  })
  beforeEach(async () => {
    f = await seedFixture(payload)
  })

  const invoice = (tenantId: string, patientId: string, unit: number, payAmount?: number) =>
    payload.create({
      collection: 'invoices',
      overrideAccess: true,
      data: {
        tenant: tenantId,
        patient: patientId,
        lineItems: [{ description: 'Consultation', quantity: 1, unitAmount: unit }],
        payments: payAmount ? [{ amount: payAmount, method: 'cash', receivedAt: new Date().toISOString() }] : [],
      } as never,
    })

  it('counts today’s payments as revenue and lists outstanding balances', async () => {
    await invoice(String(f.a.tenant.id), String(f.a.patient.id), 1000, 1000) // paid in full today
    await invoice(String(f.a.tenant.id), String(f.a.patient.id), 800, 300) // partial → 500 outstanding
    const unpaid = await invoice(String(f.a.tenant.id), String(f.a.patient.id), 500) // unpaid

    const rev = await getRevenueData(payload, String(f.a.tenant.id), f.a.tenant as never)
    expect(rev.revenueToday).toBe(1300) // 1000 + 300
    expect(rev.revenueMonth).toBe(1300)
    expect(rev.outstandingTotal).toBe(1000) // 0 + 500 + 500
    expect(rev.outstanding.some((o) => o.invoiceNumber === unpaid.invoiceNumber)).toBe(true)
  })

  it('excludes voided invoices from outstanding', async () => {
    const inv = await invoice(String(f.a.tenant.id), String(f.a.patient.id), 900) // unpaid
    await payload.update({
      collection: 'invoices',
      id: inv.id,
      overrideAccess: false,
      user: f.a.owner,
      data: { voided: true, voidReason: 'error' } as never,
    })
    const rev = await getRevenueData(payload, String(f.a.tenant.id), f.a.tenant as never)
    expect(rev.outstandingTotal).toBe(0)
  })

  it('keeps revenue isolated per clinic', async () => {
    await invoice(String(f.a.tenant.id), String(f.a.patient.id), 1000, 1000)
    const revB = await getRevenueData(payload, String(f.b.tenant.id), f.b.tenant as never)
    expect(revB.revenueToday).toBe(0)
    expect(revB.outstandingTotal).toBe(0)
    expect(revB.outstanding).toHaveLength(0)
  })
})

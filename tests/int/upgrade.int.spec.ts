import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { Payload } from 'payload'
import { getTestPayload, seedFixture, type Fixture } from './fixtures'

// v3 upgrade-request workflow (spec §5): the owner files a request on their own
// tenant, a super admin approves (plan applied, request cleared) or declines
// (request cleared, plan untouched), and every step leaves an audit trail. The
// `plan` field itself stays superAdmin-only.

describe('v3 — plans & upgrade requests', () => {
  let payload: Payload
  let f: Fixture

  beforeAll(async () => {
    payload = await getTestPayload()
  })
  beforeEach(async () => {
    f = await seedFixture(payload)
  })

  const fileRequest = (clinic: Fixture['a'], requestedPlan = 'plus', note = 'growing fast') =>
    payload.update({
      collection: 'tenants',
      id: clinic.tenant.id,
      user: clinic.owner,
      overrideAccess: false,
      data: {
        upgradeRequest: { requestedPlan, requestedAt: new Date().toISOString(), note },
      } as never,
    })

  const findAudit = (tenantID: string | number, action: string) =>
    payload.find({
      collection: 'auditLogs',
      where: { tenant: { equals: tenantID }, action: { equals: action } },
      overrideAccess: true,
    })

  it('lets an owner file an upgrade request on their own clinic (with audit entry)', async () => {
    // Fixture seeds `plus`; drop to free so `plus` is a genuine upgrade target.
    await payload.update({ collection: 'tenants', id: f.a.tenant.id, data: { plan: 'free' } as never, overrideAccess: true })

    const updated = await fileRequest(f.a)
    expect(updated.upgradeRequest?.requestedPlan).toBe('plus')
    expect(updated.plan).toBe('free') // filing a request never changes the plan itself

    const logs = await findAudit(f.a.tenant.id, 'plan.upgrade-requested')
    expect(logs.totalDocs).toBe(1)
    expect(logs.docs[0].summary).toMatch(/upgrade to the Plus plan/i)
  })

  it('never lets an owner change their own plan (field is superAdmin-only)', async () => {
    await payload.update({ collection: 'tenants', id: f.a.tenant.id, data: { plan: 'free' } as never, overrideAccess: true })

    // Field-level access silently strips `plan` from an owner's update.
    await payload.update({
      collection: 'tenants',
      id: f.a.tenant.id,
      user: f.a.owner,
      overrideAccess: false,
      data: { plan: 'plus' } as never,
    })
    const after = await payload.findByID({ collection: 'tenants', id: f.a.tenant.id, overrideAccess: true })
    expect(after.plan).toBe('free')
  })

  it('blocks an owner from filing a request on another clinic', async () => {
    const crossTenant = payload.update({
      collection: 'tenants',
      id: f.b.tenant.id,
      user: f.a.owner,
      overrideAccess: false,
      data: { upgradeRequest: { requestedPlan: 'plus' } } as never,
    })
    await expect(crossTenant).rejects.toBeTruthy()
  })

  it('approve applies the requested plan, clears the request and audits plan.changed', async () => {
    await payload.update({ collection: 'tenants', id: f.a.tenant.id, data: { plan: 'free' } as never, overrideAccess: true })
    await fileRequest(f.a, 'clinic')

    // What resolveUpgradeRequest('approve') performs, acting as the super admin.
    const approved = await payload.update({
      collection: 'tenants',
      id: f.a.tenant.id,
      user: f.superAdmin,
      overrideAccess: false,
      data: {
        plan: 'clinic',
        upgradeRequest: { requestedPlan: null, requestedAt: null, note: null },
      } as never,
    })
    expect(approved.plan).toBe('clinic')
    expect(approved.upgradeRequest?.requestedPlan ?? null).toBeNull()

    const changed = await findAudit(f.a.tenant.id, 'plan.changed')
    expect(changed.totalDocs).toBe(1)
    expect(changed.docs[0].meta).toMatchObject({ from: 'free', to: 'clinic' })
    // An approval is not a rejection — the clear alongside a plan change stays silent.
    const rejected = await findAudit(f.a.tenant.id, 'plan.upgrade-rejected')
    expect(rejected.totalDocs).toBe(0)
  })

  it('decline clears the request, keeps the plan and audits plan.upgrade-rejected', async () => {
    await payload.update({ collection: 'tenants', id: f.a.tenant.id, data: { plan: 'free' } as never, overrideAccess: true })
    await fileRequest(f.a, 'plus')

    const declined = await payload.update({
      collection: 'tenants',
      id: f.a.tenant.id,
      user: f.superAdmin,
      overrideAccess: false,
      data: { upgradeRequest: { requestedPlan: null, requestedAt: null, note: null } } as never,
    })
    expect(declined.plan).toBe('free')
    expect(declined.upgradeRequest?.requestedPlan ?? null).toBeNull()

    const rejected = await findAudit(f.a.tenant.id, 'plan.upgrade-rejected')
    expect(rejected.totalDocs).toBe(1)
    expect(rejected.docs[0].summary).toMatch(/Declined/i)
    const changed = await findAudit(f.a.tenant.id, 'plan.changed')
    // Only the seed's plus→free switch was overrideAccess (no user) — never audited.
    expect(changed.totalDocs).toBe(0)
  })
})

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { Payload } from 'payload'
import { getTestPayload, wipe } from './fixtures'
import { signupClinic } from '@/lib/signup'
import { notifySignupDecision } from '@/lib/approvalEmail'
import type { SendEmailInput } from '@/lib/email'

// Backlog §1.2 — approval/rejection emails. The lib is exercised directly with a
// captured sender; the setClinicStatus server action only decides *when* to call
// it (pending → active/suspended) and swallows failures.

describe('backlog — signup decision emails', () => {
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

  const signup = (email: string) =>
    signupClinic(payload, {
      clinicName: 'Decision Test Clinic',
      phone: '+92512345678',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      ownerName: 'Sara Ahmed',
      email,
      password: 'password123',
    })

  it('emails the owner a sign-in link on approval', async () => {
    const res = await signup('approve-me@decision.test')
    const tenant = await payload.findByID({ collection: 'tenants', id: res.tenantId, overrideAccess: true })

    const summary = await notifySignupDecision(payload, tenant, 'approved', capture)
    expect(summary.sent).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toBe('approve-me@decision.test')
    expect(sent[0]!.subject).toContain('approved')
    expect(sent[0]!.html).toContain('/login?email=approve-me%40decision.test')
  })

  it('emails the owner a softer note on rejection', async () => {
    const res = await signup('reject-me@decision.test')
    const tenant = await payload.findByID({ collection: 'tenants', id: res.tenantId, overrideAccess: true })

    const summary = await notifySignupDecision(payload, tenant, 'rejected', capture)
    expect(summary.sent).toBe(true)
    expect(sent[0]!.to).toBe('reject-me@decision.test')
    expect(sent[0]!.subject).not.toContain('approved')
    expect(sent[0]!.html).not.toContain('/login')
  })

  it('skips gracefully when the clinic has no owner', async () => {
    const tenant = await payload.create({
      collection: 'tenants',
      data: { name: 'Ownerless Clinic', phone: '03001234567', status: 'pending' } as never,
      overrideAccess: true,
    })

    const summary = await notifySignupDecision(payload, tenant, 'approved', capture)
    expect(summary.sent).toBe(false)
    expect(summary.skipped).toBe('no owner email')
    expect(sent).toHaveLength(0)
  })

  it('reports a skip (not a failure) when email is not configured', async () => {
    const res = await signup('unconfigured@decision.test')
    const tenant = await payload.findByID({ collection: 'tenants', id: res.tenantId, overrideAccess: true })

    const skippingSend = async () => ({ ok: false, skipped: true })
    const summary = await notifySignupDecision(payload, tenant, 'approved', skippingSend)
    expect(summary.sent).toBe(false)
    expect(summary.skipped).toBe('email not configured')
  })
})

// Signup decision notifications (BACKLOG §1.2). When a super admin approves or
// rejects a self-serve clinic, the owner hears about it by email instead of
// discovering it on a login attempt. Pure communication layer: best-effort,
// graceful when email isn't configured, and never allowed to fail the decision
// itself. Testable with an injected sender, like lib/digest.ts.

import type { Payload } from 'payload'
import type { Tenant, User } from '@/payload-types'
import { appBaseUrl, sendEmail, type SendEmail } from './email'

export type DecisionSummary = {
  sent: boolean
  /** Why nothing went out — for logs only. */
  skipped?: string
}

/** Email the clinic owner that their signup was approved or rejected. */
export async function notifySignupDecision(
  payload: Payload,
  tenant: Pick<Tenant, 'id' | 'name'>,
  decision: 'approved' | 'rejected',
  send: SendEmail = sendEmail,
): Promise<DecisionSummary> {
  const owners = await payload.find({
    collection: 'users',
    where: { tenant: { equals: tenant.id }, role: { equals: 'owner' } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const owner = owners.docs[0] as User | undefined
  if (!owner?.email) return { sent: false, skipped: 'no owner email' }

  const res = await send({
    to: owner.email,
    subject:
      decision === 'approved'
        ? `${tenant.name} is approved — you can sign in now`
        : `Update on your ${tenant.name} signup`,
    html: decision === 'approved' ? approvedHtml(tenant, owner) : rejectedHtml(tenant, owner),
  })
  if (res.ok) return { sent: true }
  return { sent: false, skipped: res.skipped ? 'email not configured' : res.error }
}

function approvedHtml(tenant: Pick<Tenant, 'name'>, owner: User): string {
  const link = `${appBaseUrl()}/login?email=${encodeURIComponent(owner.email)}`
  return `<div style="font-family:Segoe UI,system-ui,sans-serif;color:#1c2422;max-width:520px">
    <h2 style="margin:0 0 2px;font-size:18px">${tenant.name} is ready</h2>
    <p style="margin:0 0 16px;color:#4b5f5a;font-size:14px">
      Your clinic has been approved. Sign in to set up your doctors and start booking appointments.
    </p>
    <p style="margin:0 0 18px">
      <a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">
        Sign in to your clinic
      </a>
    </p>
    <p style="margin:0;font-size:12px;color:#8aa19b">
      A welcome checklist on your dashboard walks you through the first steps.
    </p>
  </div>`
}

function rejectedHtml(tenant: Pick<Tenant, 'name'>, _owner: User): string {
  return `<div style="font-family:Segoe UI,system-ui,sans-serif;color:#1c2422;max-width:520px">
    <h2 style="margin:0 0 2px;font-size:18px">About your ${tenant.name} signup</h2>
    <p style="margin:0 0 16px;color:#4b5f5a;font-size:14px">
      We couldn't approve your clinic signup at this time. If you believe this is a mistake,
      just reply to this email and we'll take another look.
    </p>
    <p style="margin:0;font-size:12px;color:#8aa19b">
      Sent by matab — clinic management, simplified.
    </p>
  </div>`
}

'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, getPayloadClient } from '@/lib/auth'
import { notifySignupDecision } from '@/lib/approvalEmail'
import { toActionError, type ActionResult } from '@/lib/errors'
import {
  DEFAULT_APPOINTMENT_DURATION,
  DEFAULT_CLOSE_TIME,
  DEFAULT_OPEN_TIME,
} from '@/lib/constants'

async function superCtx() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'superAdmin') return null
  const payload = await getPayloadClient()
  return { user, payload }
}

type ClinicInput = {
  name: string
  phone: string
  city?: string
  currency: string
  timezone: string
  ownerName: string
  ownerEmail: string
  ownerPassword: string
}

/** Create a clinic + its owner atomically (spec §8.1) — both or neither. */
export async function createClinic(input: ClinicInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await superCtx()
  if (!ctx) return { ok: false, code: 'FORBIDDEN', message: "You don't have permission to do that." }
  const { payload } = ctx

  if (!input.name || !input.phone || !input.ownerEmail || !input.ownerPassword || !input.ownerName) {
    return { ok: false, code: 'VALIDATION', message: 'Clinic name, phone and owner details are required.' }
  }

  const txn = await payload.db.beginTransaction()
  const req = txn ? ({ transactionID: txn } as never) : undefined
  try {
    const tenant = await payload.create({
      collection: 'tenants',
      overrideAccess: true,
      req,
      data: {
        name: input.name,
        phone: input.phone,
        city: input.city || undefined,
        status: 'active',
        settings: {
          appointmentDurationMins: DEFAULT_APPOINTMENT_DURATION,
          openTime: DEFAULT_OPEN_TIME,
          closeTime: DEFAULT_CLOSE_TIME,
          currency: input.currency,
          timezone: input.timezone,
        },
      } as never,
    })

    await payload.create({
      collection: 'users',
      overrideAccess: true,
      req,
      data: {
        name: input.ownerName,
        email: input.ownerEmail,
        password: input.ownerPassword,
        role: 'owner',
        tenant: tenant.id,
      } as never,
    })

    if (txn) await payload.db.commitTransaction(txn)
    revalidatePath('/super')
    return { ok: true, data: { id: String(tenant.id) } }
  } catch (err) {
    if (txn) await payload.db.rollbackTransaction(txn)
    return { ok: false, ...toActionError(err) }
  }
}

/**
 * Resolve a tenant's pending upgrade request (v3 spec §5). Approve applies the
 * requested plan and clears the request; reject just clears it. Audit entries
 * (plan.changed / plan.upgrade-rejected) are written by the auditTenants hook.
 */
export async function resolveUpgradeRequest(
  id: string,
  decision: 'approve' | 'reject',
): Promise<ActionResult<null>> {
  const ctx = await superCtx()
  if (!ctx) return { ok: false, code: 'FORBIDDEN', message: "You don't have permission to do that." }
  try {
    const tenant = await ctx.payload.findByID({
      collection: 'tenants',
      id,
      depth: 0,
      overrideAccess: true,
    })
    const requested = tenant.upgradeRequest?.requestedPlan
    if (!requested) {
      return { ok: false, code: 'VALIDATION', message: 'This clinic has no pending upgrade request.' }
    }

    await ctx.payload.update({
      collection: 'tenants',
      id,
      overrideAccess: false,
      user: ctx.user,
      data: {
        ...(decision === 'approve' ? { plan: requested } : {}),
        upgradeRequest: { requestedPlan: null, requestedAt: null, note: null },
      } as never,
    })
    revalidatePath('/super')
    return { ok: true, data: null }
  } catch (err) {
    return { ok: false, ...toActionError(err) }
  }
}

export async function setClinicStatus(
  id: string,
  status: 'active' | 'suspended',
): Promise<ActionResult<null>> {
  const ctx = await superCtx()
  if (!ctx) return { ok: false, code: 'FORBIDDEN', message: "You don't have permission to do that." }
  try {
    // Old status decides whether this is a signup decision (pending → active/suspended)
    // or a plain suspend/reactivate of a live clinic.
    const before = await ctx.payload.findByID({
      collection: 'tenants',
      id,
      depth: 0,
      overrideAccess: true,
    })

    // A signup can't be approved until the owner proved they own the email
    // (BACKLOG §1.1) — the UI disables the button; this is the real gate.
    if (before.status === 'pending' && status === 'active') {
      const owners = await ctx.payload.find({
        collection: 'users',
        where: { tenant: { equals: id }, role: { equals: 'owner' } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (owners.docs[0]?.emailVerified === false) {
        return {
          ok: false,
          code: 'VALIDATION',
          message: "The owner hasn't verified their email yet — approval is on hold until they do.",
        }
      }
    }

    await ctx.payload.update({
      collection: 'tenants',
      id,
      overrideAccess: false,
      user: ctx.user,
      data: { status } as never,
    })

    // Signup decision → tell the owner (BACKLOG §1.2). Best-effort: a mail hiccup
    // must never roll back or fail the decision itself.
    if (before.status === 'pending') {
      const decision = status === 'active' ? 'approved' : 'rejected'
      try {
        const summary = await notifySignupDecision(ctx.payload, before, decision)
        if (!summary.sent) {
          ctx.payload.logger?.info?.(
            { tenant: before.name, decision, skipped: summary.skipped },
            'signup decision email not sent',
          )
        }
      } catch (err) {
        ctx.payload.logger?.error?.(
          { err, tenant: before.name, decision },
          'signup decision email failed (non-fatal)',
        )
      }
    }

    revalidatePath('/super')
    return { ok: true, data: null }
  } catch (err) {
    return { ok: false, ...toActionError(err) }
  }
}

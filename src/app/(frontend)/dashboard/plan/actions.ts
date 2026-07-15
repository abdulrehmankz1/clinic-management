'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, getPayloadClient } from '@/lib/auth'
import { getTenantID } from '@/access'
import { toActionError, type ActionResult } from '@/lib/errors'
import { PLAN_LIMITS } from '@/lib/plans'

/**
 * Owner asks for a plan change (v3 spec §5). No billing — this just stamps
 * `upgradeRequest` on the tenant; a super admin approves or declines it from
 * /super. The audit entry is written by the auditTenants hook.
 */
export async function requestUpgrade(
  requestedPlan: string,
  note?: string,
): Promise<ActionResult<null>> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') {
    return { ok: false, code: 'FORBIDDEN', message: "You don't have permission to do that." }
  }
  const tenantID = getTenantID(user)
  if (!tenantID) {
    return { ok: false, code: 'FORBIDDEN', message: 'You are not attached to a clinic.' }
  }
  if (!(requestedPlan in PLAN_LIMITS)) {
    return { ok: false, code: 'VALIDATION', message: 'Pick a valid plan.' }
  }

  try {
    const payload = await getPayloadClient()
    const tenant = await payload.findByID({
      collection: 'tenants',
      id: tenantID,
      depth: 0,
      overrideAccess: true,
    })
    if (tenant.plan === requestedPlan) {
      return { ok: false, code: 'VALIDATION', message: "You're already on that plan." }
    }
    if (tenant.upgradeRequest?.requestedPlan) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'You already have a pending request. Our team will get back to you.',
      }
    }

    await payload.update({
      collection: 'tenants',
      id: tenantID,
      user,
      overrideAccess: false,
      data: {
        upgradeRequest: {
          requestedPlan,
          requestedAt: new Date().toISOString(),
          note: note?.trim() || null,
        },
      } as never,
    })
    revalidatePath('/dashboard/plan')
    return { ok: true, data: null }
  } catch (err) {
    return { ok: false, ...toActionError(err) }
  }
}

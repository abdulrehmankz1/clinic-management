// Plan-limit enforcement (v3 spec §4). A beforeChange hook factory shared by the
// resources a plan caps: active doctors (Users) and patients (Patients).
//
// Rules:
//  - Only `create` is gated. Existing data is never blocked or deleted — so after a
//    downgrade that leaves a tenant over-limit, current records stay editable; only
//    *new* creates fail.
//  - Deactivated doctors don't count, so a clinic may deactivate one and add another.
//  - The count runs inside the request transaction (req threaded through) so it sees
//    a consistent view.

import type { CollectionBeforeChangeHook, Where } from 'payload'
import { APIError } from 'payload'
import { getTenantID } from '@/access'
import { ERROR_CODES } from '@/lib/constants'
import { asPlan, limitFor, planLabel, type LimitedResource } from '@/lib/plans'

export function enforcePlanLimit(resource: LimitedResource): CollectionBeforeChangeHook {
  return async ({ data, req, operation }) => {
    if (operation !== 'create' || !data) return data

    // Doctors are the only capped user role; other roles (and updates) pass through.
    if (resource === 'doctors' && data.role !== 'doctor') return data

    const tenantID = data.tenant ? String(data.tenant) : getTenantID(req.user)
    if (!tenantID) return data // tenant-less paths (e.g. superAdmin) aren't plan-scoped

    const tenant = await req.payload.findByID({
      collection: 'tenants',
      id: tenantID,
      depth: 0,
      req,
    })
    const plan = asPlan(tenant?.plan)
    const limit = limitFor(plan, resource)
    if (limit === null) return data // unlimited

    const where: Where =
      resource === 'doctors'
        ? { tenant: { equals: tenantID }, role: { equals: 'doctor' }, active: { not_equals: false } }
        : { tenant: { equals: tenantID } }
    const collection = resource === 'doctors' ? 'users' : 'patients'

    const { totalDocs } = await req.payload.count({ collection, where, req })
    if (totalDocs >= limit) {
      throw new APIError(
        `Your ${planLabel(plan)} plan allows ${limit} ${resource}. Request an upgrade to add more.`,
        403,
        { code: ERROR_CODES.PLAN_LIMIT },
      )
    }
    return data
  }
}

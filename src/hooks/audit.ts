// Audit hooks (v3 spec §2.2). One afterChange hook per audited collection; each
// figures out *what* happened and writes a human-readable summary via logAudit.
// logAudit is best-effort and non-transactional, so these hooks never break the
// underlying write (test 6).

import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { logAudit } from '@/lib/audit'
import { asPlan, planLabel } from '@/lib/plans'

const relID = (value: unknown): string | null => {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return String((value as { id: string | number }).id)
  }
  return String(value)
}

/** Best-effort display name for a related doc (falls back to a generic label). */
async function nameOf(
  req: PayloadRequest,
  collection: 'patients' | 'users',
  id: unknown,
  fallback: string,
): Promise<string> {
  const rid = relID(id)
  if (!rid) return fallback
  try {
    const doc = await req.payload.findByID({ collection, id: rid, depth: 0, overrideAccess: true })
    return (doc as { name?: string })?.name || fallback
  } catch {
    return fallback
  }
}

// ---- Appointments ----
export const auditAppointments: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  const tenantID = relID(doc.tenant)
  const targetId = String(doc.id)
  const base = { targetCollection: 'appointments', targetId, tenantID }

  if (operation === 'create') {
    const patient = await nameOf(req, 'patients', doc.patient, 'a patient')
    const doctor = await nameOf(req, 'users', doc.doctor, 'a doctor')
    await logAudit(req, { ...base, action: 'appointment.created', summary: `Booked ${patient} with ${doctor}` })
    return doc
  }

  if (operation === 'update' && previousDoc && previousDoc.status !== doc.status) {
    const patient = await nameOf(req, 'patients', doc.patient, 'a patient')
    if (doc.status === 'cancelled') {
      const reason = doc.cancellationReason ? ` (reason: ${doc.cancellationReason})` : ''
      await logAudit(req, { ...base, action: 'appointment.cancelled', summary: `Cancelled ${patient}'s appointment${reason}`, meta: { from: previousDoc.status } })
    } else {
      await logAudit(req, { ...base, action: 'appointment.status-changed', summary: `Marked ${patient}'s appointment ${doc.status}`, meta: { from: previousDoc.status, to: doc.status } })
    }
  }
  return doc
}

// ---- Invoices ----
export const auditInvoices: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  const tenantID = relID(doc.tenant)
  const targetId = String(doc.id)
  const base = { targetCollection: 'invoices', targetId, tenantID }
  const number = doc.invoiceNumber || `#${targetId}`

  // Void: false/undefined -> true
  if (operation === 'update' && doc.voided === true && previousDoc?.voided !== true) {
    const reason = doc.voidReason ? ` (reason: ${doc.voidReason})` : ''
    await logAudit(req, { ...base, action: 'invoice.voided', summary: `Voided invoice ${number}${reason}` })
  }

  // New payment added (on create-with-payment or on update that grows the list)
  const prevPayments = (previousDoc?.payments as unknown[] | undefined)?.length ?? 0
  const nowPayments = (doc.payments as unknown[] | undefined)?.length ?? 0
  if (nowPayments > prevPayments) {
    const latest = (doc.payments as { amount?: number }[])[nowPayments - 1]
    const amount = latest?.amount ?? 0
    await logAudit(req, { ...base, action: 'payment.recorded', summary: `Recorded ${doc.currency || ''} ${amount} on invoice ${number}`.replace(/\s+/g, ' ').trim(), meta: { amount, currency: doc.currency } })
  }
  return doc
}

// ---- Users (staff) ----
export const auditUsers: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  // Super admins have no tenant; their own record isn't a clinic audit subject.
  if (doc.role === 'superAdmin') return doc
  const tenantID = relID(doc.tenant)
  const base = { targetCollection: 'users', targetId: String(doc.id), tenantID }

  if (operation === 'create') {
    await logAudit(req, { ...base, action: 'user.created', summary: `Added ${doc.name} as ${doc.role}`, meta: { role: doc.role } })
    return doc
  }

  if (operation === 'update' && previousDoc) {
    if (previousDoc.active !== false && doc.active === false) {
      await logAudit(req, { ...base, action: 'user.deactivated', summary: `Deactivated ${doc.name}` })
    }
    if (previousDoc.role !== doc.role) {
      await logAudit(req, { ...base, action: 'user.role-changed', summary: `Changed ${doc.name}'s role to ${doc.role}`, meta: { from: previousDoc.role, to: doc.role } })
    }
  }
  return doc
}

// ---- Tenants (clinic) ----
export const auditTenants: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (operation !== 'update' || !previousDoc) return doc
  // For tenant events the subject IS this tenant (the actor — a super admin — has none).
  const base = { targetCollection: 'tenants', targetId: String(doc.id), tenantID: String(doc.id) }

  if (previousDoc.status !== doc.status) {
    if (doc.status === 'suspended') {
      await logAudit(req, { ...base, action: 'tenant.suspended', summary: `Suspended ${doc.name}` })
    } else if (previousDoc.status === 'suspended' && doc.status === 'active') {
      await logAudit(req, { ...base, action: 'tenant.reactivated', summary: `Reactivated ${doc.name}` })
    }
    // pending -> active (approval) is intentionally not audited here.
  }

  // Settings edit (owner-facing). Compare the serialised settings group.
  if (JSON.stringify(previousDoc.settings ?? {}) !== JSON.stringify(doc.settings ?? {})) {
    await logAudit(req, { ...base, action: 'settings.updated', summary: `Updated clinic settings for ${doc.name}` })
  }

  // Plan & upgrade-request workflow (spec §5). Approve shows up as plan.changed
  // (the clear is implied); a clear WITHOUT a plan change is a rejection.
  if (previousDoc.plan !== doc.plan) {
    await logAudit(req, {
      ...base,
      action: 'plan.changed',
      summary: `Moved ${doc.name} to the ${planLabel(asPlan(doc.plan))} plan`,
      meta: { from: previousDoc.plan, to: doc.plan },
    })
  }

  const prevRequested = previousDoc.upgradeRequest?.requestedPlan ?? null
  const nowRequested = doc.upgradeRequest?.requestedPlan ?? null
  if (!prevRequested && nowRequested) {
    await logAudit(req, {
      ...base,
      action: 'plan.upgrade-requested',
      summary: `Requested an upgrade to the ${planLabel(asPlan(nowRequested))} plan`,
      meta: { requestedPlan: nowRequested },
    })
  } else if (prevRequested && !nowRequested && previousDoc.plan === doc.plan) {
    await logAudit(req, {
      ...base,
      action: 'plan.upgrade-rejected',
      summary: `Declined ${doc.name}'s upgrade to the ${planLabel(asPlan(prevRequested))} plan`,
      meta: { requestedPlan: prevRequested },
    })
  }
  return doc
}

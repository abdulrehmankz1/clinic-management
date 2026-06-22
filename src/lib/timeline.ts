// Patient timeline (v2 spec §4.4) — a merged, chronological feed of a patient's
// visits, invoices and (only cancelled/no-show) appointments. Each source is a
// DB-side query with its own `where` + limit (never load-all); we merge and sort
// in memory. Completed appointments are intentionally omitted — they surface
// through their visit, so the feed reads as one event per real-world moment.

import type { Payload } from 'payload'
import type { Appointment, Invoice, User, Visit } from '@/payload-types'
import type { AppointmentStatus, InvoiceStatus } from './constants'

export type TimelineEvent =
  | {
      kind: 'visit'
      id: string
      at: string
      diagnosis: string | null
      doctorName: string | null
      rxCount: number
    }
  | {
      kind: 'invoice'
      id: string
      at: string
      invoiceNumber: string
      status: InvoiceStatus | 'voided'
      amount: number
      currency: string | null
    }
  | {
      kind: 'appointment'
      id: string
      at: string
      status: AppointmentStatus
      doctorName: string | null
      reason: string | null
    }

const doctorName = (doctor: unknown): string | null =>
  doctor && typeof doctor === 'object' ? ((doctor as User).name ?? null) : null

/**
 * Build the merged timeline for one patient, newest first.
 * @param limit per-source row cap (the feed shows up to ~3×limit events).
 */
export async function getPatientTimeline(
  payload: Payload,
  tenantID: string,
  patientID: string,
  limit = 20,
): Promise<TimelineEvent[]> {
  const base = { tenant: { equals: tenantID }, patient: { equals: patientID } }

  const [visitsRes, invoicesRes, apptsRes] = await Promise.all([
    payload.find({
      collection: 'visits',
      where: base,
      sort: '-visitDate',
      limit,
      depth: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'invoices',
      where: base,
      sort: '-createdAt',
      limit,
      depth: 0,
      overrideAccess: true,
    }),
    // Only cancelled / no-show appointments — completed ones show via their visit.
    payload.find({
      collection: 'appointments',
      where: { ...base, status: { in: ['cancelled', 'no-show'] } },
      sort: '-start',
      limit,
      depth: 1,
      overrideAccess: true,
    }),
  ])

  const events: TimelineEvent[] = []

  for (const v of visitsRes.docs as Visit[]) {
    events.push({
      kind: 'visit',
      id: String(v.id),
      at: (v.visitDate ?? v.createdAt) as string,
      diagnosis: v.diagnosis || null,
      doctorName: doctorName(v.doctor),
      rxCount: Array.isArray(v.prescription) ? v.prescription.length : 0,
    })
  }

  for (const inv of invoicesRes.docs as Invoice[]) {
    events.push({
      kind: 'invoice',
      id: String(inv.id),
      at: inv.createdAt as string,
      invoiceNumber: inv.invoiceNumber ?? '',
      status: inv.voided ? 'voided' : ((inv.paymentStatus ?? 'unpaid') as InvoiceStatus),
      amount: inv.totalAmount ?? 0,
      currency: inv.currency ?? null,
    })
  }

  for (const a of apptsRes.docs as Appointment[]) {
    events.push({
      kind: 'appointment',
      id: String(a.id),
      at: a.start as string,
      status: a.status as AppointmentStatus,
      doctorName: doctorName(a.doctor),
      reason: a.reason || null,
    })
  }

  return events.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())
}

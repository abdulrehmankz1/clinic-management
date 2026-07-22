// CSV export endpoint (v4 spec §A.2): /api/export/{appointments|patients|invoices}?from&to
// Auth + tenant scope are enforced server-side: owners export their own clinic,
// a super admin passes ?tenant=<id>. Rows stream from the Local API in pages of
// 500, capped at 10k (narrow the range beyond that). Patient exports carry PII
// (phone numbers), so every export writes an `export.generated` audit entry.

import { getPayload } from 'payload'
import type { Payload, PayloadRequest, Where } from 'payload'
import config from '@payload-config'
import type { Appointment, Invoice, Patient, Tenant, User } from '@/payload-types'
import { getTenantID, isSuperAdmin } from '@/access'
import { toCsv, type CsvValue } from '@/lib/csv'
import { logAudit } from '@/lib/audit'
import { formatDateTime } from '@/lib/format'

const PAGE_SIZE = 500
const MAX_ROWS = 10_000

type ExportType = 'appointments' | 'patients' | 'invoices'
const EXPORT_TYPES: ExportType[] = ['appointments', 'patients', 'invoices']

/** The date field that `from`/`to` filter on, per type. */
const RANGE_FIELD: Record<ExportType, string> = {
  appointments: 'start',
  patients: 'createdAt',
  invoices: 'createdAt',
}

const relName = (v: unknown): string =>
  v && typeof v === 'object' && 'name' in (v as Record<string, unknown>)
    ? String((v as { name: unknown }).name)
    : ''

const bad = (status: number, message: string) => Response.json({ error: message }, { status })

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params
  if (!EXPORT_TYPES.includes(type as ExportType)) return bad(404, 'Unknown export type.')

  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: req.headers as never })
  if (!user) return bad(401, 'Sign in to export data.')

  // Route-level access (spec §A.3): owner + superAdmin only.
  const actor = user as unknown as User
  if (actor.role !== 'owner' && !isSuperAdmin(actor)) {
    return bad(403, 'Only the clinic owner can export data.')
  }

  const url = new URL(req.url)
  // Tenant scope is never client-chosen for owners — it comes from the session.
  const tenantID = isSuperAdmin(actor) ? url.searchParams.get('tenant') : getTenantID(actor)
  if (!tenantID) return bad(400, 'A clinic is required for exports.')

  const from = new Date(url.searchParams.get('from') ?? '')
  const to = new Date(url.searchParams.get('to') ?? '')
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return bad(400, 'Provide a valid from/to range.')
  }

  const where: Where = {
    tenant: { equals: tenantID },
    [RANGE_FIELD[type as ExportType]]: {
      greater_than_equal: from.toISOString(),
      less_than: to.toISOString(),
    },
  }

  const probe = await payload.count({ collection: type as ExportType, where, overrideAccess: true })
  if (probe.totalDocs > MAX_ROWS) {
    return bad(400, `Export is capped at ${MAX_ROWS.toLocaleString('en')} rows — narrow the date range.`)
  }

  const tenant = (await payload
    .findByID({ collection: 'tenants', id: tenantID, depth: 0, overrideAccess: true })
    .catch(() => null)) as Tenant | null
  if (!tenant) return bad(400, 'A clinic is required for exports.')

  const { headers, rows } = await collectRows(payload, type as ExportType, where, tenant)

  // PII leaves the system — record who took what (spec §A.2).
  await logAudit({ payload, user: actor } as unknown as PayloadRequest, {
    action: 'export.generated',
    targetCollection: type,
    targetId: tenantID,
    tenantID,
    summary: `Exported ${rows.length} ${type} row${rows.length === 1 ? '' : 's'} as CSV`,
    meta: { from: from.toISOString(), to: to.toISOString() },
  })

  const day = (d: Date) => d.toISOString().slice(0, 10)
  const filename = `matab-${type}-${tenant.slug || tenantID}-${day(from)}-${day(to)}.csv`
  return new Response(toCsv(headers, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

async function collectRows(
  payload: Payload,
  type: ExportType,
  where: Where,
  tenant: Tenant,
): Promise<{ headers: string[]; rows: CsvValue[][] }> {
  const rows: CsvValue[][] = []
  let page = 1
  let hasNext = true
  while (hasNext && rows.length < MAX_ROWS) {
    const res = await payload.find({
      collection: type,
      where,
      limit: PAGE_SIZE,
      page,
      sort: RANGE_FIELD[type],
      depth: 1, // patient/doctor names in appointment & invoice rows
      overrideAccess: true,
    })
    for (const doc of res.docs) rows.push(rowFor(type, doc as never, tenant))
    hasNext = res.hasNextPage
    page += 1
  }

  const headers: Record<ExportType, string[]> = {
    appointments: ['Date & time', 'Patient', 'Doctor', 'Status', 'Reason', 'Duration (mins)'],
    patients: ['MRN', 'Name', 'Phone', 'Gender', 'Age', 'Registered'],
    invoices: ['Invoice #', 'Patient', 'Total', 'Paid', 'Balance due', 'Status', 'Currency', 'Created'],
  }
  return { headers: headers[type], rows }
}

function rowFor(type: ExportType, doc: Appointment | Patient | Invoice, tenant: Tenant): CsvValue[] {
  if (type === 'appointments') {
    const a = doc as Appointment
    return [
      formatDateTime(a.start, tenant),
      relName(a.patient),
      relName(a.doctor),
      a.status,
      a.reason ?? '',
      a.durationMins ?? '',
    ]
  }
  if (type === 'patients') {
    const p = doc as Patient
    return [
      p.mrn ?? '',
      p.name,
      p.phone ?? '',
      p.gender ?? '',
      p.ageYears ?? '',
      formatDateTime(p.createdAt, tenant),
    ]
  }
  const inv = doc as Invoice
  return [
    inv.invoiceNumber ?? '',
    relName(inv.patient),
    inv.totalAmount ?? 0,
    inv.amountPaid ?? 0,
    inv.balanceDue ?? 0,
    inv.voided ? 'voided' : (inv.paymentStatus ?? 'unpaid'),
    inv.currency ?? '',
    formatDateTime(inv.createdAt, tenant),
  ]
}

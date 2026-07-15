// Daily appointment digest (v3 spec §6.1). The cron fires EVERY hour; each run
// only emails the tenants whose local clock reads ~07:00 — one hourly cron serves
// every timezone without per-tenant schedules. A tenant failing (bad email, API
// hiccup) is logged and skipped; the loop itself never throws.

import type { Payload } from 'payload'
import type { Appointment, Patient, Tenant, User } from '@/payload-types'
import { ACTIVE_STATUSES, DEFAULT_TIMEZONE } from './constants'
import { startOfDayInTz } from './reports'
import { formatTime, formatDate } from './format'
import { sendEmail, type SendEmail } from './email'

/** Tenant-local hour at which the digest goes out. */
export const DIGEST_HOUR = 7

/** The hour (0–23) on a wall clock in `tz` at the given instant. */
export function hourInTz(date: Date, tz: string): number {
  return (
    Number(
      new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }).format(
        date,
      ),
    ) % 24 // Intl renders midnight as "24" in some locales
  )
}

export type DigestSummary = {
  sent: string[]
  skipped: string[]
  failed: string[]
}

export async function runDailyDigest({
  payload,
  now = new Date(),
  force = false,
  send = sendEmail,
}: {
  payload: Payload
  now?: Date
  /** Ignore the 07:00 gate — for manual runs and demos (still behind CRON_SECRET). */
  force?: boolean
  /** Injectable for tests. */
  send?: SendEmail
}): Promise<DigestSummary> {
  const summary: DigestSummary = { sent: [], skipped: [], failed: [] }

  const tenants = await payload.find({
    collection: 'tenants',
    where: { status: { equals: 'active' } },
    limit: 500,
    overrideAccess: true,
  })

  for (const tenant of tenants.docs as Tenant[]) {
    const label = tenant.name
    try {
      const tz = tenant.settings?.timezone || DEFAULT_TIMEZONE
      if (!force && hourInTz(now, tz) !== DIGEST_HOUR) {
        summary.skipped.push(`${label} — not ${DIGEST_HOUR}:00 locally`)
        continue
      }

      // "Today" on the tenant's wall clock.
      const dayStart = startOfDayInTz(tz, 0, now)
      const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000)
      const appts = await payload.find({
        collection: 'appointments',
        where: {
          tenant: { equals: tenant.id },
          start: { greater_than_equal: dayStart.toISOString(), less_than: dayEnd.toISOString() },
          status: { in: ACTIVE_STATUSES },
        },
        depth: 1,
        sort: 'start',
        limit: 200,
        overrideAccess: true,
      })
      if (appts.totalDocs === 0) {
        summary.skipped.push(`${label} — no appointments today`)
        continue
      }

      const owners = await payload.find({
        collection: 'users',
        where: { tenant: { equals: tenant.id }, role: { equals: 'owner' } },
        limit: 1,
        overrideAccess: true,
      })
      const ownerEmail = (owners.docs[0] as User | undefined)?.email
      if (!ownerEmail) {
        summary.skipped.push(`${label} — no owner email`)
        continue
      }

      const res = await send({
        to: ownerEmail,
        subject: `${tenant.name}: ${appts.totalDocs} appointment${appts.totalDocs === 1 ? '' : 's'} today`,
        html: digestHtml(tenant, appts.docs as Appointment[], now),
      })
      if (res.ok) summary.sent.push(label)
      else if (res.skipped) summary.skipped.push(`${label} — email not configured`)
      else {
        summary.failed.push(label)
        payload.logger?.error?.({ tenant: label, error: res.error }, 'digest email failed')
      }
    } catch (err) {
      // One broken tenant must never take down the rest of the run.
      summary.failed.push(label)
      payload.logger?.error?.({ err, tenant: label }, 'digest failed for tenant (continuing)')
    }
  }

  return summary
}

function digestHtml(tenant: Tenant, appts: Appointment[], now: Date): string {
  const rows = appts
    .map((a) => {
      // First name only — enough for a schedule, no full record in an inbox.
      const firstName = ((a.patient as Patient)?.name ?? 'Patient').split(/\s+/)[0]
      const doctor = (a.doctor as User)?.name ?? '—'
      return `<tr>
        <td style="padding:6px 14px 6px 0;white-space:nowrap;font-variant-numeric:tabular-nums">${formatTime(a.start, tenant)}</td>
        <td style="padding:6px 14px 6px 0">${firstName}</td>
        <td style="padding:6px 0;color:#4b5f5a">${doctor}</td>
      </tr>`
    })
    .join('')

  return `<div style="font-family:Segoe UI,system-ui,sans-serif;color:#1c2422;max-width:520px">
    <h2 style="margin:0 0 2px;font-size:18px">${tenant.name}</h2>
    <p style="margin:0 0 16px;color:#4b5f5a;font-size:14px">
      Today's schedule — ${formatDate(now, tenant)} · ${appts.length} appointment${appts.length === 1 ? '' : 's'}
    </p>
    <table style="border-collapse:collapse;font-size:14px">${rows}</table>
    <p style="margin:18px 0 0;font-size:12px;color:#8aa19b">
      Sent by matab at 7:00 your local time. Manage appointments on your dashboard.
    </p>
  </div>`
}

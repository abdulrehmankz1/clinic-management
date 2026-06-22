// Dashboard aggregation — DB-side counts and ranges only, never load-all (the
// same discipline as a reports module that scales). Day boundaries are computed
// in the tenant's timezone so "today" matches what the clinic sees.

import type { Payload, Where } from 'payload'
import type { Appointment, Invoice, Patient, Tenant } from '@/payload-types'
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from './constants'

/** Offset (tz - UTC) in ms at a given instant. */
export function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const map: Record<string, number> = {}
  for (const p of dtf.formatToParts(date)) if (p.type !== 'literal') map[p.type] = Number(p.value)
  const asUTC = Date.UTC(map.year, map.month - 1, map.day, map.hour === 24 ? 0 : map.hour, map.minute, map.second)
  return asUTC - date.getTime()
}

/** First day of the current month (00:00) in tz, returned as a UTC Date. */
export function startOfMonthInTz(tz: string, now = new Date()): Date {
  const offset = tzOffsetMs(now, tz)
  const local = new Date(now.getTime() + offset)
  const startLocalAsUTC = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 0, 0, 0)
  return new Date(startLocalAsUTC - offset)
}

/** Midnight (start of day) in tz for `today + dayOffset`, returned as a UTC Date. */
export function startOfDayInTz(tz: string, dayOffset = 0, now = new Date()): Date {
  const offset = tzOffsetMs(now, tz)
  const local = new Date(now.getTime() + offset)
  const startLocalAsUTC = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + dayOffset,
    0,
    0,
    0,
  )
  return new Date(startLocalAsUTC - offset)
}

const tzOf = (tenant: Tenant | null) => tenant?.settings?.timezone || DEFAULT_TIMEZONE

/** Convert a wall-clock date+time in `tz` (e.g. "2026-06-15" + "17:30") to a UTC Date. */
export function wallTimeToUTC(tz: string, dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const guessUTC = Date.UTC(y, m - 1, d, hh, mm, 0)
  const offset = tzOffsetMs(new Date(guessUTC), tz)
  return new Date(guessUTC - offset)
}

type CountArgs = { tenant: { equals: string } } & Record<string, unknown>

export type DashboardData = {
  todayCount: number
  completedToday: number
  noShowsToday: number
  newPatients7d: number
  series: { label: string; count: number }[]
  upcoming: Appointment[]
}

export async function getDashboardData(
  payload: Payload,
  tenantID: string,
  tenant: Tenant | null,
): Promise<DashboardData> {
  const tz = tzOf(tenant)
  const todayStart = startOfDayInTz(tz, 0)
  const tomorrowStart = startOfDayInTz(tz, 1)
  const weekAgo = startOfDayInTz(tz, -6)

  const base: CountArgs = { tenant: { equals: tenantID } }
  const inToday = {
    start: { greater_than_equal: todayStart.toISOString(), less_than: tomorrowStart.toISOString() },
  }

  const count = (where: Record<string, unknown>) =>
    payload
      .count({ collection: 'appointments', where: { ...base, ...where } as Where, overrideAccess: true })
      .then((r) => r.totalDocs)

  const [todayCount, completedToday, noShowsToday, newPatients7d, upcomingRes] = await Promise.all([
    count(inToday),
    count({ ...inToday, status: { equals: 'completed' } }),
    count({ ...inToday, status: { equals: 'no-show' } }),
    payload
      .count({
        collection: 'patients',
        where: { tenant: { equals: tenantID }, createdAt: { greater_than_equal: weekAgo.toISOString() } },
        overrideAccess: true,
      })
      .then((r) => r.totalDocs),
    payload.find({
      collection: 'appointments',
      where: {
        ...base,
        start: { greater_than_equal: new Date().toISOString(), less_than: tomorrowStart.toISOString() },
        status: { in: ['scheduled', 'checked-in'] },
      },
      sort: 'start',
      limit: 8,
      depth: 1,
      overrideAccess: true,
    }),
  ])

  // 14-day series: one count per day.
  const days = Array.from({ length: 14 }, (_, i) => 13 - i)
  const series = await Promise.all(
    days.map(async (back) => {
      const dayStart = startOfDayInTz(tz, -back)
      const dayEnd = startOfDayInTz(tz, -back + 1)
      const c = await count({
        start: { greater_than_equal: dayStart.toISOString(), less_than: dayEnd.toISOString() },
      })
      const label = dayStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz })
      return { label, count: c }
    }),
  )

  return {
    todayCount,
    completedToday,
    noShowsToday,
    newPatients7d,
    series,
    upcoming: upcomingRes.docs as Appointment[],
  }
}

export type OutstandingRow = {
  id: string
  invoiceNumber: string
  patientName: string
  balanceDue: number
  currency: string
}

export type RevenueData = {
  revenueToday: number
  revenueMonth: number
  outstandingTotal: number
  outstanding: OutstandingRow[]
  series: { label: string; amount: number }[]
  currency: string
}

/**
 * Revenue & outstanding for the owner dashboard. Revenue is payments-based (so a
 * partial payment counts the moment it's received) and voided invoices are excluded.
 * Demo-scale: we read the tenant's non-voided invoices and total their payments in JS
 * (Payload/Mongo has no first-class sum over a nested array).
 */
export async function getRevenueData(
  payload: Payload,
  tenantID: string,
  tenant: Tenant | null,
): Promise<RevenueData> {
  const tz = tzOf(tenant)
  const currency = tenant?.settings?.currency || DEFAULT_CURRENCY
  const todayStart = startOfDayInTz(tz, 0).getTime()
  const tomorrow = startOfDayInTz(tz, 1).getTime()
  const monthStart = startOfMonthInTz(tz).getTime()

  // 14-day revenue buckets (ascending day boundaries) — one bucket per day in tz.
  const dayStarts = Array.from({ length: 14 }, (_, i) => startOfDayInTz(tz, -(13 - i)).getTime())
  const seriesAmounts = new Array(14).fill(0) as number[]

  const res = await payload.find({
    collection: 'invoices',
    where: { tenant: { equals: tenantID }, voided: { not_equals: true } },
    limit: 1000,
    depth: 1,
    overrideAccess: true,
  })
  const invoices = res.docs as Invoice[]

  let revenueToday = 0
  let revenueMonth = 0
  let outstandingTotal = 0
  for (const inv of invoices) {
    for (const p of inv.payments ?? []) {
      const t = p.receivedAt ? new Date(p.receivedAt).getTime() : 0
      const amt = Number(p.amount ?? 0)
      if (t >= todayStart && t < tomorrow) revenueToday += amt
      if (t >= monthStart) revenueMonth += amt
      // Drop into its day bucket (only if within the 14-day window).
      if (t >= dayStarts[0] && t < tomorrow) {
        let k = 13
        while (k > 0 && t < dayStarts[k]) k--
        seriesAmounts[k] += amt
      }
    }
    outstandingTotal += inv.balanceDue ?? 0
  }

  const series = dayStarts.map((ms, i) => ({
    label: new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz }),
    amount: Math.round(seriesAmounts[i]),
  }))

  const outstanding: OutstandingRow[] = invoices
    .filter((inv) => (inv.balanceDue ?? 0) > 0)
    .sort((a, b) => (b.balanceDue ?? 0) - (a.balanceDue ?? 0))
    .slice(0, 5)
    .map((inv) => ({
      id: String(inv.id),
      invoiceNumber: inv.invoiceNumber ?? '',
      patientName: (inv.patient as Patient)?.name ?? 'Patient',
      balanceDue: inv.balanceDue ?? 0,
      currency: inv.currency || currency,
    }))

  return {
    revenueToday: Math.round(revenueToday),
    revenueMonth: Math.round(revenueMonth),
    outstandingTotal: Math.round(outstandingTotal),
    outstanding,
    series,
    currency,
  }
}

// Dashboard aggregation — DB-side counts and ranges only, never load-all (the
// same discipline as a reports module that scales). Day boundaries are computed
// in the tenant's timezone so "today" matches what the clinic sees.

import type { Payload, Where } from 'payload'
import type { Appointment, Invoice, Patient, Tenant, User, Visit } from '@/payload-types'
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

// --- v4-A: monthly report ---------------------------------------------------

/**
 * UTC instants bounding a whole month on the tenant's wall clock (month 1–12).
 * "June" for a Karachi clinic is not "June UTC" — boundaries respect the
 * tenant's timezone (v4 spec §A.2).
 */
export function monthRangeUtc(tz: string, year: number, month: number): { start: Date; end: Date } {
  const startGuess = new Date(Date.UTC(year, month - 1, 1))
  const endGuess = new Date(Date.UTC(year, month, 1))
  return {
    start: new Date(startGuess.getTime() - tzOffsetMs(startGuess, tz)),
    end: new Date(endGuess.getTime() - tzOffsetMs(endGuess, tz)),
  }
}

export type DoctorReportRow = {
  id: string
  name: string
  total: number
  completed: number
  noShows: number
  /** no-shows / total appointments that month, 0–1. */
  noShowRate: number
  /** Payments received that month on invoices whose visit belongs to this doctor. */
  revenue: number
}

export type MonthlyReport = {
  year: number
  month: number
  currency: string
  appointments: {
    total: number
    completed: number
    cancelled: number
    noShows: number
    /** completed / total, 0–1 (0 when the month is empty). */
    completionRate: number
  }
  newPatients: number
  /** Payments received inside the month (voided invoices excluded). */
  revenueCollected: number
  /** Balance still due on invoices *created* inside the month. */
  outstandingAdded: number
  /** One bucket per calendar day of the month, tenant-local. */
  daily: { label: string; amount: number }[]
  doctors: DoctorReportRow[]
}

/**
 * Everything the owner's monthly report shows. Same demo-scale discipline as
 * getRevenueData: counts stay DB-side where cheap; the month's appointments and
 * the tenant's invoices are read once (bounded) and reduced in JS, because
 * payments live in a nested array Mongo can't sum for us.
 */
export async function getMonthlyReport(
  payload: Payload,
  tenantID: string,
  tenant: Tenant | null,
  year: number,
  month: number,
): Promise<MonthlyReport> {
  const tz = tzOf(tenant)
  const currency = tenant?.settings?.currency || DEFAULT_CURRENCY
  const { start, end } = monthRangeUtc(tz, year, month)
  const inMonth = (iso: string | null | undefined): boolean => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return t >= start.getTime() && t < end.getTime()
  }

  const [apptsRes, invoicesRes, doctorsRes, newPatients] = await Promise.all([
    payload.find({
      collection: 'appointments',
      where: {
        tenant: { equals: tenantID },
        start: { greater_than_equal: start.toISOString(), less_than: end.toISOString() },
      },
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    }),
    // All non-voided invoices, not just the month's: a payment received this month
    // may sit on an invoice created earlier. depth 1 populates the visit, whose
    // doctor id drives the per-doctor revenue split.
    payload.find({
      collection: 'invoices',
      where: { tenant: { equals: tenantID }, voided: { not_equals: true } },
      limit: 1000,
      depth: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'users',
      where: { tenant: { equals: tenantID }, role: { equals: 'doctor' } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    }),
    payload
      .count({
        collection: 'patients',
        where: {
          tenant: { equals: tenantID },
          createdAt: { greater_than_equal: start.toISOString(), less_than: end.toISOString() },
        },
        overrideAccess: true,
      })
      .then((r) => r.totalDocs),
  ])

  // --- appointments: summary + per-doctor tallies from one pass ---
  const summary = { total: 0, completed: 0, cancelled: 0, noShows: 0 }
  const byDoctor = new Map<string, { total: number; completed: number; noShows: number; revenue: number }>()
  for (const d of doctorsRes.docs as User[]) {
    byDoctor.set(String(d.id), { total: 0, completed: 0, noShows: 0, revenue: 0 })
  }
  const relId = (v: unknown): string =>
    v && typeof v === 'object' && 'id' in (v as Record<string, unknown>)
      ? String((v as { id: unknown }).id)
      : String(v)

  for (const a of apptsRes.docs as Appointment[]) {
    summary.total += 1
    if (a.status === 'completed') summary.completed += 1
    if (a.status === 'cancelled') summary.cancelled += 1
    if (a.status === 'no-show') summary.noShows += 1

    const doc = byDoctor.get(relId(a.doctor))
    if (doc) {
      doc.total += 1
      if (a.status === 'completed') doc.completed += 1
      if (a.status === 'no-show') doc.noShows += 1
    }
  }

  // --- revenue: month's payments, bucketed per tenant-local day + per doctor ---
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const dailyAmounts = new Array(daysInMonth).fill(0) as number[]
  let revenueCollected = 0
  let outstandingAdded = 0

  for (const inv of invoicesRes.docs as Invoice[]) {
    const doctorId = inv.visit ? relId((inv.visit as Visit).doctor) : null
    for (const p of inv.payments ?? []) {
      if (!inMonth(p.receivedAt)) continue
      const amt = Number(p.amount ?? 0)
      revenueCollected += amt
      // Calendar day on the tenant's wall clock — DST-safe (no fixed 24h math).
      const day = Number(
        new Date(p.receivedAt!).toLocaleDateString('en-CA', { timeZone: tz }).slice(8, 10),
      )
      if (day >= 1 && day <= daysInMonth) dailyAmounts[day - 1] += amt
      if (doctorId && byDoctor.has(doctorId)) byDoctor.get(doctorId)!.revenue += amt
    }
    if (inMonth(inv.createdAt)) outstandingAdded += inv.balanceDue ?? 0
  }

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'short',
  })
  const daily = dailyAmounts.map((amount, i) => ({
    label: `${i + 1} ${monthLabel}`,
    amount: Math.round(amount),
  }))

  const doctors: DoctorReportRow[] = (doctorsRes.docs as User[])
    .map((d) => {
      const t = byDoctor.get(String(d.id))!
      return {
        id: String(d.id),
        name: d.name,
        total: t.total,
        completed: t.completed,
        noShows: t.noShows,
        noShowRate: t.total > 0 ? t.noShows / t.total : 0,
        revenue: Math.round(t.revenue),
      }
    })
    // Quiet doctors (no activity, no revenue) stay out of the report's way.
    .filter((r) => r.total > 0 || r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue || b.completed - a.completed)

  return {
    year,
    month,
    currency,
    appointments: {
      ...summary,
      completionRate: summary.total > 0 ? summary.completed / summary.total : 0,
    },
    newPatients,
    revenueCollected: Math.round(revenueCollected),
    outstandingAdded: Math.round(outstandingAdded),
    daily,
    doctors,
  }
}

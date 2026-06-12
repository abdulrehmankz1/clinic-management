import Link from 'next/link'
import { requireDashboardSession, getPayloadClient } from '@/lib/auth'
import { getTenantID } from '@/access'
import { startOfDayInTz } from '@/lib/reports'
import { formatTime } from '@/lib/format'
import { btnPrimary, PageTitle } from '@/components/primitives'
import { IconChevronLeft, IconChevronRight, IconPlus } from '@/components/icons'
import { DayRail, type DoctorColumn } from '@/components/DayRail'
import { hhmmToMinutes, windowOf, weekdayInTz, minutesInTz } from '@/lib/availability'
import { DEFAULT_TIMEZONE, WEEKDAYS, type AppointmentStatus } from '@/lib/constants'
import type { Appointment, Patient, User } from '@/payload-types'

function minutesFromMidnight(date: Date, tz: string): number {
  return minutesInTz(date, tz)
}

function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return dt.toISOString().slice(0, 10)
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { user, tenant } = await requireDashboardSession()
  const payload = await getPayloadClient()
  const tenantID = getTenantID(user)!
  const tz = tenant?.settings?.timezone || DEFAULT_TIMEZONE

  const params = await searchParams
  const todayStr = startOfDayInTz(tz, 0).toLocaleDateString('en-CA', { timeZone: tz })
  const dateStr = params.date || todayStr
  const isToday = dateStr === todayStr

  // Day range in tenant tz for the chosen date.
  const [y, m, d] = dateStr.split('-').map(Number)
  const dayStart = startOfDayInTz(tz, 0, new Date(Date.UTC(y, m - 1, d, 12)))
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000)

  const [doctorsRes, apptsRes] = await Promise.all([
    payload.find({
      collection: 'users',
      where: { tenant: { equals: tenantID }, role: { equals: 'doctor' }, active: { equals: true } },
      limit: 50,
      overrideAccess: true,
      sort: 'name',
    }),
    payload.find({
      collection: 'appointments',
      where: {
        tenant: { equals: tenantID },
        start: { greater_than_equal: dayStart.toISOString(), less_than: dayEnd.toISOString() },
      },
      limit: 200,
      depth: 1,
      overrideAccess: true,
      sort: 'start',
    }),
  ])

  const openMinutes = hhmmToMinutes(tenant?.settings?.openTime || '09:00')
  const closeMinutes = hhmmToMinutes(tenant?.settings?.closeTime || '21:00')
  const viewedWeekday = weekdayInTz(dayStart, tz)
  const nowMinutes = isToday ? minutesFromMidnight(new Date(), tz) : null

  const columns: DoctorColumn[] = (doctorsRes.docs as User[]).map((doc) => {
    const type = (doc.availabilityType as string) || 'regular'
    let windowFrom: number | null = null
    let windowTo: number | null = null
    let availabilityNote: string | null = null

    if (type === 'onCall') {
      availabilityNote = 'On call'
    } else if (type === 'byAppointment') {
      availabilityNote = 'By appointment'
    } else {
      const days = (doc.availableDays as string[] | undefined) || []
      const onToday = days.length === 0 || days.includes(viewedWeekday)
      const win = windowOf(doc)
      if (onToday) {
        windowFrom = hhmmToMinutes(win.from)
        windowTo = hhmmToMinutes(win.to)
      } else {
        const dayList = WEEKDAYS.filter((w) => days.includes(w.value)).map((w) => w.label).join('/')
        availabilityNote = `Off today · ${dayList || '—'}`
      }
    }

    return {
      id: String(doc.id),
      name: doc.name,
      windowFrom,
      windowTo,
      availabilityNote,
      blocks: (apptsRes.docs as Appointment[])
        .filter((a) => String((a.doctor as User)?.id ?? a.doctor) === String(doc.id))
        .map((a) => ({
          id: String(a.id),
          patientName: (a.patient as Patient)?.name ?? 'Patient',
          reason: a.reason ?? '',
          status: a.status as AppointmentStatus,
          timeLabel: formatTime(a.start, tenant),
          startMinutes: minutesFromMidnight(new Date(a.start), tz),
          durationMins: a.durationMins,
          isWalkIn: Boolean(a.isWalkIn),
          token: (a as { tokenNumber?: string }).tokenNumber,
          doctorName: doc.name,
        })),
    }
  })

  const prettyDate = new Date(dayStart).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  })
  const totalToday = apptsRes.docs.length

  return (
    <div>
      <PageTitle
        subtitle={`${prettyDate} · ${totalToday} appointment${totalToday === 1 ? '' : 's'}`}
        action={
          <>
            <div className="flex items-center rounded-lg border border-border bg-surface">
              <Link
                href={`/dashboard/appointments?date=${addDays(dateStr, -1)}`}
                className="flex size-9 items-center justify-center rounded-s-lg text-muted-foreground transition-colors hover:bg-canvas hover:text-ink"
                title="Previous day"
              >
                <IconChevronLeft size={15} />
              </Link>
              <Link
                href="/dashboard/appointments"
                className={`tabular border-x border-border px-3.5 text-[13px] font-medium leading-9 transition-colors hover:bg-canvas ${
                  isToday ? 'text-primary' : 'text-ink'
                }`}
              >
                {isToday ? 'Today' : dateStr}
              </Link>
              <Link
                href={`/dashboard/appointments?date=${addDays(dateStr, 1)}`}
                className="flex size-9 items-center justify-center rounded-e-lg text-muted-foreground transition-colors hover:bg-canvas hover:text-ink"
                title="Next day"
              >
                <IconChevronRight size={15} />
              </Link>
            </div>
            <Link href="/dashboard/appointments/new" className={btnPrimary}>
              <IconPlus size={15} />
              New appointment
            </Link>
          </>
        }
      >
        Appointments
      </PageTitle>

      <DayRail
        columns={columns}
        openMinutes={openMinutes}
        closeMinutes={closeMinutes}
        nowMinutes={nowMinutes}
      />
    </div>
  )
}

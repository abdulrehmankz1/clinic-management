import Link from 'next/link'
import { requireDashboardSession, getPayloadClient } from '@/lib/auth'
import { getTenantID } from '@/access'
import { startOfDayInTz } from '@/lib/reports'
import { windowOf, formatWindow } from '@/lib/availability'
import { BookingForm, type DoctorOption } from '@/components/BookingForm'
import { DEFAULT_TIMEZONE, WEEKDAYS } from '@/lib/constants'
import { EmptyState, Avatar } from '@/components/primitives'
import type { User } from '@/payload-types'

function noteFor(d: User): { tag: string; note: string } {
  const type = (d.availabilityType as string) || 'regular'
  if (type === 'onCall') return { tag: 'onCall', note: 'On call' }
  if (type === 'byAppointment') return { tag: 'byAppointment', note: 'By appointment' }
  const days = (d.availableDays as string[] | undefined) || []
  const allDays = days.length === 0 || days.length === 7
  const dayLabel = allDays
    ? 'Daily'
    : WEEKDAYS.filter((w) => days.includes(w.value)).map((w) => w.label).join('/')
  return { tag: 'regular', note: `${dayLabel} · ${formatWindow(windowOf(d))}` }
}

export default async function NewAppointmentPage() {
  const { user, tenant } = await requireDashboardSession()
  const payload = await getPayloadClient()
  const tenantID = getTenantID(user)!
  const tz = tenant?.settings?.timezone || DEFAULT_TIMEZONE

  const doctorsRes = await payload.find({
    collection: 'users',
    where: { tenant: { equals: tenantID }, role: { equals: 'doctor' }, active: { equals: true } },
    limit: 50,
    sort: 'name',
    overrideAccess: true,
  })

  const doctors: DoctorOption[] = (doctorsRes.docs as User[]).map((d) => {
    const { tag, note } = noteFor(d)
    return { id: String(d.id), name: d.name, tag, note }
  })
  const todayStr = startOfDayInTz(tz, 0).toLocaleDateString('en-CA', { timeZone: tz })

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard/appointments"
        className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-ink"
      >
        ‹ Appointments
      </Link>
      <h1 className="mt-2 mb-6 text-[1.45rem] font-semibold">New appointment</h1>

      {doctors.length === 0 ? (
        <EmptyState message="Add a doctor before booking appointments." actionHref="/dashboard/staff" actionLabel="Go to staff" />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <BookingForm
            doctors={doctors}
            defaultDate={todayStr}
            defaultDuration={tenant?.settings?.appointmentDurationMins ?? 15}
            openTime={tenant?.settings?.openTime ?? '09:00'}
            closeTime={tenant?.settings?.closeTime ?? '21:00'}
          />

          {/* Availability cheat-sheet — answers "kaun kab baithta hai" while booking */}
          <aside className="card-flat sticky top-6 hidden overflow-hidden lg:block">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Doctors &amp; timings</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Quick reference while you book.</p>
            </div>
            <ul className="divide-y divide-border">
              {doctors.map((d) => (
                <li key={d.id} className="flex items-start gap-2.5 px-4 py-2.5">
                  <Avatar name={d.name} size="sm" />
                  <div className="min-w-0 leading-tight">
                    <div className="truncate text-[13px] font-semibold">{d.name}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{d.note}</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t bg-muted/40 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
              Walk-ins check in immediately and get a queue token. Overlapping slots are rejected
              automatically.
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

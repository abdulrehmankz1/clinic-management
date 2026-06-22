import Link from 'next/link'
import { requireDashboardSession, getPayloadClient } from '@/lib/auth'
import { getTenantID } from '@/access'
import { getDashboardData, getRevenueData, startOfDayInTz } from '@/lib/reports'
import { formatTime, formatMoney } from '@/lib/format'
import { windowOf, weekdayInTz } from '@/lib/availability'
import { KpiCard, StatusBadge, EmptyState } from '@/components/ui-kit'
import { btnPrimary, Avatar } from '@/components/primitives'
import {
  IconPlus,
  IconCalendar,
  IconCalendarCheck,
  IconUserX,
  IconUserPlus,
  IconArrowUpRight,
  IconStaff,
  IconWallet,
  IconReceipt,
} from '@/components/icons'
import { BarChart } from '@/components/BarChart'
import { RevenueChart } from '@/components/RevenueChart'
import { DEFAULT_TIMEZONE } from '@/lib/constants'
import type { Patient, User } from '@/payload-types'

function greetingFor(tz: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(
      new Date(),
    ),
  )
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default async function DashboardHome() {
  const { user, tenant } = await requireDashboardSession()
  const payload = await getPayloadClient()
  const tenantID = getTenantID(user)!
  const tz = tenant?.settings?.timezone || DEFAULT_TIMEZONE

  const todayStart = startOfDayInTz(tz, 0)
  const tomorrowStart = startOfDayInTz(tz, 1)
  const [data, doctorsRes, todayApptsRes, recentPatientsRes] = await Promise.all([
    getDashboardData(payload, tenantID, tenant),
    payload.find({
      collection: 'users',
      where: { tenant: { equals: tenantID }, role: { equals: 'doctor' }, active: { equals: true } },
      limit: 20,
      sort: 'name',
      overrideAccess: true,
    }),
    payload.find({
      collection: 'appointments',
      where: {
        tenant: { equals: tenantID },
        start: { greater_than_equal: todayStart.toISOString(), less_than: tomorrowStart.toISOString() },
      },
      limit: 300,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'patients',
      where: { tenant: { equals: tenantID } },
      limit: 5,
      sort: '-createdAt',
      overrideAccess: true,
    }),
  ])
  const recentPatients = recentPatientsRes.docs as Patient[]

  // Revenue & outstanding are owner-only (sensitive money figures).
  const isOwner = user.role === 'owner'
  const revenue = isOwner ? await getRevenueData(payload, tenantID, tenant) : null

  const todayWeekday = weekdayInTz(todayStart, tz)
  const countByDoctor = new Map<string, number>()
  for (const a of todayApptsRes.docs) {
    const docID = String((a as { doctor: unknown }).doctor)
    countByDoctor.set(docID, (countByDoctor.get(docID) ?? 0) + 1)
  }
  const doctors = (doctorsRes.docs as User[]).map((d) => {
    const type = (d.availabilityType as string) || 'regular'
    const days = (d.availableDays as string[] | undefined) || []
    const onToday = type !== 'regular' || days.length === 0 || days.includes(todayWeekday)
    const win = windowOf(d)
    return {
      id: String(d.id),
      name: d.name,
      specialty: (d as { specialty?: string }).specialty,
      note:
        type === 'onCall'
          ? 'On call'
          : type === 'byAppointment'
            ? 'By appointment'
            : onToday
              ? `${win.from} – ${win.to}`
              : 'Off today',
      onToday,
      count: countByDoctor.get(String(d.id)) ?? 0,
    }
  })
  // "Friday, 12 June" in the clinic's timezone
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  })
  const firstName = user.name?.split(/\s+/)[0] ?? 'there'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-muted-foreground">{today}</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            {greetingFor(tz)}, {firstName}
          </h1>
        </div>
        <Link href="/dashboard/appointments/new" className={btnPrimary}>
          <IconPlus className="size-4" strokeWidth={1.75} />
          New appointment
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard
          label="Today's appointments"
          value={data.todayCount}
          icon={<IconCalendar size={17} strokeWidth={1.75} />}
          tone="primary"
        />
        <KpiCard
          label="Completed today"
          value={data.completedToday}
          icon={<IconCalendarCheck size={17} strokeWidth={1.75} />}
          tone="green"
        />
        <KpiCard
          label="No-shows today"
          value={data.noShowsToday}
          icon={<IconUserX size={17} strokeWidth={1.75} />}
          tone="amber"
        />
        <KpiCard
          label="New patients (7d)"
          value={data.newPatients7d}
          icon={<IconUserPlus size={17} strokeWidth={1.75} />}
          tone="blue"
        />
      </div>

      {/* Revenue (owner only) */}
      {revenue && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
            <KpiCard
              label="Revenue today"
              value={formatMoney(revenue.revenueToday, tenant)}
              icon={<IconWallet size={17} strokeWidth={1.75} />}
              tone="green"
            />
            <KpiCard
              label="Revenue this month"
              value={formatMoney(revenue.revenueMonth, tenant)}
              icon={<IconArrowUpRight size={17} strokeWidth={1.75} />}
              tone="primary"
            />
            <KpiCard
              label="Outstanding"
              value={formatMoney(revenue.outstandingTotal, tenant)}
              hint="Unpaid + partial balances"
              icon={<IconReceipt size={17} strokeWidth={1.75} />}
              tone="amber"
            />
          </div>

          {revenue.outstanding.length > 0 && (
            <section className="card-flat overflow-hidden">
              <div className="flex items-center justify-between border-b px-5 py-4">
                <h2 className="font-display text-lg font-semibold">Outstanding balances</h2>
                <span className="tabular text-xs text-faint">
                  {formatMoney(revenue.outstandingTotal, tenant)} total
                </span>
              </div>
              <ul className="divide-y divide-border">
                {revenue.outstanding.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/dashboard/invoices/${o.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-secondary/40"
                    >
                      <span className="tabular w-20 shrink-0 text-[13px] font-medium">{o.invoiceNumber}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">{o.patientName}</span>
                      <span className="tabular shrink-0 font-semibold text-amber">
                        {formatMoney(o.balanceDue, { settings: { currency: o.currency } })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Revenue per day (owner only) */}
          <section className="card-flat flex flex-col p-5 sm:p-6">
            <div className="mb-5 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">Revenue</h2>
              <span className="text-xs text-faint">Last 14 days</span>
            </div>
            <div className="my-auto">
              <RevenueChart data={revenue.series} currency={revenue.currency} />
            </div>
          </section>
        </>
      )}

      {/* Chart + up-next */}
      <div className="grid items-stretch gap-4 xl:grid-cols-3">
        <section className="card-flat flex flex-col p-5 sm:p-6 xl:col-span-2">
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-semibold">Activity</h2>
            <span className="text-xs text-faint">Last 14 days</span>
          </div>
          <div className="my-auto">
            <BarChart data={data.series} />
          </div>
        </section>

        <section className="card-flat flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-display text-lg font-semibold">Up next today</h2>
            <Link
              href="/dashboard/appointments"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
            >
              Day view
              <IconArrowUpRight size={13} strokeWidth={2} />
            </Link>
          </div>
          {data.upcoming.length === 0 ? (
            <EmptyState
              message="No more appointments today."
              action={
                <Link
                  href="/dashboard/appointments/new"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Book one
                </Link>
              }
            />
          ) : (
            <ul className="flex-1 divide-y divide-border">
              {data.upcoming.slice(0, 7).map((appt) => {
                const patient = appt.patient as Patient
                const doctor = appt.doctor as User
                return (
                  <li key={appt.id}>
                    <Link
                      href="/dashboard/appointments"
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-secondary/40"
                    >
                      <Avatar name={patient?.name ?? 'Patient'} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">
                          {patient?.name ?? 'Patient'}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {doctor?.name}
                          {appt.reason ? ` · ${appt.reason}` : ''}
                        </span>
                      </span>
                      <span className="tabular shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-semibold">
                        {formatTime(appt.start, tenant)}
                      </span>
                      <StatusBadge status={appt.status} className="hidden sm:inline-flex" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Doctors today · Quick actions · Recent patients */}
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="card-flat overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-display text-lg font-semibold">Doctors today</h2>
            <span className="tabular text-xs text-faint">
              {doctors.filter((d) => d.onToday).length} on duty
            </span>
          </div>
          <ul className="divide-y divide-border">
            {doctors.map((d) => (
              <li key={d.id} className={`flex items-center gap-3 px-5 py-2.5 ${d.onToday ? '' : 'opacity-50'}`}>
                <Avatar name={d.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{d.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {d.specialty ? `${d.specialty} · ` : ''}
                    {d.note}
                  </span>
                </span>
                {d.count > 0 && (
                  <span className="tabular shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-primary">
                    {d.count}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="card-flat overflow-hidden">
          <div className="border-b px-5 py-4">
            <h2 className="font-display text-lg font-semibold">Quick actions</h2>
          </div>
          <ul className="divide-y divide-border">
            {[
              {
                href: '/dashboard/appointments/new',
                icon: <IconPlus size={16} strokeWidth={1.75} />,
                title: 'New appointment',
                desc: 'Book a slot or take a walk-in',
              },
              {
                href: '/dashboard/patients/new',
                icon: <IconUserPlus size={16} strokeWidth={1.75} />,
                title: 'Register patient',
                desc: 'Name and phone is enough',
              },
              {
                href: '/dashboard/appointments',
                icon: <IconCalendar size={16} strokeWidth={1.75} />,
                title: "Open today's queue",
                desc: 'Check in and complete visits',
              },
              ...(user.role === 'owner'
                ? [
                    {
                      href: '/dashboard/staff',
                      icon: <IconStaff size={16} strokeWidth={1.75} />,
                      title: 'Manage staff',
                      desc: 'Doctors, timings and roles',
                    },
                  ]
                : []),
            ].map((a) => (
              <li key={a.href + a.title}>
                <Link
                  href={a.href}
                  className="group flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-secondary/40"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                    {a.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold group-hover:text-primary">
                      {a.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{a.desc}</span>
                  </span>
                  <IconArrowUpRight
                    size={14}
                    className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card-flat overflow-hidden md:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-display text-lg font-semibold">Recent patients</h2>
            <Link
              href="/dashboard/patients"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
            >
              All patients
              <IconArrowUpRight size={13} strokeWidth={2} />
            </Link>
          </div>
          {recentPatients.length === 0 ? (
            <EmptyState
              message="No patients registered yet."
              action={
                <Link
                  href="/dashboard/patients/new"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Register the first one
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {recentPatients.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/dashboard/patients/${p.id}`}
                    className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-secondary/40"
                  >
                    <Avatar name={p.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{p.name}</span>
                      <span className="tabular block truncate text-xs text-muted-foreground">
                        {p.phone}
                      </span>
                    </span>
                    <span className="tabular shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {p.mrn}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

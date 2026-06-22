import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireDashboardSession, getPayloadClient } from '@/lib/auth'
import { getTenantID } from '@/access'
import { AllergyBanner, Card, StatusBadge, EmptyState, Avatar, btnPrimary, btnGhost } from '@/components/primitives'
import { IconChevronLeft, IconPhone, IconPlus, IconPrinter } from '@/components/icons'
import { ageFromDOB, formatDateTime, formatMoney } from '@/lib/format'
import { getPatientTimeline } from '@/lib/timeline'
import type { Appointment, Invoice, Patient, User } from '@/payload-types'
import type { AppointmentStatus } from '@/lib/constants'

const HISTORY_PAGE_SIZE = 15

type TabKey = 'timeline' | 'appointments' | 'invoices'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'invoices', label: 'Invoices' },
]

export default async function PatientProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ hp?: string; tab?: string }>
}) {
  const { user, tenant } = await requireDashboardSession()
  const payload = await getPayloadClient()
  const tenantID = getTenantID(user)!
  const { id } = await params
  const sp = await searchParams
  const hp = Math.max(1, Number(sp.hp) || 1)
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : 'timeline'

  let patient: Patient
  try {
    patient = (await payload.findByID({
      collection: 'patients',
      id,
      depth: 0,
      overrideAccess: false,
      user,
    })) as Patient
  } catch {
    notFound()
  }

  // Belt-and-suspenders: never reveal another tenant's patient.
  if (String((patient.tenant as { id?: string })?.id ?? patient.tenant) !== String(tenantID)) {
    notFound()
  }

  // Appointment history (paginated) drives the Appointments tab; its total also
  // feeds the info-rail "Visits" count. Always fetched (cheap, count is in the rail).
  const history = await payload.find({
    collection: 'appointments',
    where: { tenant: { equals: tenantID }, patient: { equals: id } },
    sort: '-start',
    limit: HISTORY_PAGE_SIZE,
    page: hp,
    depth: 1,
    overrideAccess: true,
  })
  const appts = history.docs as Appointment[]

  // v2 — clinical history. Timeline tab = merged feed; Invoices tab = invoice list.
  const timeline = tab === 'timeline' ? await getPatientTimeline(payload, tenantID, id) : []
  const invoicesRes =
    tab === 'invoices'
      ? await payload.find({
          collection: 'invoices',
          where: { tenant: { equals: tenantID }, patient: { equals: id } },
          sort: '-createdAt',
          limit: 25,
          depth: 0,
          overrideAccess: true,
        })
      : null
  const invoices = (invoicesRes?.docs ?? []) as Invoice[]
  const tabHref = (key: TabKey) => `/dashboard/patients/${id}?tab=${key}`

  const age = patient.ageYears ?? (patient.dateOfBirth ? ageFromDOB(patient.dateOfBirth) : null)

  return (
    <div>
      <Link
        href="/dashboard/patients"
        className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-ink"
      >
        <IconChevronLeft size={14} />
        Patients
      </Link>

      <div className="mt-3 grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Patient info rail */}
        <Card className="sticky top-6 overflow-hidden">
          <div className="border-b bg-secondary/30 px-5 py-5 text-center">
            <span className="inline-flex">
              <Avatar name={patient.name} />
            </span>
            <h1 className="mt-2 text-lg font-semibold">{patient.name}</h1>
            <span className="tabular mt-1 inline-block rounded bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {patient.mrn}
            </span>
          </div>

          <dl className="divide-y divide-border text-sm">
            {[
              {
                label: 'Phone',
                value: (
                  <span className="tabular inline-flex items-center gap-1.5">
                    <IconPhone size={12} className="text-faint" />
                    {patient.phone}
                  </span>
                ),
              },
              { label: 'Gender', value: <span className="capitalize">{patient.gender}</span> },
              { label: 'Age', value: age != null ? `${age} years` : '—' },
              { label: 'Blood group', value: patient.bloodGroup || '—' },
              { label: 'Visits', value: history.totalDocs },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <dt className="text-xs font-medium text-muted-foreground">{row.label}</dt>
                <dd className="text-[13px] font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>

          {patient.allergies && (
            <div className="border-t px-4 py-3">
              <AllergyBanner allergies={patient.allergies} />
            </div>
          )}
          {patient.notes && (
            <p className="border-t bg-canvas/70 px-5 py-3 text-[13px] leading-relaxed text-muted-foreground">
              {patient.notes}
            </p>
          )}

          <div className="flex gap-2 border-t p-4">
            <Link href={`/dashboard/patients/${patient.id}/edit`} className={`${btnGhost} flex-1`}>
              Edit
            </Link>
            <Link href="/dashboard/appointments/new" className={`${btnPrimary} flex-1`}>
              <IconPlus size={15} />
              Book
            </Link>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
        {/* Tabs: Timeline (default) · Appointments · Invoices */}
        <div className="inline-flex w-fit rounded-lg border border-border bg-card p-0.5 text-sm">
          {TABS.map((t) => {
            const active = t.key === tab
            return (
              <Link
                key={t.key}
                href={tabHref(t.key)}
                className={`rounded-md px-3.5 py-1.5 font-medium transition-colors ${
                  active ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-ink'
                }`}
              >
                {t.label}
              </Link>
            )
          })}
        </div>

        {/* Timeline tab — merged chronological feed */}
        {tab === 'timeline' && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Timeline</h2>
              <span className="tabular text-xs text-faint">{timeline.length}</span>
            </div>
            {timeline.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                Nothing recorded yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {timeline.map((e) => (
                  <li
                    key={`${e.kind}-${e.id}`}
                    className="flex items-center gap-4 px-5 py-3 text-sm"
                  >
                    <span className="tabular w-44 shrink-0 text-[13px] text-muted-foreground">
                      {formatDateTime(e.at, tenant)}
                    </span>
                    {e.kind === 'visit' && (
                      <>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="me-1.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            Visit
                          </span>
                          <span className="font-medium">{e.diagnosis || 'Consultation'}</span>
                          {e.doctorName && (
                            <span className="text-muted-foreground"> · {e.doctorName}</span>
                          )}
                        </span>
                        {e.rxCount > 0 && (
                          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary">
                            {e.rxCount} Rx
                          </span>
                        )}
                        <Link
                          href={`/print/prescription/${e.id}`}
                          target="_blank"
                          className="shrink-0 text-faint transition-colors hover:text-primary"
                          title="Print prescription"
                        >
                          <IconPrinter size={14} />
                        </Link>
                      </>
                    )}
                    {e.kind === 'invoice' && (
                      <Link
                        href={`/dashboard/invoices/${e.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3 transition-colors hover:text-primary"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="me-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Invoice
                          </span>
                          <span className="tabular font-medium">{e.invoiceNumber}</span>
                          <span className="tabular text-muted-foreground">
                            {' · '}
                            {formatMoney(e.amount, { settings: { currency: e.currency } })}
                          </span>
                        </span>
                        <StatusBadge status={e.status} />
                      </Link>
                    )}
                    {e.kind === 'appointment' && (
                      <>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="me-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Appt
                          </span>
                          {e.doctorName && <span className="font-medium">{e.doctorName}</span>}
                          {e.reason && <span className="text-muted-foreground"> · {e.reason}</span>}
                        </span>
                        <StatusBadge status={e.status} />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* Appointments tab — full paginated history */}
        {tab === 'appointments' && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Appointment history</h2>
              <span className="tabular text-xs text-faint">{history.totalDocs}</span>
            </div>
            {appts.length === 0 ? (
              <EmptyState
                message="No appointments yet."
                actionHref="/dashboard/appointments/new"
                actionLabel="Book one"
              />
            ) : (
              <ul className="divide-y divide-border">
                {appts.map((a) => (
                  <li key={a.id} className="flex items-center gap-4 px-5 py-3 text-sm transition-colors hover:bg-canvas/60">
                    <span className="tabular w-44 shrink-0 text-[13px] text-muted-foreground">
                      {formatDateTime(a.start, tenant)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{(a.doctor as User)?.name}</span>
                      {a.reason && <span className="text-muted-foreground"> · {a.reason}</span>}
                    </span>
                    <StatusBadge status={a.status as AppointmentStatus} />
                  </li>
                ))}
              </ul>
            )}
            {history.totalPages > 1 && (
              <div className="flex items-center justify-between border-t bg-muted/40 px-5 py-2.5 text-xs text-muted-foreground">
                <span className="tabular">
                  Page {history.page} of {history.totalPages}
                </span>
                <div className="flex gap-3">
                  {history.hasPrevPage && (
                    <Link href={`/dashboard/patients/${id}?tab=appointments&hp=${hp - 1}`} className="font-medium text-primary hover:underline">
                      ‹ Newer
                    </Link>
                  )}
                  {history.hasNextPage && (
                    <Link href={`/dashboard/patients/${id}?tab=appointments&hp=${hp + 1}`} className="font-medium text-primary hover:underline">
                      Older ›
                    </Link>
                  )}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Invoices tab — billing history */}
        {tab === 'invoices' && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Invoices</h2>
              <span className="tabular text-xs text-faint">{invoicesRes?.totalDocs ?? 0}</span>
            </div>
            {invoices.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {invoices.map((inv) => (
                  <li key={inv.id}>
                    <Link
                      href={`/dashboard/invoices/${inv.id}`}
                      className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-canvas/60"
                    >
                      <span className="tabular w-24 shrink-0 font-medium">{inv.invoiceNumber}</span>
                      <span className="tabular min-w-0 flex-1 truncate text-muted-foreground">
                        {formatMoney(inv.totalAmount ?? 0, { settings: { currency: inv.currency } })}
                      </span>
                      <StatusBadge status={inv.voided ? 'voided' : (inv.paymentStatus ?? 'unpaid')} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        </div>
      </div>
    </div>
  )
}

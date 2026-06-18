import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireDashboardSession, getPayloadClient } from '@/lib/auth'
import { getTenantID } from '@/access'
import { Card, EmptyState } from '@/components/primitives'
import { IconCheck } from '@/components/icons'
import { VisitForm } from '@/components/VisitForm'
import { PostVisitActions } from '@/components/PostVisitActions'
import { VISIT_ALLOWED_APPOINTMENT_STATUSES } from '@/lib/constants'
import type { Appointment, Patient, User } from '@/payload-types'

const relId = (v: unknown): string =>
  v && typeof v === 'object' && 'id' in (v as Record<string, unknown>) ? String((v as { id: unknown }).id) : String(v)

export default async function NewVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ appointment?: string }>
}) {
  const { user } = await requireDashboardSession()
  // Only clinical roles author visits.
  if (user.role === 'receptionist') redirect('/dashboard/appointments')

  const payload = await getPayloadClient()
  const tenantID = getTenantID(user)!
  const appointmentId = (await searchParams).appointment
  if (!appointmentId) notFound()

  let appt: Appointment
  try {
    appt = (await payload.findByID({ collection: 'appointments', id: appointmentId, depth: 1, overrideAccess: false, user })) as Appointment
  } catch {
    notFound()
  }
  if (relId(appt.tenant) !== String(tenantID)) notFound()

  const back = (
    <Link href="/dashboard/appointments" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-ink">
      ‹ Appointments
    </Link>
  )

  // Guard: a visit needs a checked-in / completed appointment.
  if (!VISIT_ALLOWED_APPOINTMENT_STATUSES.includes(appt.status as never)) {
    return (
      <div className="mx-auto max-w-3xl">
        {back}
        <h1 className="mt-2 mb-6 text-[1.45rem] font-semibold">Record visit</h1>
        <Card>
          <EmptyState message="Check the patient in before recording a visit." actionHref="/dashboard/appointments" actionLabel="Back to day view" />
        </Card>
      </div>
    )
  }

  // One visit per appointment — if it already exists, point there.
  const existing = await payload.find({
    collection: 'visits',
    where: { appointment: { equals: appointmentId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const patient = appt.patient as Patient
  // A visit already exists (either pre-existing, or we just recorded one and the
  // route re-rendered) — show a "what's next" panel rather than a dead end.
  if (existing.totalDocs > 0) {
    return (
      <div className="mx-auto max-w-3xl">
        {back}
        <h1 className="mt-2 mb-6 text-[1.45rem] font-semibold">Record visit</h1>
        <Card className="p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <IconCheck size={22} />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Visit recorded</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The consultation for {patient?.name ?? 'the patient'} is saved.
          </p>
          <PostVisitActions visitId={String(existing.docs[0].id)} patientId={relId(patient)} />
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      {back}
      <h1 className="mt-2 mb-6 text-[1.45rem] font-semibold">Record visit</h1>
      <VisitForm
        appointmentId={String(appt.id)}
        patientName={patient?.name ?? 'Patient'}
        doctorName={(appt.doctor as User)?.name ?? 'Doctor'}
      />
    </div>
  )
}

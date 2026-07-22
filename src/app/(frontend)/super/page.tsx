import { requireSuperAdmin, getPayloadClient } from '@/lib/auth'
import { SuperConsole, type TenantRow, type ActivityRow } from '@/components/SuperConsole'
import { DEFAULT_CURRENCY } from '@/lib/constants'
import type { Tenant, AuditLog, User } from '@/payload-types'

export default async function SuperPage() {
  await requireSuperAdmin()
  const payload = await getPayloadClient()

  const tenantsRes = await payload.find({
    collection: 'tenants',
    limit: 100,
    sort: '-createdAt',
    overrideAccess: true,
  })

  const rows: TenantRow[] = await Promise.all(
    (tenantsRes.docs as Tenant[]).map(async (t) => {
      const [doctors, patients, appointments] = await Promise.all([
        payload.count({ collection: 'users', where: { tenant: { equals: t.id }, role: { equals: 'doctor' } }, overrideAccess: true }),
        payload.count({ collection: 'patients', where: { tenant: { equals: t.id } }, overrideAccess: true }),
        payload.count({ collection: 'appointments', where: { tenant: { equals: t.id } }, overrideAccess: true }),
      ])
      // A pending signup can only be approved once the owner verified their email
      // (BACKLOG §1.1) — the queue shows a badge and holds the Approve button.
      let ownerUnverified = false
      if (t.status === 'pending') {
        const owners = await payload.find({
          collection: 'users',
          where: { tenant: { equals: t.id }, role: { equals: 'owner' } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        ownerUnverified = (owners.docs[0] as User | undefined)?.emailVerified === false
      }
      return {
        id: String(t.id),
        name: t.name,
        city: t.city,
        currency: t.settings?.currency || DEFAULT_CURRENCY,
        status: t.status,
        plan: t.plan,
        upgradeRequest: t.upgradeRequest?.requestedPlan
          ? {
              plan: t.upgradeRequest.requestedPlan,
              requestedAt: t.upgradeRequest.requestedAt ?? null,
              note: t.upgradeRequest.note ?? null,
            }
          : null,
        doctors: doctors.totalDocs,
        patients: patients.totalDocs,
        appointments: appointments.totalDocs,
        createdAt: t.createdAt,
        onboardingSource: t.onboardingSource,
        ownerUnverified,
      }
    }),
  )

  // Platform-wide audit peek — the latest sensitive actions across every clinic.
  const activityRes = await payload.find({
    collection: 'auditLogs',
    sort: '-createdAt',
    limit: 12,
    depth: 1,
    overrideAccess: true,
  })
  const activity: ActivityRow[] = (activityRes.docs as AuditLog[]).map((a) => ({
    id: String(a.id),
    when: a.createdAt,
    clinic: (a.tenant as Tenant)?.name ?? '—',
    who: (a.user as User)?.name ?? '—',
    summary: a.summary,
  }))

  return (
    <main className="min-h-screen bg-canvas">
      <SuperConsole tenants={rows} activity={activity} />
    </main>
  )
}

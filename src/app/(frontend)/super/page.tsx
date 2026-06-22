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
      return {
        id: String(t.id),
        name: t.name,
        city: t.city,
        currency: t.settings?.currency || DEFAULT_CURRENCY,
        status: t.status,
        doctors: doctors.totalDocs,
        patients: patients.totalDocs,
        appointments: appointments.totalDocs,
        createdAt: t.createdAt,
        onboardingSource: t.onboardingSource,
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

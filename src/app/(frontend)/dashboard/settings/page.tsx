import { requireDashboardSession, requireRole } from '@/lib/auth'
import { PageTitle } from '@/components/primitives'
import { SettingsForm } from '@/components/SettingsForm'
import {
  DEFAULT_APPOINTMENT_DURATION,
  DEFAULT_CLOSE_TIME,
  DEFAULT_CURRENCY,
  DEFAULT_OPEN_TIME,
  DEFAULT_TIMEZONE,
} from '@/lib/constants'

export default async function SettingsPage() {
  const session = await requireDashboardSession()
  await requireRole(session, ['owner'])
  const t = session.tenant

  return (
    <div>
      <PageTitle subtitle="Your clinic's profile and scheduling defaults.">Settings</PageTitle>
      <SettingsForm
        initial={{
          name: t?.name ?? '',
          phone: t?.phone ?? '',
          address: t?.address ?? '',
          city: t?.city ?? '',
          country: t?.country ?? '',
          appointmentDurationMins: t?.settings?.appointmentDurationMins ?? DEFAULT_APPOINTMENT_DURATION,
          openTime: t?.settings?.openTime ?? DEFAULT_OPEN_TIME,
          closeTime: t?.settings?.closeTime ?? DEFAULT_CLOSE_TIME,
          currency: t?.settings?.currency ?? DEFAULT_CURRENCY,
          timezone: t?.settings?.timezone ?? DEFAULT_TIMEZONE,
        }}
      />
    </div>
  )
}

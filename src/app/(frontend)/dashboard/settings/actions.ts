'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, getPayloadClient } from '@/lib/auth'
import { getTenantID } from '@/access'
import { toActionError, type ActionResult } from '@/lib/errors'

export type ClinicSettingsInput = {
  name: string
  phone: string
  address?: string
  city?: string
  country?: string
  appointmentDurationMins: number
  openTime: string
  closeTime: string
  currency: string
  timezone: string
}

/** Owner edits their own clinic profile & settings (access enforced by Payload). */
export async function updateClinicSettings(
  input: ClinicSettingsInput,
): Promise<ActionResult<null>> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') {
    return { ok: false, code: 'FORBIDDEN', message: "You don't have permission to do that." }
  }
  const tenantID = getTenantID(user)
  if (!tenantID) {
    return { ok: false, code: 'FORBIDDEN', message: 'You are not attached to a clinic.' }
  }
  if (!input.name || !input.phone) {
    return { ok: false, code: 'VALIDATION', message: 'Clinic name and phone are required.' }
  }
  if (!/^\d{2}:\d{2}$/.test(input.openTime) || !/^\d{2}:\d{2}$/.test(input.closeTime)) {
    return { ok: false, code: 'VALIDATION', message: 'Hours must be in HH:mm format.' }
  }

  try {
    const payload = await getPayloadClient()
    await payload.update({
      collection: 'tenants',
      id: tenantID,
      user,
      overrideAccess: false,
      data: {
        name: input.name,
        phone: input.phone,
        address: input.address || null,
        city: input.city || null,
        country: input.country || null,
        settings: {
          appointmentDurationMins: input.appointmentDurationMins,
          openTime: input.openTime,
          closeTime: input.closeTime,
          currency: input.currency,
          timezone: input.timezone,
        },
      } as never,
    })
    revalidatePath('/dashboard/settings')
    revalidatePath('/dashboard')
    return { ok: true, data: null }
  } catch (err) {
    return { ok: false, ...toActionError(err) }
  }
}

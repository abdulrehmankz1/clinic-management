'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, getPayloadClient } from '@/lib/auth'
import { toActionError, type ActionResult } from '@/lib/errors'
import {
  DEFAULT_APPOINTMENT_DURATION,
  DEFAULT_CLOSE_TIME,
  DEFAULT_OPEN_TIME,
} from '@/lib/constants'

async function superCtx() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'superAdmin') return null
  const payload = await getPayloadClient()
  return { user, payload }
}

type ClinicInput = {
  name: string
  phone: string
  city?: string
  currency: string
  timezone: string
  ownerName: string
  ownerEmail: string
  ownerPassword: string
}

/** Create a clinic + its owner atomically (spec §8.1) — both or neither. */
export async function createClinic(input: ClinicInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await superCtx()
  if (!ctx) return { ok: false, code: 'FORBIDDEN', message: "You don't have permission to do that." }
  const { payload } = ctx

  if (!input.name || !input.phone || !input.ownerEmail || !input.ownerPassword || !input.ownerName) {
    return { ok: false, code: 'VALIDATION', message: 'Clinic name, phone and owner details are required.' }
  }

  const txn = await payload.db.beginTransaction()
  const req = txn ? ({ transactionID: txn } as never) : undefined
  try {
    const tenant = await payload.create({
      collection: 'tenants',
      overrideAccess: true,
      req,
      data: {
        name: input.name,
        phone: input.phone,
        city: input.city || undefined,
        status: 'active',
        settings: {
          appointmentDurationMins: DEFAULT_APPOINTMENT_DURATION,
          openTime: DEFAULT_OPEN_TIME,
          closeTime: DEFAULT_CLOSE_TIME,
          currency: input.currency,
          timezone: input.timezone,
        },
      } as never,
    })

    await payload.create({
      collection: 'users',
      overrideAccess: true,
      req,
      data: {
        name: input.ownerName,
        email: input.ownerEmail,
        password: input.ownerPassword,
        role: 'owner',
        tenant: tenant.id,
      } as never,
    })

    if (txn) await payload.db.commitTransaction(txn)
    revalidatePath('/super')
    return { ok: true, data: { id: String(tenant.id) } }
  } catch (err) {
    if (txn) await payload.db.rollbackTransaction(txn)
    return { ok: false, ...toActionError(err) }
  }
}

export async function setClinicStatus(
  id: string,
  status: 'active' | 'suspended',
): Promise<ActionResult<null>> {
  const ctx = await superCtx()
  if (!ctx) return { ok: false, code: 'FORBIDDEN', message: "You don't have permission to do that." }
  try {
    await ctx.payload.update({
      collection: 'tenants',
      id,
      overrideAccess: false,
      user: ctx.user,
      data: { status } as never,
    })
    revalidatePath('/super')
    return { ok: true, data: null }
  } catch (err) {
    return { ok: false, ...toActionError(err) }
  }
}

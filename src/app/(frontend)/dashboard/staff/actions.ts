'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, getPayloadClient } from '@/lib/auth'
import { toActionError, type ActionResult } from '@/lib/errors'

async function ownerCtx() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') return null
  const payload = await getPayloadClient()
  return { user, payload }
}

type StaffInput = {
  name: string
  email: string
  password: string
  role: 'doctor' | 'receptionist' | 'owner'
  phone?: string
  specialty?: string
  consultationFee?: number
  availabilityType?: string
  availableDays?: string[]
  availableFrom?: string
  availableTo?: string
}

export async function createStaff(input: StaffInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await ownerCtx()
  if (!ctx) return { ok: false, code: 'FORBIDDEN', message: "You don't have permission to do that." }
  if (!input.name || !input.email || !input.password) {
    return { ok: false, code: 'VALIDATION', message: 'Name, email and password are required.' }
  }
  try {
    const created = await ctx.payload.create({
      collection: 'users',
      user: ctx.user,
      overrideAccess: false,
      data: {
        name: input.name,
        email: input.email,
        password: input.password,
        role: input.role,
        phone: input.phone || undefined,
        specialty: input.role === 'doctor' ? input.specialty : undefined,
        consultationFee: input.role === 'doctor' ? input.consultationFee : undefined,
        availabilityType: input.role === 'doctor' ? input.availabilityType || 'regular' : undefined,
        availableDays: input.role === 'doctor' ? input.availableDays : undefined,
        availableFrom: input.role === 'doctor' ? input.availableFrom || '09:00' : undefined,
        availableTo: input.role === 'doctor' ? input.availableTo || '17:00' : undefined,
      } as never,
    })
    revalidatePath('/dashboard/staff')
    return { ok: true, data: { id: String(created.id) } }
  } catch (err) {
    return { ok: false, ...toActionError(err) }
  }
}

type StaffUpdateInput = Omit<StaffInput, 'password'> & { password?: string }

export async function updateStaff(id: string, input: StaffUpdateInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await ownerCtx()
  if (!ctx) return { ok: false, code: 'FORBIDDEN', message: "You don't have permission to do that." }
  if (!input.name || !input.email) {
    return { ok: false, code: 'VALIDATION', message: 'Name and email are required.' }
  }
  try {
    const isDoctor = input.role === 'doctor'
    await ctx.payload.update({
      collection: 'users',
      id,
      user: ctx.user,
      overrideAccess: false,
      data: {
        name: input.name,
        email: input.email,
        // Only reset the password when a new one is typed.
        ...(input.password ? { password: input.password } : {}),
        role: input.role,
        phone: input.phone || null,
        specialty: isDoctor ? input.specialty || null : null,
        consultationFee: isDoctor ? (input.consultationFee ?? null) : null,
        availabilityType: isDoctor ? input.availabilityType || 'regular' : undefined,
        availableDays: isDoctor ? input.availableDays : undefined,
        availableFrom: isDoctor ? input.availableFrom || '09:00' : undefined,
        availableTo: isDoctor ? input.availableTo || '17:00' : undefined,
      } as never,
    })
    revalidatePath('/dashboard/staff')
    return { ok: true, data: { id } }
  } catch (err) {
    return { ok: false, ...toActionError(err) }
  }
}

export async function toggleStaffActive(id: string, active: boolean): Promise<ActionResult<null>> {
  const ctx = await ownerCtx()
  if (!ctx) return { ok: false, code: 'FORBIDDEN', message: "You don't have permission to do that." }
  try {
    await ctx.payload.update({
      collection: 'users',
      id,
      user: ctx.user,
      overrideAccess: false,
      data: { active } as never,
    })
    revalidatePath('/dashboard/staff')
    return { ok: true, data: null }
  } catch (err) {
    return { ok: false, ...toActionError(err) }
  }
}

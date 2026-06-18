'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, getPayloadClient } from '@/lib/auth'
import { toActionError, type ActionResult } from '@/lib/errors'

export type PrescriptionRowInput = {
  medicine: string
  dosage?: string
  frequency?: string
  frequencyNote?: string
  durationDays?: number
  instructions?: string
}

export type VisitInput = {
  appointmentId: string
  symptoms?: string
  diagnosis?: string
  notes?: string
  vitals?: {
    bpSystolic?: number
    bpDiastolic?: number
    temperatureC?: number
    weightKg?: number
    pulse?: number
  }
  prescription?: PrescriptionRowInput[]
  followUpDate?: string
}

/** Record a consultation against a checked-in / completed appointment. */
export async function recordVisit(input: VisitInput): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser()
  if (!user || user.role === 'superAdmin') {
    return { ok: false, code: 'FORBIDDEN', message: "You don't have permission to do that." }
  }
  const payload = await getPayloadClient()

  // Drop blank vitals and empty prescription rows so we never store noise.
  const vitals = input.vitals
    ? Object.fromEntries(Object.entries(input.vitals).filter(([, v]) => v != null && !Number.isNaN(v)))
    : undefined
  // Keep only rows with a medicine, and drop empty optional fields so an empty
  // `frequency` ('') never trips the select's option validation.
  const prescription = (input.prescription ?? [])
    .filter((p) => p.medicine?.trim())
    .map((p) => ({
      medicine: p.medicine.trim(),
      dosage: p.dosage?.trim() || undefined,
      frequency: p.frequency || undefined,
      frequencyNote: p.frequencyNote?.trim() || undefined,
      durationDays: p.durationDays ?? undefined,
      instructions: p.instructions?.trim() || undefined,
    }))

  try {
    const visit = await payload.create({
      collection: 'visits',
      user,
      overrideAccess: false,
      data: {
        appointment: input.appointmentId,
        symptoms: input.symptoms || undefined,
        diagnosis: input.diagnosis || undefined,
        notes: input.notes || undefined,
        vitals: vitals && Object.keys(vitals).length ? vitals : undefined,
        prescription,
        followUpDate: input.followUpDate || undefined,
      } as never,
    })
    revalidatePath('/dashboard/appointments')
    revalidatePath('/dashboard')
    return { ok: true, data: { id: String(visit.id) } }
  } catch (err) {
    return { ok: false, ...toActionError(err) }
  }
}

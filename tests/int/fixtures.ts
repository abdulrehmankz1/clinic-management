import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

export type Fixture = Awaited<ReturnType<typeof seedFixture>>

let _payload: Payload | null = null

export async function getTestPayload(): Promise<Payload> {
  if (_payload) return _payload
  _payload = await getPayload({ config: await config })
  return _payload
}

// Delete children before parents so nothing dangles mid-wipe.
const COLLECTIONS = ['invoices', 'visits', 'appointments', 'patients', 'users', 'tenants'] as const

/** Wipe all data so each suite starts clean. */
export async function wipe(payload: Payload): Promise<void> {
  for (const collection of COLLECTIONS) {
    await payload.delete({ collection, where: {}, overrideAccess: true })
  }
}

/**
 * Two isolated clinics + a super admin. Created with overrideAccess so the seed
 * itself isn't blocked; the tests then act *as* these users with access enforced.
 */
export async function seedFixture(payload: Payload) {
  await wipe(payload)

  const superAdmin = await payload.create({
    collection: 'users',
    data: {
      name: 'Super Admin',
      email: 'super@clinic.test',
      password: 'password123',
      role: 'superAdmin',
    },
    overrideAccess: true,
  })

  const makeClinic = async (key: string, name: string) => {
    const tenant = await payload.create({
      collection: 'tenants',
      // Default the shared fixture to the unlimited plan so unrelated suites (which
      // add several doctors/patients) aren't constrained; the plan-limit suite sets
      // the plan it needs explicitly.
      data: { name, phone: '03001234567', city: 'Testville', status: 'active', plan: 'plus' } as never,
      overrideAccess: true,
    })
    const owner = await payload.create({
      collection: 'users',
      data: {
        name: `Owner ${key}`,
        email: `owner-${key}@clinic.test`,
        password: 'password123',
        role: 'owner',
        tenant: tenant.id,
      },
      overrideAccess: true,
    })
    const doctor = await payload.create({
      collection: 'users',
      data: {
        name: `Doctor ${key}`,
        email: `doctor-${key}@clinic.test`,
        password: 'password123',
        role: 'doctor',
        tenant: tenant.id,
        active: true,
      },
      overrideAccess: true,
    })
    const receptionist = await payload.create({
      collection: 'users',
      data: {
        name: `Receptionist ${key}`,
        email: `recept-${key}@clinic.test`,
        password: 'password123',
        role: 'receptionist',
        tenant: tenant.id,
      },
      overrideAccess: true,
    })
    const patient = await payload.create({
      collection: 'patients',
      data: {
        tenant: tenant.id,
        name: `Patient ${key}`,
        phone: `0300000000${key === 'A' ? '1' : '2'}`,
        gender: 'male',
        ageYears: 30,
      },
      overrideAccess: true,
    })
    return { tenant, owner, doctor, receptionist, patient }
  }

  const a = await makeClinic('A', 'City Care Clinic')
  const b = await makeClinic('B', 'Shifa Family Clinic')

  return { superAdmin, a, b }
}

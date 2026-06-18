/**
 * Seed script — demo quality is portfolio quality.
 *
 *   pnpm seed
 *
 * Idempotent: wipes and recreates. Refuses to run in production unless FORCE_SEED=1.
 * All appointment dates are relative to "today" so the dashboard and Day Rail are
 * alive on demo day (spec §10).
 */
import 'dotenv/config'
import { getPayload, type Payload } from 'payload'
import config from './payload.config'

const PASSWORD = 'password123'

const FIRST_NAMES = [
  'Bilal', 'Ayesha', 'Hamza', 'Fatima', 'Usman', 'Zainab', 'Ali', 'Maryam',
  'Hassan', 'Sana', 'Imran', 'Hira', 'Bilqis', 'Tariq', 'Nida', 'Saad',
  'Rabia', 'Faisal', 'Amna', 'Kamran', 'Sadia', 'Noman', 'Iqra', 'Waleed',
  'Mahnoor',
]
const LAST_NAMES = [
  'Ahmed', 'Khan', 'Malik', 'Hussain', 'Raza', 'Sheikh', 'Butt', 'Qureshi',
  'Iqbal', 'Farooq', 'Aslam', 'Javed', 'Nawaz', 'Siddiqui', 'Chaudhry',
]
const REASONS = [
  'Fever', 'Follow-up', 'Cough & cold', 'Blood pressure check', 'Headache',
  'Diabetes review', 'Skin rash', 'Stomach pain', 'Vaccination', 'General checkup',
]
const ALLERGIES = ['Penicillin', 'Sulfa drugs', 'Aspirin', 'Pollen']
const BLOOD = ['A+', 'B+', 'O+', 'AB+', 'A-', 'O-'] as const
const GENDERS = ['male', 'female'] as const

// Deterministic pseudo-random so seeds are repeatable without Math.random.
let _s = 7
const rnd = () => {
  _s = (_s * 1103515245 + 12345) & 0x7fffffff
  return _s / 0x7fffffff
}
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1))

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

type DoctorSpec = {
  name: string
  specialty: string
  fee: number
  type?: 'regular' | 'onCall' | 'byAppointment'
  days?: string[]
  from?: string
  to?: string
}

type ClinicSpec = {
  name: string
  slug: string
  city: string
  country: string
  phone: string
  currency: string
  timezone: string
  doctors: DoctorSpec[]
}

const CLINICS: ClinicSpec[] = [
  {
    name: 'City Care Clinic',
    slug: 'city-care-clinic',
    city: 'Rawalpindi',
    country: 'Pakistan',
    phone: '+92512345678',
    currency: 'PKR',
    timezone: 'Asia/Karachi',
    doctors: [
      // Different availability patterns, mirroring a real clinic:
      { name: 'Dr. Hira Saleem', specialty: 'General Physician', fee: 1500, type: 'regular', days: ['sun','mon','tue','wed','thu','fri','sat'], from: '11:00', to: '13:00' },
      { name: 'Dr. Asad Mehmood', specialty: 'Pediatrics', fee: 2000, type: 'regular', days: ['sun','mon','tue','wed','thu','fri','sat'], from: '14:00', to: '16:00' },
      { name: 'Dr. Bilal Khan', specialty: 'Dermatology', fee: 1800, type: 'regular', days: ['mon','wed','fri'], from: '16:00', to: '18:00' },
      { name: 'Dr. Sana Tariq', specialty: 'Cardiology', fee: 2500, type: 'onCall' },
      { name: 'Dr. Imran Qureshi', specialty: 'Surgery', fee: 5000, type: 'byAppointment' },
    ],
  },
  {
    name: 'Shifa Family Clinic',
    slug: 'shifa-family-clinic',
    city: 'Lahore',
    country: 'Pakistan',
    phone: '+92423456789',
    currency: 'PKR',
    timezone: 'Asia/Karachi',
    doctors: [{ name: 'Dr. Nadia Hashmi', specialty: 'Family Medicine', fee: 1200 }],
  },
  {
    // Market-agnostic flex: a Dubai clinic proves currency/timezone are settings.
    name: 'Crescent Clinic',
    slug: 'crescent-clinic',
    city: 'Dubai',
    country: 'United Arab Emirates',
    phone: '+97143456789',
    currency: 'AED',
    timezone: 'Asia/Dubai',
    doctors: [{ name: 'Dr. Omar Farid', specialty: 'General Physician', fee: 150 }],
  },
]

async function wipe(payload: Payload) {
  // Children before parents.
  for (const collection of ['invoices', 'visits', 'appointments', 'patients', 'users', 'tenants'] as const) {
    await payload.delete({ collection, where: {}, overrideAccess: true })
  }
}

const DIAGNOSES = [
  'Acute pharyngitis', 'Viral fever', 'Hypertension', 'Type 2 diabetes review',
  'Migraine', 'Gastroenteritis', 'Allergic rhinitis', 'Lower back pain',
]
const MEDICINES = [
  { medicine: 'Amoxicillin', dosage: '500mg', frequency: 'tds', durationDays: 5, instructions: 'After meals' },
  { medicine: 'Paracetamol', dosage: '500mg', frequency: 'qid', durationDays: 3, instructions: 'If fever' },
  { medicine: 'Cetirizine', dosage: '10mg', frequency: 'od', durationDays: 7, instructions: 'At night' },
  { medicine: 'Omeprazole', dosage: '20mg', frequency: 'od', durationDays: 14, instructions: 'Before breakfast' },
  { medicine: 'Metformin', dosage: '500mg', frequency: 'bd', durationDays: 30, instructions: 'With food' },
] as const

export async function seed(payload: Payload) {
  payload.logger.info('Seeding demo data…')
  await wipe(payload)

  // Platform super admin
  await payload.create({
    collection: 'users',
    overrideAccess: true,
    data: {
      name: 'Platform Admin',
      email: 'super@clinic.app',
      password: PASSWORD,
      role: 'superAdmin',
    },
  })

  const today = startOfToday()

  for (const clinic of CLINICS) {
    const tenant = await payload.create({
      collection: 'tenants',
      overrideAccess: true,
      data: {
        name: clinic.name,
        slug: clinic.slug,
        phone: clinic.phone,
        city: clinic.city,
        country: clinic.country,
        status: 'active',
        settings: {
          appointmentDurationMins: 15,
          openTime: '09:00',
          closeTime: '21:00',
          currency: clinic.currency as never,
          timezone: clinic.timezone as never,
        },
      },
    })

    const emailKey = clinic.slug.split('-')[0]

    // Owner
    await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        name: `Owner — ${clinic.name}`,
        email: `owner@${emailKey}.app`,
        password: PASSWORD,
        role: 'owner',
        tenant: tenant.id,
      },
    })

    // Receptionist
    await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        name: 'Reception Desk',
        email: `reception@${emailKey}.app`,
        password: PASSWORD,
        role: 'receptionist',
        tenant: tenant.id,
      },
    })

    // Doctors (with varied availability patterns)
    const ALL = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    const doctorObjs: { id: string; type: string; fromH: number; toH: number; days: string[]; fee: number }[] = []
    for (let i = 0; i < clinic.doctors.length; i++) {
      const d = clinic.doctors[i]
      const type = d.type || 'regular'
      const doc = await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: {
          name: d.name,
          email: `doctor${i + 1}@${emailKey}.app`,
          password: PASSWORD,
          role: 'doctor',
          tenant: tenant.id,
          active: true,
          specialty: d.specialty,
          consultationFee: d.fee,
          availabilityType: type as never,
          availableDays: (d.days || ALL) as never,
          availableFrom: d.from || '09:00',
          availableTo: d.to || '17:00',
        },
      })
      doctorObjs.push({
        id: String(doc.id),
        type,
        fromH: parseInt((d.from || '09:00').split(':')[0], 10),
        toH: parseInt((d.to || '17:00').split(':')[0], 10),
        days: d.days || ALL,
        fee: d.fee,
      })
    }

    // Patients (~20). A couple share a phone number to demo the dedupe warning.
    const patientIds: string[] = []
    const sharedPhone = `+9230012${int(10000, 99999)}`
    for (let p = 0; p < 20; p++) {
      const gender = pick(GENDERS)
      const phone = p < 2 ? sharedPhone : `+9230${int(10, 99)}${int(1000000, 9999999)}`
      const patient = await payload.create({
        collection: 'patients',
        overrideAccess: true,
        data: {
          tenant: tenant.id,
          name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
          phone,
          gender,
          ageYears: int(3, 78),
          bloodGroup: pick(BLOOD),
          allergies: rnd() < 0.18 ? pick(ALLERGIES) : undefined,
        },
      })
      patientIds.push(String(patient.id))
    }

    // Appointments across past 14 days + next 3 days, each within the doctor's
    // own availability window (so the Day Rail shading lines up).
    const generalHours = [9, 10, 11, 12, 14, 15, 16, 17, 18, 19]
    const dayCode = (dt: Date) => ALL[dt.getDay()]
    let made = 0
    const completedAppts: { id: string; patientId: string; doctorId: string; fee: number }[] = []
    for (let dayOffset = -14; dayOffset <= 3 && made < 70; dayOffset++) {
      for (const doc of doctorObjs) {
        const probeDate = new Date(today)
        probeDate.setDate(probeDate.getDate() + dayOffset)
        // Regular doctors only see patients on their available weekdays.
        if (doc.type === 'regular' && !doc.days.includes(dayCode(probeDate))) continue

        const hours =
          doc.type === 'regular'
            ? Array.from({ length: Math.max(1, doc.toH - doc.fromH) }, (_, i) => doc.fromH + i)
            : generalHours

        const used = new Set<number>()
        const count = int(1, Math.min(3, hours.length))
        for (let k = 0; k < count && made < 70; k++) {
          let hour = pick(hours)
          let guard = 0
          while (used.has(hour) && guard++ < 10) hour = pick(hours)
          used.add(hour)

          const start = new Date(probeDate)
          start.setHours(hour, rnd() < 0.5 ? 0 : 30, 0, 0)

          let status: string
          if (dayOffset < 0) status = pick(['completed', 'completed', 'completed', 'no-show', 'cancelled'])
          else if (dayOffset === 0) status = pick(['completed', 'checked-in', 'scheduled', 'scheduled'])
          else status = 'scheduled'

          const patientId = pick(patientIds)
          try {
            const appt = await payload.create({
              collection: 'appointments',
              overrideAccess: true,
              data: {
                tenant: tenant.id,
                patient: patientId,
                doctor: doc.id,
                start: start.toISOString(),
                durationMins: 15,
                reason: pick(REASONS),
                status: status as never,
                cancellationReason: status === 'cancelled' ? 'Patient rescheduled' : undefined,
              },
            })
            made++
            if (status === 'completed') {
              completedAppts.push({ id: String(appt.id), patientId, doctorId: doc.id, fee: doc.fee })
            }
          } catch {
            // skip rare slot collisions
          }
        }
      }
    }

    // A few walk-ins today (first-come-first-serve) to demo token numbers.
    const regularToday = doctorObjs.find((d) => d.type === 'regular')
    if (regularToday) {
      for (let w = 0; w < 3; w++) {
        const start = new Date(today)
        start.setHours(regularToday.fromH, 10 + w * 5, 0, 0)
        try {
          await payload.create({
            collection: 'appointments',
            overrideAccess: true,
            data: {
              tenant: tenant.id,
              patient: pick(patientIds),
              doctor: regularToday.id,
              start: start.toISOString(),
              durationMins: 15,
              reason: 'Walk-in',
              status: 'checked-in' as never,
              isWalkIn: true,
            },
          })
          made++
        } catch {
          // ignore
        }
      }
    }

    // v2 — visits + invoices for completed appointments (so the clinical loop,
    // patient timeline and revenue/outstanding cards are alive on demo day).
    let visitsMade = 0
    let invoicesMade = 0
    for (let i = 0; i < completedAppts.length && visitsMade < 16; i++) {
      const ca = completedAppts[i]
      try {
        const visit = await payload.create({
          collection: 'visits',
          overrideAccess: true,
          data: {
            tenant: tenant.id,
            appointment: ca.id,
            visitDate: new Date().toISOString(),
            diagnosis: pick(DIAGNOSES),
            vitals: {
              bpSystolic: int(110, 135),
              bpDiastolic: int(70, 90),
              temperatureC: 36 + Math.round(rnd() * 20) / 10,
              pulse: int(64, 92),
            },
            prescription: [pick(MEDICINES), ...(rnd() < 0.5 ? [pick(MEDICINES)] : [])] as never,
          } as never,
        })
        visitsMade++

        // ~80% of visits get billed; statuses mixed (paid / partial / unpaid).
        if (rnd() < 0.8) {
          const roll = rnd()
          const payments =
            roll < 0.5
              ? [{ amount: ca.fee, method: 'cash' as never, receivedAt: new Date().toISOString() }]
              : roll < 0.75
                ? [{ amount: Math.round(ca.fee / 2), method: 'card' as never, receivedAt: new Date().toISOString() }]
                : []
          await payload.create({
            collection: 'invoices',
            overrideAccess: true,
            data: {
              tenant: tenant.id,
              visit: String(visit.id),
              patient: ca.patientId,
              lineItems: [{ description: 'Consultation', quantity: 1, unitAmount: ca.fee }],
              payments,
            } as never,
          })
          invoicesMade++
        }
      } catch {
        // skip (e.g. a visit already exists for this appointment)
      }
    }

    payload.logger.info(
      `  ✓ ${clinic.name}: ${doctorObjs.length} doctors, 20 patients, ~${made} appointments, ${visitsMade} visits, ${invoicesMade} invoices`,
    )
  }

  payload.logger.info('Seed complete.')
  payload.logger.info('Demo logins (password: password123):')
  payload.logger.info('  super@clinic.app  ·  owner@city.app  ·  reception@city.app  ·  doctor1@city.app')
}

// Allow running directly: `tsx src/seed.ts`
const isProd = process.env.NODE_ENV === 'production'
if (isProd && process.env.FORCE_SEED !== '1') {
  console.error('Refusing to seed in production without FORCE_SEED=1')
  process.exit(1)
}

const run = async () => {
  const payload = await getPayload({ config: await config })
  await seed(payload)
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})

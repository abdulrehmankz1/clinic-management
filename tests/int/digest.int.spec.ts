import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import type { Payload } from 'payload'
import { getTestPayload, seedFixture, type Fixture } from './fixtures'
import { runDailyDigest, hourInTz, DIGEST_HOUR } from '@/lib/digest'
import type { SendEmailInput, SendEmailResult } from '@/lib/email'
import { GET as cronGET } from '@/app/api/cron/daily-digest/route'
import { startOfDayInTz } from '@/lib/reports'

// v3 reminders suite (spec §10, test 7): the cron endpoint rejects callers without
// the secret, and the digest goes only to tenants whose local clock reads 07:00 —
// one hourly cron serving every timezone. A failing tenant never breaks the loop.

const KHI = 'Asia/Karachi'
const NYC = 'America/New_York'

/** An instant at HH:30 tomorrow on the given timezone's wall clock. */
function tomorrowAtInTz(tz: string, hour: number): Date {
  const dayStart = startOfDayInTz(tz, 1)
  return new Date(dayStart.getTime() + (hour * 60 + 30) * 60 * 1000)
}

describe('v3 — reminders (cron auth + timezone-aware digest)', () => {
  let payload: Payload
  let f: Fixture

  beforeAll(async () => {
    payload = await getTestPayload()
  })
  beforeEach(async () => {
    f = await seedFixture(payload)
  })

  const setTimezone = (tenantID: string | number, timezone: string) =>
    payload.update({
      collection: 'tenants',
      id: tenantID,
      data: { settings: { timezone } } as never,
      overrideAccess: true,
    })

  const bookAt = (clinic: Fixture['a'], start: Date) =>
    payload.create({
      collection: 'appointments',
      overrideAccess: true,
      data: {
        tenant: clinic.tenant.id,
        patient: clinic.patient.id,
        doctor: clinic.doctor.id,
        start: start.toISOString(),
        durationMins: 15,
        status: 'scheduled',
      } as never,
    })

  /** Recording mock — resolves ok unless the recipient is in `failFor`. */
  function mockSend(failFor: string[] = []) {
    const calls: SendEmailInput[] = []
    const send = async (input: SendEmailInput): Promise<SendEmailResult> => {
      calls.push(input)
      if (failFor.includes(input.to)) throw new Error('boom: provider down')
      return { ok: true }
    }
    return { calls, send }
  }

  // ---- Cron endpoint auth ----

  describe('cron endpoint', () => {
    const originalSecret = process.env.CRON_SECRET
    const originalResendKey = process.env.RESEND_API_KEY
    beforeEach(() => {
      process.env.CRON_SECRET = 'test-secret'
      delete process.env.RESEND_API_KEY // authorized run must not hit the network
    })
    afterEach(() => {
      if (originalSecret === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = originalSecret
      if (originalResendKey !== undefined) process.env.RESEND_API_KEY = originalResendKey
    })

    it('returns 401 without the secret', async () => {
      const res = await cronGET(new Request('http://localhost/api/cron/daily-digest'))
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('CRON_UNAUTHORIZED')
    })

    it('returns 401 with a wrong secret', async () => {
      const res = await cronGET(
        new Request('http://localhost/api/cron/daily-digest', {
          headers: { authorization: 'Bearer wrong-secret' },
        }),
      )
      expect(res.status).toBe(401)
    })

    it('returns 401 when no CRON_SECRET is configured (closed by default)', async () => {
      delete process.env.CRON_SECRET
      const res = await cronGET(
        new Request('http://localhost/api/cron/daily-digest', {
          headers: { authorization: 'Bearer ' },
        }),
      )
      expect(res.status).toBe(401)
    })

    it('runs with the correct bearer secret', async () => {
      const res = await cronGET(
        new Request('http://localhost/api/cron/daily-digest', {
          headers: { authorization: 'Bearer test-secret' },
        }),
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(Array.isArray(body.sent)).toBe(true)
    })
  })

  // ---- Timezone gate ----

  it('emails only the tenants whose local time is 07:00', async () => {
    await setTimezone(f.a.tenant.id, KHI)
    await setTimezone(f.b.tenant.id, NYC)
    // 07:30 tomorrow in Karachi — New York is still on the previous evening.
    const now = tomorrowAtInTz(KHI, DIGEST_HOUR)
    expect(hourInTz(now, KHI)).toBe(DIGEST_HOUR)
    expect(hourInTz(now, NYC)).not.toBe(DIGEST_HOUR)

    await bookAt(f.a, tomorrowAtInTz(KHI, 10))
    await bookAt(f.b, tomorrowAtInTz(NYC, 10))

    const { calls, send } = mockSend()
    const summary = await runDailyDigest({ payload, now, send })

    expect(summary.sent).toEqual([f.a.tenant.name])
    expect(summary.skipped.join()).toContain(f.b.tenant.name)
    expect(calls).toHaveLength(1)
    expect(calls[0].to).toBe(f.a.owner.email)
    // The digest lists the patient's first name and the doctor.
    expect(calls[0].html).toContain('Patient')
    expect(calls[0].html).toContain(f.a.doctor.name)
  })

  it('skips a morning tenant that has no appointments today', async () => {
    await setTimezone(f.a.tenant.id, KHI)
    const now = tomorrowAtInTz(KHI, DIGEST_HOUR)

    const { calls, send } = mockSend()
    const summary = await runDailyDigest({ payload, now, send })

    expect(calls).toHaveLength(0)
    expect(summary.sent).toEqual([])
    expect(summary.skipped.join()).toContain('no appointments')
  })

  it('one tenant failing does not stop the rest of the run', async () => {
    await setTimezone(f.a.tenant.id, KHI)
    await setTimezone(f.b.tenant.id, KHI)
    const now = tomorrowAtInTz(KHI, DIGEST_HOUR)
    await bookAt(f.a, tomorrowAtInTz(KHI, 10))
    await bookAt(f.b, tomorrowAtInTz(KHI, 11))

    // Clinic A's owner email blows up; clinic B must still get its digest.
    const { send } = mockSend([f.a.owner.email])
    const summary = await runDailyDigest({ payload, now, send })

    expect(summary.failed).toEqual([f.a.tenant.name])
    expect(summary.sent).toEqual([f.b.tenant.name])
  })

  it('force mode ignores the hour gate (manual runs behind the secret)', async () => {
    await setTimezone(f.a.tenant.id, KHI)
    // Deliberately NOT 07:00 in Karachi.
    const now = tomorrowAtInTz(KHI, 15)
    await bookAt(f.a, tomorrowAtInTz(KHI, 16))

    const { calls, send } = mockSend()
    const summary = await runDailyDigest({ payload, now, force: true, send })

    expect(summary.sent).toContain(f.a.tenant.name)
    expect(calls.length).toBeGreaterThanOrEqual(1)
  })
})

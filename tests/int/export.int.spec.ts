import { describe, it, expect, beforeAll } from 'vitest'
import type { Payload } from 'payload'
import { getTestPayload, seedFixture, type Fixture } from './fixtures'
import { csvEscape, toCsv } from '@/lib/csv'
import { GET } from '@/app/api/export/[type]/route'

// v4-A — CSV exports (spec §A.3): escaping, route auth, tenant scoping and the
// PII audit entry. The route handler is called directly with a cookie-authed
// Request — exactly what the browser sends.

describe('v4-A — CSV escaping', () => {
  it('escapes commas, quotes and newlines per RFC 4180', () => {
    expect(csvEscape('plain')).toBe('plain')
    expect(csvEscape('Khan, Bobby')).toBe('"Khan, Bobby"')
    expect(csvEscape('the "boss"')).toBe('"the ""boss"""')
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(0)).toBe('0')
  })

  it('builds a CRLF document with a BOM and a header row', () => {
    const csv = toCsv(['Name', 'Phone'], [['Khan, "Bobby"', '0300'], ['Plain', null]])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1)).toBe('Name,Phone\r\n"Khan, ""Bobby""",0300\r\nPlain,\r\n')
  })
})

describe('v4-A — export route', () => {
  let payload: Payload
  let fixture: Fixture

  const login = async (email: string): Promise<string> => {
    const res = await payload.login({ collection: 'users', data: { email, password: 'password123' } })
    return res.token!
  }

  const call = (type: string, query: string, token?: string) =>
    GET(
      new Request(`http://localhost/api/export/${type}?${query}`, {
        headers: token ? { cookie: `payload-token=${token}` } : {},
      }),
      { params: Promise.resolve({ type }) },
    )

  // A wide range that certainly contains the fixture data created "now".
  const RANGE = 'from=2020-01-01&to=2030-01-01'

  beforeAll(async () => {
    payload = await getTestPayload()
    fixture = await seedFixture(payload)
  })

  it('lets the owner download their patients as CSV', async () => {
    const token = await login(fixture.a.owner.email)
    const res = await call('patients', RANGE, token)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('matab-patients-')

    const body = await res.text()
    expect(body).toContain('Patient A')
    // Tenant wall: clinic B's patient never leaks into clinic A's export.
    expect(body).not.toContain('Patient B')
  })

  it('ignores a client-supplied tenant for owners — scope comes from the session', async () => {
    const token = await login(fixture.a.owner.email)
    const res = await call('patients', `${RANGE}&tenant=${fixture.b.tenant.id}`, token)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Patient A')
    expect(body).not.toContain('Patient B')
  })

  it('denies receptionists and the signed-out', async () => {
    const token = await login(fixture.a.receptionist.email)
    expect((await call('patients', RANGE, token)).status).toBe(403)
    expect((await call('patients', RANGE)).status).toBe(401)
  })

  it('rejects unknown types and bad ranges', async () => {
    const token = await login(fixture.a.owner.email)
    expect((await call('secrets', RANGE, token)).status).toBe(404)
    expect((await call('patients', 'from=nope&to=2030-01-01', token)).status).toBe(400)
    expect((await call('patients', 'from=2030-01-01&to=2020-01-01', token)).status).toBe(400)
  })

  it('writes an export.generated audit entry — PII leaving is on the record', async () => {
    const token = await login(fixture.a.owner.email)
    await call('patients', RANGE, token)

    const audit = await payload.find({
      collection: 'auditLogs',
      where: {
        tenant: { equals: fixture.a.tenant.id },
        action: { equals: 'export.generated' },
      },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    expect(audit.totalDocs).toBeGreaterThan(0)
    expect(audit.docs[0]!.summary).toContain('patients')
  })
})

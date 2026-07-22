// Hourly cron endpoint (v3 spec §6.1). Vercel Cron calls this with
// `Authorization: Bearer ${CRON_SECRET}`; anything else is a 401. The digest
// itself decides which tenants are at 07:00 locally. `?force=1` (still behind
// the secret) skips the hour gate for manual runs and demos.

import { getPayload } from 'payload'
import config from '@payload-config'
import { runDailyDigest } from '@/lib/digest'
import { purgeExpiredUnverifiedSignups } from '@/lib/verification'
import { ERROR_CODES } from '@/lib/constants'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  // No secret configured ⇒ the endpoint is closed, never open by accident.
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: ERROR_CODES.CRON_UNAUTHORIZED }, { status: 401 })
  }

  const payload = await getPayload({ config: await config })
  const force = new URL(req.url).searchParams.get('force') === '1'
  const summary = await runDailyDigest({ payload, force })

  // Housekeeping rides the same hourly tick: self-serve signups whose owner never
  // verified within the grace window are swept out (BACKLOG §1.1). Best-effort —
  // a purge hiccup must never fail the digest.
  let purged: string[] = []
  try {
    purged = (await purgeExpiredUnverifiedSignups(payload)).purged
  } catch (err) {
    payload.logger?.error?.({ err }, 'unverified signup purge failed (non-fatal)')
  }

  return Response.json({ ok: true, ...summary, purged })
}

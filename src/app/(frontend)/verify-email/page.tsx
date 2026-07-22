// Landing page for the emailed confirmation link (BACKLOG §1.1). Server-rendered:
// the token is consumed during the render, so a valid link shows success straight
// away and a dead one offers a resend.

import Link from 'next/link'
import { getPayloadClient } from '@/lib/auth'
import { verifyEmailToken } from '@/lib/verification'
import { btnPrimary } from '@/components/primitives'
import { IconCheck } from '@/components/icons'
import { ResendForm } from './ResendForm'

export const dynamic = 'force-dynamic'

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  let verified = false
  if (token) {
    try {
      await verifyEmailToken(await getPayloadClient(), token)
      verified = true
    } catch {
      verified = false
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm animate-fade-up">
        <Link href="/" className="mb-8 flex w-fit items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="size-3.5" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
            </svg>
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-primary">matab</span>
        </Link>

        {verified ? (
          <div className="rounded-xl border border-border bg-card p-6">
            <span className="flex size-9 items-center justify-center rounded-full bg-secondary">
              <IconCheck size={16} className="text-primary" />
            </span>
            <h1 className="mt-4 font-display text-xl font-semibold tracking-tight">Email verified</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Your clinic is now in the approval queue. We&rsquo;ll email you as soon as it&rsquo;s
              approved — then you can sign in.
            </p>
            <Link href="/login" className={`${btnPrimary} mt-5 w-full`}>
              Go to sign in
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-6">
            <h1 className="font-display text-xl font-semibold tracking-tight">
              This link didn&rsquo;t work
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              The verification link is invalid, expired, or already used. If your email is already
              verified you can simply sign in — otherwise request a fresh link.
            </p>
            <ResendForm />
            <p className="mt-4 text-sm text-muted-foreground">
              Already verified?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

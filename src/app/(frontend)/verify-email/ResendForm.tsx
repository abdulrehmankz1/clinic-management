'use client'

import { useActionState } from 'react'
import { resendVerificationAction } from './actions'
import { btnPrimary, inputClass, Field, Spinner } from '@/components/primitives'

export function ResendForm() {
  const [state, formAction, pending] = useActionState(resendVerificationAction, null)

  if (state?.ok) {
    return (
      <p className="mt-5 rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-muted-foreground">
        If an unverified account exists for that email, a fresh link is on its way.
      </p>
    )
  }

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-3">
      <Field label="Your account email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@clinic.com"
          className={inputClass}
        />
      </Field>
      {state && !state.ok && (
        <p className="rounded-lg border border-red/25 bg-red-soft px-3 py-2 text-sm text-red" role="alert">
          {state.message}
        </p>
      )}
      <button type="submit" className={`${btnPrimary} w-full`} disabled={pending}>
        {pending && <Spinner />}
        {pending ? 'Sending…' : 'Resend verification email'}
      </button>
    </form>
  )
}

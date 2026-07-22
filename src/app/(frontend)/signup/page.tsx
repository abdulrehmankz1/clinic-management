'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { signupAction } from './actions'
import { btnPrimary, inputClass, Field, Spinner } from '@/components/primitives'
import { AppSelect } from '@/components/AppSelect'
import { IconCheck } from '@/components/icons'
import { COUNTRY_DEFAULTS, DEFAULT_COUNTRY, CURRENCIES, TIMEZONES } from '@/lib/constants'

const PROMISES = ['Live in 60 seconds', 'Sample data to explore', 'Free plan, no card needed']

const defaultsFor = (country: string) =>
  COUNTRY_DEFAULTS.find((c) => c.label === country) ?? COUNTRY_DEFAULTS[0]

export default function SignupPage() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<null | { verifyEmail: boolean }>(null)
  const [startedAt] = useState(() => Date.now())

  const initial = defaultsFor(DEFAULT_COUNTRY)
  const [form, setForm] = useState({
    clinicName: '',
    phone: '',
    city: '',
    country: DEFAULT_COUNTRY,
    currency: initial.currency,
    timezone: initial.timezone,
    ownerName: '',
    email: '',
    password: '',
    company: '', // honeypot
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // Picking a country suggests currency/timezone — still editable below.
  const onCountry = (country: string) => {
    const d = defaultsFor(country)
    setForm((f) => ({ ...f, country, currency: d.currency, timezone: d.timezone }))
  }

  const submit = () => {
    setError(null)
    start(async () => {
      const res = await signupAction({ ...form, startedAt })
      if (res.ok) setDone({ verifyEmail: res.data.verifyEmail })
      else setError(res.message)
    })
  }

  return (
    <main className="flex min-h-screen">
      {/* Brand panel */}
      <aside className="relative hidden w-[44%] overflow-hidden bg-sidebar lg:block">
        <Image
          src="/images/login-doctor.jpg"
          alt=""
          fill
          priority
          sizes="44vw"
          className="object-cover object-[50%_18%] opacity-85"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/55 to-sidebar/25" />
        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <Link href="/" className="flex w-fit items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/25 backdrop-blur">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4.5 text-sidebar-accent" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
              </svg>
            </span>
            <span className="font-display text-xl font-semibold tracking-tight text-white">matab</span>
          </Link>
          <div>
            <h2 className="max-w-md font-display text-3xl leading-snug font-semibold text-white xl:text-4xl">
              Your clinic, running by the end of this page.
            </h2>
            <ul className="mt-7 space-y-3">
              {PROMISES.map((p) => (
                <li key={p} className="flex items-center gap-3 text-[15px] text-white/85">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sidebar-accent/20 ring-1 ring-sidebar-accent/40">
                    <IconCheck size={12} strokeWidth={3} className="text-sidebar-accent" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <p className="mt-10 text-xs text-white/50">Multi-tenant clinic platform · Aapka clinic, organized.</p>
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <section className="flex flex-1 items-center justify-center bg-canvas px-4 py-10">
        <div className="w-full max-w-md animate-fade-up">
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="size-3.5" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
              </svg>
            </span>
            <span className="font-display text-xl font-semibold tracking-tight text-primary">matab</span>
          </Link>

          {done ? (
            <div className="rounded-2xl border border-primary/20 bg-secondary/30 p-7 text-center">
              <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary text-white">
                <IconCheck size={22} strokeWidth={3} />
              </span>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {done.verifyEmail ? 'Check your inbox' : 'Clinic created — pending approval'}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {done.verifyEmail
                  ? 'Thanks! We sent a confirmation link to your email. Click it to verify your address — your clinic then goes to admin approval, and you can sign in once it’s approved.'
                  : 'Thanks! Your clinic has been created and is now awaiting admin approval. You’ll be able to sign in as soon as it’s approved.'}
              </p>
              <Link href="/login" className={`${btnPrimary} mt-6 w-full`}>
                Go to sign in
              </Link>
            </div>
          ) : (
          <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Start your clinic free</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We&rsquo;ll set up your clinic with a little sample data so you can explore right away.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
            className="mt-8 flex flex-col gap-4"
          >
            <Field label="Clinic name" htmlFor="clinicName">
              <input id="clinicName" name="clinicName" required value={form.clinicName} onChange={(e) => set('clinicName', e.target.value)} placeholder="City Care Clinic" className={inputClass} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Clinic phone" htmlFor="phone">
                <input id="phone" name="phone" required value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+9251…" className={inputClass} />
              </Field>
              <Field label="City" htmlFor="city">
                <input id="city" name="city" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Rawalpindi" className={inputClass} />
              </Field>
            </div>

            <Field label="Country" hint="Sets your currency & timezone — both editable below.">
              <AppSelect value={form.country} onChange={onCountry} options={COUNTRY_DEFAULTS.map((c) => ({ value: c.label, label: c.label }))} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency">
                <AppSelect value={form.currency} onChange={(v) => set('currency', v)} options={CURRENCIES.map((c) => ({ value: c.value, label: c.value }))} />
              </Field>
              <Field label="Timezone">
                <AppSelect value={form.timezone} onChange={(v) => set('timezone', v)} options={TIMEZONES.map((t) => ({ value: t.value, label: t.label }))} />
              </Field>
            </div>

            <div className="mt-2 border-t border-border pt-4">
              <p className="mb-3 text-[13px] font-medium text-ink">Your owner account</p>
              <div className="flex flex-col gap-4">
                <Field label="Your name" htmlFor="ownerName">
                  <input id="ownerName" name="ownerName" required value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} placeholder="Dr. Sara Ahmed" className={inputClass} />
                </Field>
                <Field label="Email" htmlFor="email">
                  <input id="email" name="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@clinic.com" className={inputClass} />
                </Field>
                <Field label="Password" htmlFor="password" hint="At least 8 characters.">
                  <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="••••••••" className={inputClass} />
                </Field>
              </div>
            </div>

            {/* Honeypot — visually hidden, ignored by real users */}
            <div aria-hidden className="hidden">
              <label htmlFor="company">Company</label>
              <input id="company" name="company" tabIndex={-1} autoComplete="off" value={form.company} onChange={(e) => set('company', e.target.value)} />
            </div>

            {error && (
              <p className="rounded-lg border border-red/25 bg-red-soft px-3 py-2 text-sm text-red" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className={`${btnPrimary} mt-1 w-full`} disabled={pending}>
              {pending && <Spinner />}
              {pending ? 'Creating your clinic…' : 'Create my clinic'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have a clinic?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
          </>
          )}
        </div>
      </section>
    </main>
  )
}

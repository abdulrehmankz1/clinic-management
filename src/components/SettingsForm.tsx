'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { btnPrimary, inputClass, textareaClass, Field, Spinner } from './primitives'
import { AppSelect } from './AppSelect'
import { TimePicker } from './TimePicker'
import { updateClinicSettings } from '@/app/(frontend)/dashboard/settings/actions'
import { CURRENCIES, TIMEZONES } from '@/lib/constants'
import { IconCheck, IconBuilding, IconClock } from './icons'

export type SettingsInitial = {
  name: string
  phone: string
  address: string
  city: string
  country: string
  appointmentDurationMins: number
  openTime: string
  closeTime: string
  currency: string
  timezone: string
}

/** Stripe-style settings row: description rail on the left, fields card on the right. */
function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr] lg:gap-10">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary">
            {icon}
          </span>
          <h2 className="text-[15px] font-semibold">{title}</h2>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground lg:max-w-[260px]">
          {description}
        </p>
      </div>
      <div className="card-flat p-6">{children}</div>
    </div>
  )
}

export function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ ...initial, appointmentDurationMins: String(initial.appointmentDurationMins) })
  const set = (k: keyof typeof form, v: string) => {
    setSaved(false)
    setForm((f) => ({ ...f, [k]: v }))
  }

  const save = () => {
    setError(null)
    start(async () => {
      const res = await updateClinicSettings({
        name: form.name,
        phone: form.phone,
        address: form.address || undefined,
        city: form.city || undefined,
        country: form.country || undefined,
        appointmentDurationMins: Number(form.appointmentDurationMins) || 15,
        openTime: form.openTime,
        closeTime: form.closeTime,
        currency: form.currency,
        timezone: form.timezone,
      })
      if (res.ok) {
        setSaved(true)
        router.refresh()
      } else setError(res.message)
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section
        icon={<IconBuilding size={15} strokeWidth={1.75} />}
        title="Clinic profile"
        description="These details appear across the dashboard and (later) on printed documents like tokens and receipts."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Clinic name">
            <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              <textarea className={textareaClass} rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
          </div>
          <Field label="City">
            <input className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Country">
            <input className={inputClass} value={form.country} onChange={(e) => set('country', e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section
        icon={<IconClock size={15} strokeWidth={1.75} />}
        title="Scheduling"
        description="Working hours and defaults for the day view and new bookings. Currency and timezone are per-clinic."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Opens at">
            <TimePicker
              value={form.openTime}
              onChange={(v) => set('openTime', v)}
              openTime="00:00"
              closeTime="24:00"
              stepMins={30}
            />
          </Field>
          <Field label="Closes at">
            <TimePicker
              value={form.closeTime}
              onChange={(v) => set('closeTime', v)}
              openTime="00:00"
              closeTime="24:00"
              stepMins={30}
            />
          </Field>
          <Field label="Default slot (mins)">
            <input className={inputClass} inputMode="numeric" value={form.appointmentDurationMins} onChange={(e) => set('appointmentDurationMins', e.target.value)} />
          </Field>
          <Field label="Currency" hint="Existing records keep their stored amounts.">
            <AppSelect
              value={form.currency}
              onChange={(v) => set('currency', v)}
              options={CURRENCIES.map((c) => ({ value: c.value, label: c.label }))}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Timezone" hint="Changes how times are displayed, not stored data.">
              <AppSelect
                value={form.timezone}
                onChange={(v) => set('timezone', v)}
                options={TIMEZONES.map((t) => ({ value: t.value, label: t.label }))}
              />
            </Field>
          </div>
        </div>
      </Section>

      {/* Save bar */}
      <div className="card-flat flex items-center justify-between gap-3 px-6 py-4 lg:ms-[340px]">
        {error ? (
          <p className="text-sm text-red" role="alert">{error}</p>
        ) : saved ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-primary">
            <IconCheck size={15} /> Saved
          </p>
        ) : (
          <span className="text-xs text-faint">Changes apply immediately for all staff.</span>
        )}
        <button className={btnPrimary} disabled={pending || !form.name || !form.phone} onClick={save}>
          {pending && <Spinner />}
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

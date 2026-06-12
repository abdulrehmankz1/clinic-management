'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { btnPrimary, btnGhost, inputClass, Card, Field, Th, Td, Spinner } from './primitives'
import { AppSelect } from './AppSelect'
import { TablePager } from './TablePager'
import { IconPlus, IconBuilding, IconLogout } from './icons'

const TENANTS_PAGE_SIZE = 10
import { createClinic, setClinicStatus } from '@/app/(frontend)/super/actions'
import { logoutAction } from '@/app/(frontend)/login/actions'

export type TenantRow = {
  id: string
  name: string
  city?: string | null
  currency: string
  status: string
  doctors: number
  patients: number
  appointments: number
  createdAt: string
}

const CURRENCIES = ['PKR', 'USD', 'GBP', 'AED', 'SAR', 'INR']
const TIMEZONES = ['Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kolkata', 'Europe/London', 'America/New_York']

export function SuperConsole({ tenants }: { tenants: TenantRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(tenants.length / TENANTS_PAGE_SIZE))
  const pageRows = tenants.slice((page - 1) * TENANTS_PAGE_SIZE, page * TENANTS_PAGE_SIZE)
  const [form, setForm] = useState({
    name: '', phone: '', city: '', currency: 'PKR', timezone: 'Asia/Karachi',
    ownerName: '', ownerEmail: '', ownerPassword: '',
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const create = () => {
    setError(null)
    start(async () => {
      const res = await createClinic(form)
      if (res.ok) {
        setShowAdd(false)
        setForm({ name: '', phone: '', city: '', currency: 'PKR', timezone: 'Asia/Karachi', ownerName: '', ownerEmail: '', ownerPassword: '' })
        router.refresh()
      } else setError(res.message)
    })
  }

  const toggle = (id: string, status: string) => {
    start(async () => {
      const res = await setClinicStatus(id, status === 'active' ? 'suspended' : 'active')
      if (res.ok) router.refresh()
      else setError(res.message)
    })
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-up px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-primary">
            matab
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Platform console · {tenants.length} clinics</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin" className={btnGhost}>Admin panel</a>
          <button className={btnPrimary} onClick={() => setShowAdd((s) => !s)}>
            <IconPlus size={15} />
            New clinic
          </button>
          <form action={logoutAction}>
            <button type="submit" title="Log out" className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-canvas hover:text-ink">
              <IconLogout size={16} />
            </button>
          </form>
        </div>
      </div>

      {showAdd && (
        <Card className="mb-5 overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold">New clinic</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">The clinic and its owner are created together — both or neither.</p>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            <Field label="Clinic name"><input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Clinic phone"><input className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="City"><input className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency">
                <AppSelect
                  value={form.currency}
                  onChange={(v) => set('currency', v)}
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                />
              </Field>
              <Field label="Timezone">
                <AppSelect
                  value={form.timezone}
                  onChange={(v) => set('timezone', v)}
                  options={TIMEZONES.map((t) => ({ value: t, label: t }))}
                />
              </Field>
            </div>
            <Field label="Owner name"><input className={inputClass} value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} /></Field>
            <Field label="Owner email"><input className={inputClass} type="email" value={form.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} /></Field>
            <Field label="Temporary password"><input className={inputClass} value={form.ownerPassword} onChange={(e) => set('ownerPassword', e.target.value)} /></Field>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border bg-canvas/60 px-6 py-4">
            {error ? <p className="text-sm text-red">{error}</p> : <span />}
            <div className="flex gap-2">
              <button className={btnGhost} onClick={() => setShowAdd(false)}>Cancel</button>
              <button className={btnPrimary} disabled={pending} onClick={create}>{pending && <Spinner />}{pending ? 'Creating…' : 'Create clinic'}</button>
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-canvas/50">
              <Th>Clinic</Th>
              <Th>Currency</Th>
              <Th>Status</Th>
              <Th className="text-end">Doctors</Th>
              <Th className="text-end">Patients</Th>
              <Th className="text-end">Appts</Th>
              <Th className="text-end" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pageRows.map((t) => (
              <tr key={t.id} className="transition-colors hover:bg-canvas/60">
                <Td>
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <IconBuilding size={15} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{t.name}</div>
                      <div className="truncate text-xs text-faint">{t.city || '—'}</div>
                    </div>
                  </div>
                </Td>
                <Td className="text-muted-foreground">{t.currency}</Td>
                <Td>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    t.status === 'active' ? 'bg-primary-soft text-primary' : 'bg-amber-soft text-amber'
                  }`}>
                    <span className={`size-1.5 rounded-full ${t.status === 'active' ? 'bg-primary' : 'bg-amber'}`} />
                    {t.status}
                  </span>
                </Td>
                <Td className="tabular text-end">{t.doctors}</Td>
                <Td className="tabular text-end">{t.patients}</Td>
                <Td className="tabular text-end">{t.appointments}</Td>
                <Td className="text-end">
                  <button
                    className={`text-xs font-medium transition-colors ${
                      t.status === 'active' ? 'text-faint hover:text-red' : 'text-primary hover:underline'
                    }`}
                    disabled={pending}
                    onClick={() => toggle(t.id, t.status)}
                  >
                    {t.status === 'active' ? 'Suspend' : 'Reactivate'}
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePager page={page} totalPages={totalPages} onChange={setPage} />
      </Card>
    </div>
  )
}

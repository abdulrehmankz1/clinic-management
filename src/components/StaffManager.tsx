'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { btnPrimary, btnGhost, inputClass, Card, RoleBadge, PageTitle, Avatar, Field, Th, Td, Spinner } from './primitives'
import { AppSelect } from './AppSelect'
import { TimePicker } from './TimePicker'
import { TablePager } from './TablePager'
import { IconPlus } from './icons'

const STAFF_PAGE_SIZE = 10
import { createStaff, updateStaff, toggleStaffActive } from '@/app/(frontend)/dashboard/staff/actions'
import { AVAILABILITY_TYPES, WEEKDAYS, ALL_DAYS } from '@/lib/constants'

export type StaffRow = {
  id: string
  name: string
  email: string
  role: string
  phone?: string | null
  specialty?: string | null
  consultationFee?: number | null
  active: boolean
  availability?: string | null
  availabilityType?: string
  availableDays?: string[]
  availableFrom?: string
  availableTo?: string
}

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  role: 'receptionist',
  phone: '',
  specialty: '',
  consultationFee: '',
  availabilityType: 'regular',
  availableFrom: '09:00',
  availableTo: '17:00',
}

export function StaffManager({ staff, currency }: { staff: StaffRow[]; currency: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(staff.length / STAFF_PAGE_SIZE))
  const pageRows = staff.slice((page - 1) * STAFF_PAGE_SIZE, page * STAFF_PAGE_SIZE)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const [days, setDays] = useState<string[]>([...ALL_DAYS])
  const toggleDay = (d: string) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))

  const openAdd = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setDays([...ALL_DAYS])
    setError(null)
    setShowForm(true)
  }

  const openEdit = (s: StaffRow) => {
    setEditingId(s.id)
    setForm({
      name: s.name,
      email: s.email,
      password: '',
      role: s.role,
      phone: s.phone || '',
      specialty: s.specialty || '',
      consultationFee: s.consultationFee != null ? String(s.consultationFee) : '',
      availabilityType: s.availabilityType || 'regular',
      availableFrom: s.availableFrom || '09:00',
      availableTo: s.availableTo || '17:00',
    })
    setDays(s.availableDays?.length ? [...s.availableDays] : [...ALL_DAYS])
    setError(null)
    setShowForm(true)
  }

  const close = () => {
    setShowForm(false)
    setEditingId(null)
  }

  const save = () => {
    setError(null)
    start(async () => {
      const input = {
        name: form.name,
        email: form.email,
        role: form.role as 'doctor' | 'receptionist' | 'owner',
        phone: form.phone || undefined,
        specialty: form.specialty || undefined,
        consultationFee: form.consultationFee ? Number(form.consultationFee) : undefined,
        availabilityType: form.availabilityType,
        availableDays: days,
        availableFrom: form.availableFrom,
        availableTo: form.availableTo,
      }
      const res = editingId
        ? await updateStaff(editingId, { ...input, password: form.password || undefined })
        : await createStaff({ ...input, password: form.password })
      if (res.ok) {
        close()
        setForm({ ...EMPTY_FORM })
        setDays([...ALL_DAYS])
        router.refresh()
      } else setError(res.message)
    })
  }

  const toggle = (id: string, active: boolean) => {
    start(async () => {
      const res = await toggleStaffActive(id, active)
      if (res.ok) router.refresh()
      else setError(res.message)
    })
  }

  const money = (n?: number | null) =>
    n == null ? '—' : new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

  return (
    <div>
      <PageTitle
        subtitle={`${staff.length} team member${staff.length === 1 ? '' : 's'}`}
        action={
          <button className={btnPrimary} onClick={openAdd}>
            <IconPlus size={15} />
            Add staff
          </button>
        }
      >
        Staff
      </PageTitle>

      {showForm && (
        <Card className="mb-4 overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold">{editingId ? `Edit ${form.name || 'staff member'}` : 'New staff member'}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {editingId
                ? 'Changes apply the next time they sign in.'
                : 'They sign in with this email and the temporary password.'}
            </p>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            <Field label="Full name"><input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field
              label={editingId ? 'New password (leave blank to keep)' : 'Temporary password'}
            >
              <input className={inputClass} value={form.password} onChange={(e) => set('password', e.target.value)} />
            </Field>
            <Field label="Role">
              <AppSelect
                value={form.role}
                onChange={(v) => set('role', v)}
                options={[
                  { value: 'receptionist', label: 'Receptionist' },
                  { value: 'doctor', label: 'Doctor' },
                  { value: 'owner', label: 'Owner' },
                ]}
              />
            </Field>
            <Field label="Phone (optional)"><input className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            {form.role === 'doctor' && (
              <>
                <Field label="Specialty"><input className={inputClass} value={form.specialty} onChange={(e) => set('specialty', e.target.value)} placeholder="General Physician" /></Field>
                <Field label={`Consultation fee (${currency})`}><input className={inputClass} inputMode="numeric" value={form.consultationFee} onChange={(e) => set('consultationFee', e.target.value)} /></Field>
              </>
            )}
          </div>

          {form.role === 'doctor' && (
            <div className="mx-6 mb-6 rounded-lg border border-border bg-canvas/50 p-4">
              <Field label="Availability">
                <AppSelect
                  value={form.availabilityType}
                  onChange={(v) => set('availabilityType', v)}
                  options={AVAILABILITY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                />
              </Field>
              {form.availabilityType === 'regular' && (
                <div className="mt-3.5 flex flex-col gap-3.5">
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleDay(d.value)}
                        className={`h-8 rounded-md border px-3 text-xs font-medium transition-colors ${
                          days.includes(d.value)
                            ? 'border-primary/40 bg-primary-soft text-primary'
                            : 'border-border bg-surface text-faint hover:text-muted-foreground'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <TimePicker
                      value={form.availableFrom}
                      onChange={(v) => set('availableFrom', v)}
                      openTime="00:00"
                      closeTime="24:00"
                      stepMins={30}
                      className="max-w-36"
                    />
                    <span className="text-sm text-faint">to</span>
                    <TimePicker
                      value={form.availableTo}
                      onChange={(v) => set('availableTo', v)}
                      openTime="00:00"
                      closeTime="24:00"
                      stepMins={30}
                      className="max-w-36"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border bg-canvas/60 px-6 py-4">
            {error ? <p className="text-sm text-red">{error}</p> : <span />}
            <div className="flex gap-2">
              <button className={btnGhost} onClick={close}>Cancel</button>
              <button
                className={btnPrimary}
                disabled={pending || !form.name || !form.email || (!editingId && !form.password)}
                onClick={save}
              >
                {pending && <Spinner />}
                {pending ? 'Saving…' : editingId ? 'Save changes' : 'Add staff'}
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-canvas/50">
              <Th>Member</Th>
              <Th>Role</Th>
              <Th className="hidden md:table-cell">Phone</Th>
              <Th className="hidden sm:table-cell">Specialty · Fee · Availability</Th>
              <Th className="text-end" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pageRows.map((s) => (
              <tr key={s.id} className={`transition-colors hover:bg-canvas/60 ${s.active ? '' : 'opacity-50'}`}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={s.name} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{s.name}</div>
                      <div className="truncate text-xs text-faint">{s.email}</div>
                    </div>
                  </div>
                </Td>
                <Td><RoleBadge role={s.role} /></Td>
                <Td className="tabular hidden text-muted-foreground md:table-cell">{s.phone || '—'}</Td>
                <Td className="hidden sm:table-cell">
                  {s.role === 'doctor' ? (
                    <div className="text-muted-foreground">
                      <div>{s.specialty || '—'} · <span className="tabular">{money(s.consultationFee)}</span></div>
                      {s.availability && <div className="text-xs text-faint">{s.availability}</div>}
                    </div>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </Td>
                <Td className="text-end">
                  <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                    <button
                      className="text-xs font-medium text-primary transition-colors hover:underline"
                      disabled={pending}
                      onClick={() => openEdit(s)}
                    >
                      Edit
                    </button>
                    <button
                      className={`text-xs font-medium transition-colors ${s.active ? 'text-faint hover:text-red' : 'text-primary hover:underline'}`}
                      disabled={pending}
                      onClick={() => toggle(s.id, !s.active)}
                    >
                      {s.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePager page={page} totalPages={totalPages} onChange={setPage} />
      </Card>
      <p className="mt-3 text-xs text-faint">
        Deactivating keeps a staff member&apos;s history intact — they just can&apos;t sign in.
      </p>
    </div>
  )
}

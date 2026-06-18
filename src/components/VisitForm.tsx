'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { btnPrimary, inputClass, textareaClass, Card, Field, Avatar, Spinner } from './primitives'
import { AppSelect } from './AppSelect'
import { DatePicker } from './DatePicker'
import { IconPlus, IconX, IconStethoscope } from './icons'
import { PRESCRIPTION_FREQUENCIES } from '@/lib/constants'
import { recordVisit, type PrescriptionRowInput } from '@/app/(frontend)/dashboard/visits/actions'

const FREQ_OPTIONS = PRESCRIPTION_FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))
const blankRow = (): PrescriptionRowInput => ({ medicine: '', dosage: '', frequency: '', durationDays: undefined, instructions: '' })

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-6 py-5 last:border-0">
      <div className="mb-3.5 flex items-center gap-2.5">
        <span className="flex size-5 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary">{n}</span>
        <h2 className="text-[13px] font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

export function VisitForm({
  appointmentId,
  patientName,
  doctorName,
}: {
  appointmentId: string
  patientName: string
  doctorName: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Vitals (kept as strings so empty stays empty, parsed on submit)
  const [bpS, setBpS] = useState('')
  const [bpD, setBpD] = useState('')
  const [temp, setTemp] = useState('')
  const [weight, setWeight] = useState('')
  const [pulse, setPulse] = useState('')

  const [symptoms, setSymptoms] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [notes, setNotes] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [rows, setRows] = useState<PrescriptionRowInput[]>([blankRow()])

  const setRow = (i: number, patch: Partial<PrescriptionRowInput>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  const addRow = () => setRows((r) => [...r, blankRow()])
  const removeRow = (i: number) => setRows((r) => (r.length === 1 ? r : r.filter((_, idx) => idx !== i)))

  const num = (s: string) => (s.trim() === '' ? undefined : Number(s))

  const submit = () => {
    setError(null)
    start(async () => {
      const res = await recordVisit({
        appointmentId,
        symptoms,
        diagnosis,
        notes,
        vitals: { bpSystolic: num(bpS), bpDiastolic: num(bpD), temperatureC: num(temp), weightKg: num(weight), pulse: num(pulse) },
        prescription: rows.filter((r) => r.medicine.trim()).map((r) => ({ ...r, durationDays: r.durationDays ? Number(r.durationDays) : undefined })),
        followUpDate: followUp || undefined,
      })
      // The server route re-renders into the "Visit recorded → next steps" panel.
      if (res.ok) router.refresh()
      else setError(res.message)
    })
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border bg-secondary/30 px-6 py-4">
        <Avatar name={patientName} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{patientName}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconStethoscope size={13} className="text-faint" />
            {doctorName}
          </div>
        </div>
      </div>

      <Section n={1} title="Vitals">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <Field label="BP systolic"><input className={inputClass} inputMode="numeric" value={bpS} onChange={(e) => setBpS(e.target.value)} placeholder="120" /></Field>
          <Field label="BP diastolic"><input className={inputClass} inputMode="numeric" value={bpD} onChange={(e) => setBpD(e.target.value)} placeholder="80" /></Field>
          <Field label="Temp (°C)"><input className={inputClass} inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="37" /></Field>
          <Field label="Weight (kg)"><input className={inputClass} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="70" /></Field>
          <Field label="Pulse (bpm)"><input className={inputClass} inputMode="numeric" value={pulse} onChange={(e) => setPulse(e.target.value)} placeholder="72" /></Field>
        </div>
      </Section>

      <Section n={2} title="Assessment">
        <div className="flex flex-col gap-4">
          <Field label="Symptoms"><textarea className={textareaClass} rows={2} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="Presenting complaints…" /></Field>
          <Field label="Diagnosis"><input className={inputClass} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Viral fever" /></Field>
          <Field label="Notes (optional)"><textarea className={textareaClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </Section>

      <Section n={3} title="Prescription">
        <div className="flex flex-col gap-2.5">
          {rows.map((row, i) => (
            <div key={i} className="rounded-lg border border-border bg-canvas/40 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_0.8fr_1fr]">
                <input className={inputClass} placeholder="Medicine" value={row.medicine} onChange={(e) => setRow(i, { medicine: e.target.value })} />
                <input className={inputClass} placeholder="Dosage (500mg)" value={row.dosage} onChange={(e) => setRow(i, { dosage: e.target.value })} />
                <AppSelect value={row.frequency ?? ''} onChange={(v) => setRow(i, { frequency: v })} placeholder="Frequency" options={FREQ_OPTIONS} />
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[0.8fr_1.6fr_auto]">
                <input className={inputClass} inputMode="numeric" placeholder="Days" value={row.durationDays ?? ''} onChange={(e) => setRow(i, { durationDays: e.target.value === '' ? undefined : Number(e.target.value) })} />
                <input className={inputClass} placeholder="Instructions (after meals)" value={row.instructions} onChange={(e) => setRow(i, { instructions: e.target.value })} />
                <button type="button" onClick={() => removeRow(i)} className="flex h-10 items-center justify-center rounded-md border border-border px-3 text-muted-foreground transition-colors hover:border-red/40 hover:text-red disabled:opacity-40" disabled={rows.length === 1} title="Remove">
                  <IconX size={15} />
                </button>
              </div>
              {row.frequency === 'other' && (
                <input className={`${inputClass} mt-2`} placeholder="Describe frequency" value={row.frequencyNote ?? ''} onChange={(e) => setRow(i, { frequencyNote: e.target.value })} />
              )}
            </div>
          ))}
          <button type="button" onClick={addRow} className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-primary hover:underline">
            <IconPlus size={14} /> Add medicine
          </button>
        </div>
      </Section>

      <Section n={4} title="Follow-up">
        <div className="max-w-xs">
          <Field label="Follow-up date (optional)"><DatePicker value={followUp} onChange={setFollowUp} /></Field>
        </div>
      </Section>

      <div className="flex items-center justify-between gap-3 bg-canvas/60 px-6 py-4">
        {error ? <p className="text-sm text-red" role="alert">{error}</p> : <span />}
        <button type="button" className={btnPrimary} disabled={pending} onClick={submit}>
          {pending && <Spinner />}
          {pending ? 'Saving…' : 'Save visit'}
        </button>
      </div>
    </Card>
  )
}

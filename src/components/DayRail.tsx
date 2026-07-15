'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  StatusBadge,
  btnPrimary,
  btnGhost,
  btnDanger,
  inputClass,
  Avatar,
  Spinner,
} from './primitives'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { IconClock, IconStethoscope, IconCheck, IconCalendar, IconWhatsApp } from './icons'
import { STATUS_TRANSITIONS, type AppointmentStatus } from '@/lib/constants'
import { updateAppointmentStatus } from '@/app/(frontend)/dashboard/appointments/actions'

export type Block = {
  id: string
  patientName: string
  reason: string
  status: AppointmentStatus
  timeLabel: string
  startMinutes: number
  durationMins: number
  isWalkIn: boolean
  token?: string | null
  doctorName?: string
  /** Prefilled wa.me reminder link (v3 §6.2); null when the phone can't be dialled. */
  waHref?: string | null
}

export type DoctorColumn = {
  id: string
  name: string
  blocks: Block[]
  /** Available window in minutes-from-midnight (for shading); null = no fixed window. */
  windowFrom: number | null
  windowTo: number | null
  availabilityNote?: string | null
}

const PX_PER_MIN = 1.6
const HEADER_H = 64
/** Shortest visual length used for collision + min card height (≈26px). */
const MIN_VISUAL_MINS = 16

const BLOCK_STYLES: Record<AppointmentStatus, { bar: string; card: string }> = {
  scheduled: { bar: 'bg-primary', card: 'border-border bg-card hover:border-primary/40' },
  'checked-in': { bar: 'bg-blue', card: 'border-blue/25 bg-blue-soft/70 hover:border-blue/50' },
  completed: {
    bar: 'bg-green-strong',
    card: 'border-green-strong/20 bg-green-soft/60 hover:border-green-strong/40',
  },
  cancelled: { bar: 'bg-faint', card: 'border-border bg-muted/50 hover:border-faint' },
  'no-show': { bar: 'bg-amber', card: 'border-amber/25 bg-amber-soft/70 hover:border-amber/50' },
}

const STATUS_DOTS: Record<AppointmentStatus, string> = {
  scheduled: 'bg-primary',
  'checked-in': 'bg-blue',
  completed: 'bg-green-strong',
  cancelled: 'bg-faint',
  'no-show': 'bg-amber',
}

const NEXT_ACTION: Partial<Record<AppointmentStatus, { label: string; style: string }>> = {
  'checked-in': { label: 'Check in', style: btnPrimary },
  completed: { label: 'Mark completed', style: btnPrimary },
  'no-show': { label: 'Mark no-show', style: btnGhost },
}

/** The single most useful next step, shown as an inline one-tap button. */
const QUICK_STEP: Partial<
  Record<AppointmentStatus, { to: AppointmentStatus; label: string; doing: string }>
> = {
  scheduled: { to: 'checked-in', label: 'Check in', doing: 'Checking in…' },
  'checked-in': { to: 'completed', label: 'Complete', doing: 'Completing…' },
}

/** Minutes-from-midnight → "9 am" / "9:30 am". */
function fmtMin(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  const h12 = h % 12 === 0 ? 12 : h % 12
  const suffix = h < 12 ? 'am' : 'pm'
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

type Laid = { b: Block; lane: number; lanes: number }

/**
 * Interval layout (Google-Calendar style): overlapping appointments split the
 * column into side-by-side lanes instead of painting over each other.
 */
function layoutColumn(blocks: Block[]): Laid[] {
  const sorted = [...blocks].sort(
    (a, b) => a.startMinutes - b.startMinutes || b.durationMins - a.durationMins,
  )
  const out: { b: Block; lane: number; cluster: number }[] = []
  const clusterMaxLanes: number[] = []
  let laneEnds: number[] = []
  let cluster = -1
  let clusterEnd = -Infinity

  for (const b of sorted) {
    const start = b.startMinutes
    const end = b.startMinutes + Math.max(b.durationMins, MIN_VISUAL_MINS)
    if (start >= clusterEnd) {
      cluster++
      clusterMaxLanes[cluster] = 0
      laneEnds = []
      clusterEnd = end
    } else {
      clusterEnd = Math.max(clusterEnd, end)
    }
    let lane = laneEnds.findIndex((e) => e <= start)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = end
    clusterMaxLanes[cluster] = Math.max(clusterMaxLanes[cluster], lane + 1)
    out.push({ b, lane, cluster })
  }
  return out.map((o) => ({ b: o.b, lane: o.lane, lanes: clusterMaxLanes[o.cluster] }))
}

export function DayRail({
  columns,
  openMinutes,
  closeMinutes,
  nowMinutes,
  canRecordVisit = false,
}: {
  columns: DoctorColumn[]
  openMinutes: number
  closeMinutes: number
  /** Current time in tenant tz (minutes from midnight) — only set when viewing today. */
  nowMinutes?: number | null
  /** Doctors/owners may record a consultation from the details sheet. */
  canRecordVisit?: boolean
}) {
  const [view, setView] = useState<'list' | 'rail'>('list')
  const [selected, setSelected] = useState<Block | null>(null)
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // id of the row whose inline quick action is running
  const [quickId, setQuickId] = useState<string | null>(null)

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('matab-day-view') : null
    if (saved === 'rail' || saved === 'list') setView(saved)
  }, [])

  const switchView = (v: 'list' | 'rail') => {
    setView(v)
    try {
      localStorage.setItem('matab-day-view', v)
    } catch {
      /* private mode */
    }
  }

  const act = (status: AppointmentStatus, reason?: string) => {
    if (!selected) return
    setError(null)
    startTransition(async () => {
      const res = await updateAppointmentStatus(selected.id, status, reason)
      if (res.ok) {
        setSelected(null)
        router.refresh()
      } else {
        setError(res.message)
      }
    })
  }

  const quickAct = (b: Block, to: AppointmentStatus) => {
    setQuickId(b.id)
    startTransition(async () => {
      await updateAppointmentStatus(b.id, to)
      setQuickId(null)
      router.refresh()
    })
  }

  const openSheet = (b: Block) => {
    setError(null)
    setSelected(b)
  }

  if (columns.length === 0) {
    return (
      <div className="card-flat px-6 py-14 text-center text-sm text-muted-foreground">
        No active doctors in this clinic yet.
      </div>
    )
  }

  const allBlocks = columns.flatMap((c) => c.blocks)
  const statusCounts = allBlocks.reduce<Partial<Record<AppointmentStatus, number>>>((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="relative">
      {/* View switch + hint */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {(
            [
              { key: 'list', label: 'List' },
              { key: 'rail', label: 'Timeline' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => switchView(opt.key)}
              className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                view === opt.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-faint">
          {view === 'list'
            ? 'Today in order — tap Check in / Complete right on the row.'
            : 'Each column is one doctor’s day. Click any card for actions.'}
        </p>
      </div>

      {view === 'list' ? (
        <QueueList
          columns={columns}
          nowMinutes={nowMinutes}
          quickId={quickId}
          pending={pending}
          onQuick={quickAct}
          onOpen={openSheet}
        />
      ) : (
        <Timeline
          columns={columns}
          openMinutes={openMinutes}
          closeMinutes={closeMinutes}
          nowMinutes={nowMinutes}
          onOpen={openSheet}
        />
      )}

      {/* Legend with live counts */}
      <div className="mt-3 flex flex-wrap items-center gap-2 px-1">
        {(
          ['scheduled', 'checked-in', 'completed', 'cancelled', 'no-show'] as AppointmentStatus[]
        ).map((s) => (
          <span
            key={s}
            className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium ${
              statusCounts[s] ? 'text-foreground/75' : 'text-faint'
            }`}
          >
            <span className={`size-1.5 rounded-full ${STATUS_DOTS[s]}`} />
            <span className="capitalize">{s.replace('-', ' ')}</span>
            {statusCounts[s] ? <span className="tabular text-faint">{statusCounts[s]}</span> : null}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-faint">
          <span className="rounded-sm bg-blue-soft px-1 py-px text-[9px] font-bold text-blue">T-01</span>
          walk-in token
        </span>
      </div>

      {/* Appointment details — shadcn Sheet */}
      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="gap-0">
          {selected && (
            <>
              <SheetHeader className="border-b px-6 py-5">
                <SheetTitle className="tabular flex items-center gap-2 text-lg font-semibold">
                  <IconClock size={16} className="text-faint" />
                  {selected.timeLabel}
                  {selected.isWalkIn && selected.token && (
                    <span className="rounded bg-blue-soft px-2 py-0.5 text-xs font-semibold text-blue">
                      {selected.token}
                    </span>
                  )}
                </SheetTitle>
                <SheetDescription>
                  {selected.durationMins} min{selected.isWalkIn ? ' · walk-in' : ''}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3">
                  <Avatar name={selected.patientName} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{selected.patientName}</div>
                    {selected.reason && (
                      <div className="truncate text-xs text-muted-foreground">{selected.reason}</div>
                    )}
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                {selected.doctorName && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground">
                    <IconStethoscope size={14} className="shrink-0 text-faint" />
                    <span className="truncate font-medium text-foreground/80">
                      {selected.doctorName}
                    </span>
                  </div>
                )}

                {/* WhatsApp reminder (v3 §6.2) — only while the visit is still ahead. */}
                {selected.waHref && (selected.status === 'scheduled' || selected.status === 'checked-in') && (
                  <a
                    href={selected.waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${btnGhost} mt-3 w-full`}
                  >
                    <IconWhatsApp size={15} className="text-primary" />
                    WhatsApp reminder
                  </a>
                )}

                {error && (
                  <p className="mt-4 rounded-lg border border-red/25 bg-red-soft px-3 py-2 text-sm text-red">
                    {error}
                  </p>
                )}

                {canRecordVisit && (selected.status === 'checked-in' || selected.status === 'completed') && (
                  <Link
                    href={`/dashboard/visits/new?appointment=${selected.id}`}
                    className={`${selected.status === 'checked-in' ? btnPrimary : btnGhost} mt-6 w-full`}
                  >
                    <IconStethoscope size={15} />
                    Record visit
                  </Link>
                )}

                <div className="mt-6 flex flex-col gap-2">
                  {STATUS_TRANSITIONS[selected.status].map((next) =>
                    next === 'cancelled' ? (
                      <CancelButton key={next} pending={pending} onConfirm={(r) => act('cancelled', r)} />
                    ) : (
                      <button
                        key={next}
                        className={NEXT_ACTION[next]?.style ?? btnGhost}
                        disabled={pending}
                        onClick={() => act(next)}
                      >
                        {pending && <Spinner />}
                        {NEXT_ACTION[next]?.label ?? next}
                      </button>
                    ),
                  )}
                  {STATUS_TRANSITIONS[selected.status].length === 0 && (
                    <p className="rounded-lg bg-muted px-3 py-2.5 text-center text-sm text-muted-foreground">
                      This appointment is closed.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Queue list — the no-training view. One row per visit, in order,    */
/* with the next step as a big obvious button.                        */
/* ------------------------------------------------------------------ */

function QueueList({
  columns,
  nowMinutes,
  quickId,
  pending,
  onQuick,
  onOpen,
}: {
  columns: DoctorColumn[]
  nowMinutes?: number | null
  quickId: string | null
  pending: boolean
  onQuick: (b: Block, to: AppointmentStatus) => void
  onOpen: (b: Block) => void
}) {
  const [doctorFilter, setDoctorFilter] = useState<string>('all')

  const rows = columns
    .flatMap((c) => c.blocks.map((b) => ({ ...b, doctorId: c.id, doctorName: c.name })))
    .filter((b) => doctorFilter === 'all' || b.doctorId === doctorFilter)
    .sort((a, b) => a.startMinutes - b.startMinutes)

  // First visit that still needs attention today → the "Next" highlight.
  const nextId =
    nowMinutes != null
      ? rows.find(
          (b) =>
            (b.status === 'scheduled' || b.status === 'checked-in') &&
            b.startMinutes + b.durationMins >= nowMinutes,
        )?.id
      : undefined

  const doctorsWithCounts = columns.map((c) => ({ id: c.id, name: c.name, count: c.blocks.length }))

  return (
    <div>
      {/* Doctor filter chips */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <FilterChip
          active={doctorFilter === 'all'}
          onClick={() => setDoctorFilter('all')}
          label="All doctors"
          count={columns.reduce((s, c) => s + c.blocks.length, 0)}
        />
        {doctorsWithCounts.map((d) => (
          <FilterChip
            key={d.id}
            active={doctorFilter === d.id}
            onClick={() => setDoctorFilter(d.id)}
            label={d.name.replace(/^Dr\.?\s+/i, 'Dr ')}
            count={d.count}
          />
        ))}
      </div>

      <div className="card-flat overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-primary">
              <IconCalendar size={18} />
            </span>
            <p className="text-sm font-medium">No appointments here yet</p>
            <p className="text-xs text-muted-foreground">
              Book one and it will appear in this list, in time order.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((b) => {
              const isNext = b.id === nextId
              const closed = b.status === 'cancelled' || b.status === 'no-show'
              const step = QUICK_STEP[b.status]
              const busy = quickId === b.id && pending
              return (
                <li
                  key={b.id}
                  className={`relative transition-colors ${
                    isNext ? 'bg-secondary/35' : 'hover:bg-background/70'
                  } ${closed ? 'opacity-55' : ''}`}
                >
                  {isNext && <span className="absolute inset-y-0 start-0 w-[3px] bg-primary" />}
                  <div className="flex items-center gap-2.5 px-3 py-3 sm:gap-4 sm:px-5">
                    {/* time */}
                    <button onClick={() => onOpen(b)} className="w-[58px] shrink-0 text-start sm:w-[74px]">
                      <span
                        className={`tabular block text-[15px] font-semibold leading-tight ${
                          b.status === 'cancelled' ? 'line-through' : ''
                        }`}
                      >
                        {b.timeLabel}
                      </span>
                      <span className="tabular block text-[11px] text-faint">
                        {b.durationMins} min
                      </span>
                    </button>

                    {/* patient */}
                    <button
                      onClick={() => onOpen(b)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-start"
                    >
                      <span className="hidden sm:inline-flex">
                        <Avatar name={b.patientName} size="sm" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`truncate text-sm font-semibold ${
                              b.status === 'cancelled' ? 'line-through' : ''
                            }`}
                          >
                            {b.patientName}
                          </span>
                          {b.isWalkIn && (
                            <span className="shrink-0 rounded bg-blue-soft px-1.5 py-px text-[10px] font-bold text-blue">
                              {b.token || 'Walk-in'}
                            </span>
                          )}
                          {isNext && (
                            <span className="shrink-0 rounded-full bg-primary px-2 py-px text-[10px] font-semibold text-white">
                              Next
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {b.doctorName}
                          {b.reason ? ` · ${b.reason}` : ''}
                        </span>
                      </span>
                    </button>

                    {/* status + quick action */}
                    <div className="flex shrink-0 items-center gap-2">
                      {b.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-soft px-2.5 py-1 text-xs font-medium text-green-strong">
                          <IconCheck size={12} strokeWidth={2.5} />
                          Done
                        </span>
                      ) : (
                        <StatusBadge status={b.status} className="hidden sm:inline-flex" />
                      )}
                      {step && (
                        <button
                          onClick={() => onQuick(b, step.to)}
                          disabled={busy}
                          className={`inline-flex h-8 min-w-[80px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors disabled:opacity-70 sm:min-w-[96px] sm:px-3 ${
                            b.status === 'scheduled'
                              ? 'bg-primary text-white hover:bg-primary-hover'
                              : 'border border-primary/30 bg-secondary text-primary hover:bg-secondary/70'
                          }`}
                        >
                          {busy ? (
                            <>
                              <Spinner className="size-3.5" />
                              {step.doing}
                            </>
                          ) : (
                            step.label
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-primary bg-primary text-white'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary'
      }`}
    >
      {label}
      <span className={`tabular ${active ? 'text-white/75' : 'text-faint'}`}>{count}</span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Timeline — the spatial view (per-doctor columns, hour ruler).      */
/* ------------------------------------------------------------------ */

function Timeline({
  columns,
  openMinutes,
  closeMinutes,
  nowMinutes,
  onOpen,
}: {
  columns: DoctorColumn[]
  openMinutes: number
  closeMinutes: number
  nowMinutes?: number | null
  onOpen: (b: Block) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const span = Math.max(60, closeMinutes - openMinutes)
  const railHeight = span * PX_PER_MIN

  const hours: number[] = []
  for (let h = Math.ceil(openMinutes / 60); h <= Math.floor(closeMinutes / 60); h++) hours.push(h)

  // On mount: jump to "now" (today) or the first appointment of the day.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let target: number | null = null
    if (nowMinutes != null && nowMinutes >= openMinutes && nowMinutes <= closeMinutes) {
      target = (nowMinutes - openMinutes) * PX_PER_MIN - 180
    } else {
      const first = Math.min(
        ...columns.flatMap((c) => c.blocks.map((b) => b.startMinutes)).filter(Number.isFinite),
      )
      if (Number.isFinite(first)) target = (first - openMinutes) * PX_PER_MIN - 60
    }
    if (target != null) el.scrollTop = Math.max(0, target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nowVisible = nowMinutes != null && nowMinutes >= openMinutes && nowMinutes <= closeMinutes
  const nowTop = nowVisible ? HEADER_H + (nowMinutes! - openMinutes) * PX_PER_MIN : 0

  return (
    <div className="card-flat overflow-hidden">
      <div
        ref={scrollRef}
        className="rail-scroll relative max-h-[calc(100dvh-300px)] min-h-[420px] overflow-auto overscroll-contain"
      >
        <div className="relative flex min-w-max">
          {/* ---- Time ruler (sticky left) ---- */}
          <div className="sticky start-0 z-20 w-[68px] shrink-0 border-e bg-card">
            <div className="sticky top-0 z-10 border-b bg-card" style={{ height: HEADER_H }} />
            <div className="relative" style={{ height: railHeight }}>
              {hours.map((h) => (
                <span
                  key={h}
                  className="tabular absolute end-2.5 -translate-y-1/2 text-[11px] font-medium text-faint select-none"
                  style={{ top: (h * 60 - openMinutes) * PX_PER_MIN }}
                >
                  {fmtMin(h * 60)}
                </span>
              ))}
              {nowVisible && (
                <span
                  className="tabular absolute end-1.5 z-10 -translate-y-1/2 rounded-md bg-red px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
                  style={{ top: (nowMinutes! - openMinutes) * PX_PER_MIN }}
                >
                  {fmtMin(nowMinutes!)}
                </span>
              )}
            </div>
          </div>

          {/* ---- Doctor columns ---- */}
          {columns.map((col) => {
            const laid = layoutColumn(col.blocks)
            const offToday = col.windowFrom == null && Boolean(col.availabilityNote?.startsWith('Off'))
            const flexible = col.windowFrom == null && !offToday // on call / by appointment
            return (
              <div key={col.id} className="w-[236px] min-w-[208px] flex-1 border-e last:border-e-0">
                {/* Header (sticky top) */}
                <div
                  className="sticky top-0 z-10 flex items-center gap-2.5 border-b bg-card/95 px-3 backdrop-blur-sm"
                  style={{ height: HEADER_H }}
                >
                  <Avatar name={col.name} size="sm" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-[13px] font-semibold">{col.name}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      {col.windowFrom != null && col.windowTo != null ? (
                        <span className="tabular inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          <IconClock size={10} strokeWidth={2} />
                          {fmtMin(col.windowFrom)} – {fmtMin(col.windowTo)}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                            offToday ? 'bg-muted text-muted-foreground' : 'bg-blue-soft text-blue'
                          }`}
                        >
                          {col.availabilityNote}
                        </span>
                      )}
                    </div>
                  </div>
                  {col.blocks.length > 0 && (
                    <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                      {col.blocks.length}
                    </span>
                  )}
                </div>

                {/* Rail body */}
                <div
                  className={`relative ${flexible ? 'bg-card' : 'bg-offhours'}`}
                  style={{ height: railHeight }}
                >
                  {/* available window = clean surface; off-hours stay tinted */}
                  {col.windowFrom != null && col.windowTo != null && (
                    <div
                      className="absolute inset-x-0 bg-card"
                      style={{
                        top: Math.max(0, (col.windowFrom - openMinutes) * PX_PER_MIN),
                        height: Math.max(
                          0,
                          (Math.min(col.windowTo, closeMinutes) -
                            Math.max(col.windowFrom, openMinutes)) *
                            PX_PER_MIN,
                        ),
                      }}
                    />
                  )}

                  {/* hour + half-hour lines */}
                  {hours.map((h) => (
                    <div key={h}>
                      <div
                        className="absolute inset-x-0 border-t border-border/80"
                        style={{ top: (h * 60 - openMinutes) * PX_PER_MIN }}
                      />
                      {h * 60 + 30 < closeMinutes && h * 60 + 30 > openMinutes && (
                        <div
                          className="absolute inset-x-0 border-t border-dashed border-border/40"
                          style={{ top: (h * 60 + 30 - openMinutes) * PX_PER_MIN }}
                        />
                      )}
                    </div>
                  ))}

                  {/* off-today watermark */}
                  {offToday && (
                    <div className="pointer-events-none sticky top-[40%] flex justify-center">
                      <span className="rounded-full bg-card/80 px-3 py-1 text-[11px] font-medium text-faint">
                        Not available today
                      </span>
                    </div>
                  )}

                  {/* empty-day hint for available doctors */}
                  {!offToday && col.blocks.length === 0 && (
                    <div
                      className="pointer-events-none absolute inset-x-0 flex justify-center"
                      style={{
                        top:
                          col.windowFrom != null
                            ? (Math.max(col.windowFrom, openMinutes) - openMinutes) * PX_PER_MIN + 14
                            : '42%',
                      }}
                    >
                      <span className="text-[11px] text-faint">No appointments</span>
                    </div>
                  )}

                  {/* appointment blocks — laid out in lanes so overlaps sit side by side */}
                  {laid.map(({ b, lane, lanes }) => {
                    const top = (b.startMinutes - openMinutes) * PX_PER_MIN + 1
                    const height = Math.max(b.durationMins, MIN_VISUAL_MINS) * PX_PER_MIN - 3
                    const dim = b.status === 'cancelled' || b.status === 'no-show'
                    const compact = height < 36
                    const style = BLOCK_STYLES[b.status]
                    return (
                      <button
                        key={b.id}
                        onClick={() => onOpen({ ...b, doctorName: b.doctorName ?? col.name })}
                        title={`${b.timeLabel} · ${b.patientName}${b.reason ? ` — ${b.reason}` : ''}`}
                        className={`absolute z-[5] overflow-hidden rounded-md border text-start shadow-[0_1px_2px_rgb(28_36_34/0.06)] transition-[box-shadow,border-color,transform] duration-150 hover:z-20 hover:-translate-y-px hover:shadow-[0_3px_10px_rgb(28_36_34/0.12)] ${style.card} ${
                          dim ? 'opacity-60 hover:opacity-95' : ''
                        }`}
                        style={{
                          top,
                          height,
                          left: `calc(${(lane / lanes) * 100}% + ${lane === 0 ? 5 : 2}px)`,
                          width: `calc(${100 / lanes}% - ${lanes === 1 ? 10 : lane === lanes - 1 ? 7 : 4}px)`,
                        }}
                      >
                        <span className={`absolute inset-y-0 start-0 w-[3px] ${style.bar}`} />
                        {compact ? (
                          <span className="flex h-full items-center gap-1.5 ps-2.5 pe-1.5">
                            <span
                              className={`tabular shrink-0 text-[10px] font-semibold ${
                                b.status === 'cancelled' ? 'line-through' : ''
                              }`}
                            >
                              {b.timeLabel}
                            </span>
                            <span className="truncate text-[11px] font-medium text-foreground/85">
                              {b.patientName}
                            </span>
                            {b.isWalkIn && (
                              <span className="ms-auto shrink-0 rounded-sm bg-blue-soft px-1 py-px text-[9px] font-bold text-blue">
                                {b.token || 'W'}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="block ps-2.5 pe-1.5 pt-1.5">
                            <span className="tabular flex items-center gap-1.5 text-[10px] font-semibold leading-none">
                              <span className={b.status === 'cancelled' ? 'line-through' : ''}>
                                {b.timeLabel}
                              </span>
                              <span className="font-normal text-faint">· {b.durationMins}m</span>
                              {b.isWalkIn && (
                                <span className="rounded-sm bg-blue-soft px-1 py-px text-[9px] font-bold text-blue">
                                  {b.token || 'W'}
                                </span>
                              )}
                            </span>
                            <span
                              className={`mt-1 block truncate text-[12px] leading-tight font-semibold text-foreground/90 ${
                                b.status === 'cancelled' ? 'line-through' : ''
                              }`}
                            >
                              {b.patientName}
                            </span>
                            {b.reason && height > 56 && (
                              <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted-foreground">
                                {b.reason}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* ---- Now line, spanning every column ---- */}
          {nowVisible && (
            <div className="pointer-events-none absolute inset-x-0 z-[6]" style={{ top: nowTop }}>
              <div className="border-t-[1.5px] border-red/80" />
              <span className="now-dot absolute -top-[4px] start-[64px] size-2 rounded-full bg-red" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CancelButton({
  pending,
  onConfirm,
}: {
  pending: boolean
  onConfirm: (reason: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  if (!open) {
    return (
      <button className={btnDanger} onClick={() => setOpen(true)} disabled={pending}>
        Cancel appointment
      </button>
    )
  }
  return (
    <div className="rounded-lg border border-border p-3">
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        Cancellation reason (required)
      </label>
      <input
        className={inputClass}
        value={reason}
        autoFocus
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. patient called to cancel"
      />
      <div className="mt-2.5 flex gap-2">
        <button
          className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-red px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={pending || !reason.trim()}
          onClick={() => onConfirm(reason.trim())}
        >
          {pending && <Spinner className="size-3.5" />}
          {pending ? 'Cancelling…' : 'Confirm cancellation'}
        </button>
        <button className={btnGhost} onClick={() => setOpen(false)}>
          Keep
        </button>
      </div>
    </div>
  )
}

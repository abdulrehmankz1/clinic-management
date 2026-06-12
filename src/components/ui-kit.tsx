// src/components/ui-kit.tsx — Matab core UI primitives (drop-in)
// The ONLY place status colors live. Use these everywhere; delete ad-hoc copies.
// Requires: shadcn's cn() util at '@/lib/utils', lucide-react.

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/* ------------------------------------------------------------------ */
/* StatusBadge — appointment + payment statuses, color always + text  */
/* ------------------------------------------------------------------ */

const STATUS_STYLES: Record<string, string> = {
  // appointments
  scheduled: 'bg-secondary text-primary',
  'checked-in': 'bg-blue-soft text-blue',
  completed: 'bg-green-soft text-green-strong',
  cancelled: 'bg-muted text-muted-foreground',
  'no-show': 'bg-amber-soft text-amber',
  // invoices (v2)
  paid: 'bg-green-soft text-green-strong',
  partial: 'bg-amber-soft text-amber',
  unpaid: 'bg-muted text-muted-foreground',
  voided: 'bg-red-soft text-destructive line-through',
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  'checked-in': 'Checked in',
  completed: 'Completed',
  cancelled: 'Cancelled',
  'no-show': 'No-show',
  paid: 'Paid',
  partial: 'Partial',
  unpaid: 'Unpaid',
  voided: 'Voided',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* KpiCard — dashboard stat. Big tabular number + optional icon tile. */
/* ------------------------------------------------------------------ */

const KPI_TONES = {
  primary: 'bg-secondary text-primary',
  blue: 'bg-blue-soft text-blue',
  amber: 'bg-amber-soft text-amber',
  green: 'bg-green-soft text-green-strong',
} as const

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = 'primary',
}: {
  label: string
  value: string | number
  hint?: string
  icon?: ReactNode
  tone?: keyof typeof KPI_TONES
}) {
  return (
    <div className="card-flat flex items-start justify-between gap-3 p-4 sm:p-5">
      <div className="min-w-0">
        <p className="text-[13px] leading-snug font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 font-display text-[32px] font-semibold leading-none tracking-tight tabular">
          {value}
        </p>
        {hint ? <p className="mt-1.5 text-xs text-faint">{hint}</p> : null}
      </div>
      {icon ? (
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            KPI_TONES[tone],
          )}
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* PageHeader — title (display font) left, primary action right       */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* EmptyState — one sentence + one action. No illustrations/emoji.    */
/* ------------------------------------------------------------------ */

export function EmptyState({
  message,
  action,
}: {
  message: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* AllergyBanner — always visible when a patient has allergies        */
/* ------------------------------------------------------------------ */

export function AllergyBanner({ allergies }: { allergies?: string | null }) {
  if (!allergies?.trim()) return null
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-red-soft px-4 py-3 text-sm text-destructive">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        className="mt-0.5 size-4 shrink-0" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      <p>
        <span className="font-semibold">Allergies:</span> {allergies}
      </p>
    </div>
  )
}

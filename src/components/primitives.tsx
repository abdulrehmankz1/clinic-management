import React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Card as ShadCard } from '@/components/ui/card'
import type { AppointmentStatus } from '@/lib/constants'

// App-level primitives, built on shadcn/ui and the Matab tokens. Screens import
// from here so the design language stays in one place.
//
// Status colors live ONLY in ui-kit.tsx — re-exported here so legacy imports
// keep working while screens migrate.

export { StatusBadge, AllergyBanner } from './ui-kit'

/** Day Rail status bars share the ui-kit palette (strong tones). */
export const STATUS_BAR: Record<AppointmentStatus, string> = {
  scheduled: 'bg-primary',
  'checked-in': 'bg-blue',
  completed: 'bg-green-strong',
  cancelled: 'bg-faint',
  'no-show': 'bg-amber',
}

const ROLE_STYLES: Record<string, string> = {
  owner: 'bg-primary-soft text-primary',
  doctor: 'bg-blue-soft text-blue',
  receptionist: 'bg-muted text-muted-foreground',
  superAdmin: 'bg-primary-soft text-primary',
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize whitespace-nowrap',
        ROLE_STYLES[role] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {role === 'superAdmin' ? 'Super admin' : role}
    </span>
  )
}

// ---- Avatar (initials) ----

const AVATAR_TONES = [
  'bg-primary-soft text-primary',
  'bg-blue-soft text-blue',
  'bg-status-noshow-bg text-amber',
]

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const tone = AVATAR_TONES[(name.charCodeAt(0) + name.length) % AVATAR_TONES.length]
  const dim = size === 'sm' ? 'size-7 text-[10px]' : 'size-9 text-xs'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        tone,
        dim,
      )}
      aria-hidden
    >
      {initials || '•'}
    </span>
  )
}

// ---- Layout primitives ----

/** White surface, hairline border, 12px radius, NO shadow (§3). */
export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <ShadCard className={cn('block gap-0 rounded-lg py-0 shadow-none ring-0 border', className)}>
      {children}
    </ShadCard>
  )
}

export function PageTitle({
  children,
  subtitle,
  action,
}: {
  children: React.ReactNode
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl leading-tight font-semibold">{children}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}

/** KPI: 13px muted label over a 32px Bricolage tabular number. No icons (§ dashboard). */
export function KpiCard({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <Card className="p-4">
      <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
      <div className="tabular mt-1.5 font-display text-[2rem] leading-none font-semibold text-ink">
        {value}
      </div>
      {hint && <div className="mt-1.5 text-xs text-faint">{hint}</div>}
    </Card>
  )
}

/** One sentence + one action. Centered, muted. No illustrations, no emoji (§6). */
export function EmptyState({
  message,
  actionHref,
  actionLabel,
}: {
  message: string
  actionHref?: string
  actionLabel?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="text-sm font-medium text-primary hover:underline">
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

// ---- Spinner — drop inside any pending button ----

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('size-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ---- Button / input class helpers (shadcn variants, usable on <Link>s too) ----

export const btnPrimary = buttonVariants({ variant: 'default' })
export const btnGhost = buttonVariants({ variant: 'outline' })
export const btnDanger = buttonVariants({ variant: 'destructive' })
export const btnIcon = buttonVariants({ variant: 'outline', size: 'icon' })

export const inputClass = cn(
  'h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm transition-colors duration-150 outline-none',
  'placeholder:text-muted-foreground',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
  'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
)

export const textareaClass = cn(
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm transition-colors duration-150 outline-none',
  'placeholder:text-muted-foreground',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
  'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
)

/** Label above input — 13px medium ink, 8px gap (§4). Never placeholder-as-label. */
export function Field({
  label,
  children,
  htmlFor,
  hint,
}: {
  label: string
  children: React.ReactNode
  htmlFor?: string
  hint?: string
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[13px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ---- Table primitives — 44px rows, 12px cell padding, 11px uppercase headers (§4) ----

export function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'h-10 px-3 text-start align-middle text-[11px] font-medium tracking-wide uppercase text-muted-foreground',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn('h-11 px-3 py-1.5 align-middle', className)}>{children}</td>
}

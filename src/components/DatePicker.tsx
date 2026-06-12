'use client'

import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { IconCalendar } from './icons'

/** YYYY-MM-DD ⇄ local Date helpers (date-only, no timezone surprises). */
const toDate = (s: string): Date | undefined => {
  if (!s) return undefined
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const toStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * shadcn Calendar in a Popover with a value/onChange API using YYYY-MM-DD
 * strings — drop-in for native date inputs.
 */
export function DatePicker({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = toDate(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-md border border-input bg-card px-3 text-sm transition-colors duration-150 outline-none',
          'hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          !selected && 'text-muted-foreground',
          className,
        )}
      >
        <IconCalendar size={15} className="shrink-0 text-faint" />
        <span className="tabular truncate">
          {selected
            ? selected.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
            : 'Pick a date'}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (d) onChange(toStr(d))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

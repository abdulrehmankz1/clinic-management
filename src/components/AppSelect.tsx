'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type SelectOption = { value: string; label: string }

/**
 * Thin wrapper over the shadcn Select so forms get polished dropdowns with a
 * native-select-like API (value / onChange / options).
 */
export function AppSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  return (
    <Select
      // `items` lets the trigger render the selected option's LABEL, not its value.
      items={options}
      // null (not undefined) keeps the select in controlled mode when empty.
      value={value || null}
      onValueChange={(v) => onChange((v as string) ?? '')}
      disabled={disabled}
    >
      <SelectTrigger className={cn('h-10 w-full rounded-md', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

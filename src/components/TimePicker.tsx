'use client'

import { AppSelect } from './AppSelect'

const label = (h: number, m: number) => {
  const ampm = h < 12 ? 'am' : 'pm'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}

/**
 * Time slot picker — a dropdown of bookable times (15-minute steps) between the
 * clinic's opening and closing hours. Far friendlier than a native time input.
 */
export function TimePicker({
  value,
  onChange,
  openTime = '09:00',
  closeTime = '21:00',
  stepMins = 15,
  className,
}: {
  value: string
  onChange: (value: string) => void
  openTime?: string
  closeTime?: string
  stepMins?: number
  className?: string
}) {
  const [oh, om] = openTime.split(':').map(Number)
  const [ch, cm] = closeTime.split(':').map(Number)
  const start = (oh || 0) * 60 + (om || 0)
  const end = (ch || 0) * 60 + (cm || 0)

  const options: { value: string; label: string }[] = []
  for (let t = start; t < end; t += stepMins) {
    const h = Math.floor(t / 60)
    const m = t % 60
    options.push({
      value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      label: label(h, m),
    })
  }
  // Keep an out-of-grid value (e.g. from data) selectable rather than blanking it.
  if (value && !options.some((o) => o.value === value)) {
    const [vh, vm] = value.split(':').map(Number)
    options.push({ value, label: label(vh || 0, vm || 0) })
    options.sort((a, b) => a.value.localeCompare(b.value))
  }

  return (
    <AppSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder="Pick a time"
      className={className}
    />
  )
}

// Tiny CSV writer (v4 spec §A.2) — no library needed. RFC-4180 escaping: a field
// containing a comma, quote or newline is wrapped in quotes with inner quotes
// doubled. Patient names like `Khan, "Bobby" Jr.` must round-trip cleanly.

export type CsvValue = string | number | boolean | null | undefined

/** Byte-order mark — keeps Excel from mangling non-ASCII names. */
const BOM = '﻿'

export function csvEscape(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(','))
  return BOM + lines.join('\r\n') + '\r\n'
}

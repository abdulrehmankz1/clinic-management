'use client'

import { btnPrimary, btnGhost } from './primitives'
import { IconPrinter } from './icons'

/** Print / Save-as-PDF — the browser print dialog does the PDF export (no PDF lib). */
export function PrintButton({ label = 'Print / Save as PDF', variant = 'primary' as 'primary' | 'ghost' }) {
  return (
    <button type="button" className={variant === 'primary' ? btnPrimary : btnGhost} onClick={() => window.print()}>
      <IconPrinter size={15} />
      {label}
    </button>
  )
}

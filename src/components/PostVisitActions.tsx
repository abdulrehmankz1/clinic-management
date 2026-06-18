'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { btnPrimary, btnGhost, Spinner } from './primitives'
import { createInvoiceFromVisit } from '@/app/(frontend)/dashboard/invoices/actions'

/** Next-step actions shown after a visit is recorded (server renders this panel). */
export function PostVisitActions({ visitId, patientId }: { visitId: string; patientId: string }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const createInvoice = () => {
    setError(null)
    start(async () => {
      const res = await createInvoiceFromVisit(visitId)
      if (res.ok) {
        router.push(`/dashboard/invoices/${res.data.id}`)
        router.refresh()
      } else setError(res.message)
    })
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button className={btnPrimary} onClick={createInvoice} disabled={busy}>
          {busy && <Spinner />}
          Create invoice
        </button>
        <Link href={`/dashboard/patients/${patientId}`} className={btnGhost}>
          Patient profile
        </Link>
        <Link href="/dashboard/appointments" className={btnGhost}>
          Day view
        </Link>
      </div>
      {error && <p className="mt-4 text-sm text-red">{error}</p>}
    </>
  )
}

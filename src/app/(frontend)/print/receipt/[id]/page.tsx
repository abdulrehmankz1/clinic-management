import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireDashboardSession, getPayloadClient } from '@/lib/auth'
import { getTenantID } from '@/access'
import { PrintButton } from '@/components/PrintButton'
import { formatMoney, formatDateTime } from '@/lib/format'
import type { Invoice, Patient } from '@/payload-types'

const relId = (v: unknown): string =>
  v && typeof v === 'object' && 'id' in (v as Record<string, unknown>) ? String((v as { id: unknown }).id) : String(v)

/**
 * Printable receipt — minimal layout (no app chrome), tuned for @media print so the
 * browser's "Save as PDF" produces a clean A5 document the clinic can share with the
 * patient. No PDF library: print CSS does the job (v2 spec §4.3).
 */
export default async function ReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, tenant } = await requireDashboardSession()
  const payload = await getPayloadClient()
  const tenantID = getTenantID(user)!
  const { id } = await params

  let invoice: Invoice
  try {
    invoice = (await payload.findByID({ collection: 'invoices', id, depth: 1, overrideAccess: false, user })) as Invoice
  } catch {
    notFound()
  }
  if (relId(invoice.tenant) !== String(tenantID)) notFound()

  const ctx = { settings: { currency: invoice.currency } }
  const m = (n?: number | null) => formatMoney(n ?? 0, ctx)
  const patient = invoice.patient as Patient
  const lines = invoice.lineItems ?? []
  const payments = invoice.payments ?? []
  const statusLabel = invoice.voided ? 'VOIDED' : (invoice.paymentStatus ?? 'unpaid').toUpperCase()

  return (
    <main className="mx-auto w-full max-w-[150mm] bg-white px-8 py-10 text-[13px] text-ink print:max-w-none print:p-[12mm]">
      {/* Print page setup: A5, margins handled by the element padding above so the
          on-screen preview and the printed/PDF output match exactly. */}
      <style>{`@page { size: A5; margin: 0; } @media print { html, body { background: #fff; } }`}</style>

      {/* Toolbar — hidden when printing */}
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/invoices/${invoice.id}`} className="text-[13px] font-medium text-muted-foreground hover:text-ink">
          ‹ Back to invoice
        </Link>
        <PrintButton />
      </div>

      {/* Letterhead */}
      <header className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">{tenant?.name}</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {tenant?.address && <>{tenant.address}<br /></>}
            {[tenant?.city, tenant?.country].filter(Boolean).join(', ')}
            {tenant?.phone && <><br />{tenant.phone}</>}
          </p>
        </div>
        <div className="text-end">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Receipt</div>
          <div className="tabular mt-0.5 text-lg font-semibold">{invoice.invoiceNumber}</div>
          <div className="tabular mt-1 text-xs text-muted-foreground">{formatDateTime(invoice.createdAt, ctx)}</div>
        </div>
      </header>

      {/* Bill to */}
      <section className="mt-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bill to</div>
          <div className="mt-0.5 font-medium">{patient?.name}</div>
          <div className="tabular text-xs text-muted-foreground">{patient?.mrn}</div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${invoice.voided ? 'bg-red-soft text-destructive line-through' : invoice.paymentStatus === 'paid' ? 'bg-green-soft text-green-strong' : invoice.paymentStatus === 'partial' ? 'bg-amber-soft text-amber' : 'bg-muted text-muted-foreground'}`}>
          {statusLabel}
        </span>
      </section>

      {/* Line items */}
      <table className="mt-6 w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-y border-border text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="py-2 text-start font-medium">Description</th>
            <th className="py-2 text-end font-medium">Qty</th>
            <th className="py-2 text-end font-medium">Unit</th>
            <th className="py-2 text-end font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((li, i) => (
            <tr key={i} className="border-b border-border/60">
              <td className="py-2">{li.description}</td>
              <td className="tabular py-2 text-end">{li.quantity}</td>
              <td className="tabular py-2 text-end">{m(li.unitAmount)}</td>
              <td className="tabular py-2 text-end font-medium">{m(li.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-4 ms-auto w-56 text-[13px]">
        <div className="flex justify-between py-1"><span className="text-muted-foreground">Total</span><span className="tabular font-semibold">{m(invoice.totalAmount)}</span></div>
        <div className="flex justify-between py-1"><span className="text-muted-foreground">Paid</span><span className="tabular">{m(invoice.amountPaid)}</span></div>
        <div className="flex justify-between border-t border-border py-1.5"><span className="font-semibold">Balance due</span><span className="tabular font-semibold">{m(invoice.balanceDue)}</span></div>
      </div>

      {/* Payments */}
      {payments.length > 0 && (
        <div className="mt-6">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payments</div>
          <ul className="mt-1 text-xs">
            {payments.map((p, i) => (
              <li key={i} className="flex justify-between border-b border-border/50 py-1">
                <span className="capitalize">{(p.method ?? '').replace('-', ' ')}{p.receivedAt ? ` · ${formatDateTime(p.receivedAt, ctx)}` : ''}</span>
                <span className="tabular">{m(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {invoice.voided && invoice.voidReason && (
        <p className="mt-4 text-xs text-destructive">Voided: {invoice.voidReason}</p>
      )}

      <footer className="mt-10 border-t border-border pt-3 text-center text-[10px] text-faint">
        Generated by Matab · This is a computer-generated receipt.
      </footer>
    </main>
  )
}

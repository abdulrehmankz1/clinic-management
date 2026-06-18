import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireDashboardSession, getPayloadClient } from '@/lib/auth'
import { getTenantID } from '@/access'
import { PrintButton } from '@/components/PrintButton'
import { formatDate, formatDateTime, ageFromDOB } from '@/lib/format'
import { PRESCRIPTION_FREQUENCIES } from '@/lib/constants'
import type { Patient, User, Visit } from '@/payload-types'

const relId = (v: unknown): string =>
  v && typeof v === 'object' && 'id' in (v as Record<string, unknown>) ? String((v as { id: unknown }).id) : String(v)

const FREQ_LABEL: Record<string, string> = Object.fromEntries(
  PRESCRIPTION_FREQUENCIES.map((f) => [f.value, f.value.toUpperCase()]),
)

/** Printable A5 prescription (Rx). Browser print-to-PDF — no PDF library (v2 spec §4.3). */
export default async function PrescriptionPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, tenant } = await requireDashboardSession()
  const payload = await getPayloadClient()
  const tenantID = getTenantID(user)!
  const { id } = await params

  let visit: Visit
  try {
    visit = (await payload.findByID({ collection: 'visits', id, depth: 1, overrideAccess: false, user })) as Visit
  } catch {
    notFound()
  }
  if (relId(visit.tenant) !== String(tenantID)) notFound()

  const patient = visit.patient as Patient
  const doctor = visit.doctor as User
  const rx = visit.prescription ?? []
  const v = visit.vitals
  const age = patient?.ageYears ?? (patient?.dateOfBirth ? ageFromDOB(patient.dateOfBirth) : null)
  const vitalsLine = [
    v?.bpSystolic && v?.bpDiastolic ? `BP ${v.bpSystolic}/${v.bpDiastolic}` : null,
    v?.temperatureC ? `Temp ${v.temperatureC}°C` : null,
    v?.pulse ? `Pulse ${v.pulse}` : null,
    v?.weightKg ? `Wt ${v.weightKg}kg` : null,
  ].filter(Boolean).join('  ·  ')

  return (
    <main className="mx-auto w-full max-w-[150mm] bg-white px-8 py-10 text-[13px] text-ink print:max-w-none print:p-[12mm]">
      <style>{`@page { size: A5; margin: 0; } @media print { html, body { background: #fff; } }`}</style>

      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/patients/${relId(patient)}`} className="text-[13px] font-medium text-muted-foreground hover:text-ink">
          ‹ Back to patient
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
          <div className="font-medium">{doctor?.name}</div>
          {(doctor as { specialty?: string })?.specialty && (
            <div className="text-xs text-muted-foreground">{(doctor as { specialty?: string }).specialty}</div>
          )}
          <div className="tabular mt-1 text-xs text-muted-foreground">{formatDate(visit.visitDate, tenant)}</div>
        </div>
      </header>

      {/* Patient */}
      <section className="mt-4 flex items-start justify-between gap-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Patient</span>
          <div className="mt-0.5 font-medium">
            {patient?.name}
            <span className="ms-2 font-normal text-muted-foreground">
              {patient?.mrn}{age != null ? ` · ${age}y` : ''}{patient?.gender ? ` · ${patient.gender}` : ''}
            </span>
          </div>
        </div>
      </section>

      {vitalsLine && (
        <p className="tabular mt-3 rounded-md bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">{vitalsLine}</p>
      )}
      {visit.diagnosis && (
        <p className="mt-3 text-[13px]"><span className="font-semibold">Diagnosis:</span> {visit.diagnosis}</p>
      )}

      {/* Rx */}
      <div className="mt-5">
        <div className="mb-1 font-display text-2xl font-semibold text-primary">℞</div>
        {rx.length === 0 ? (
          <p className="text-sm text-muted-foreground">No medicines prescribed.</p>
        ) : (
          <ol className="space-y-2.5">
            {rx.map((r, i) => (
              <li key={i} className="border-b border-border/50 pb-2">
                <div className="font-medium">
                  {i + 1}. {r.medicine}
                  {r.dosage ? <span className="font-normal text-muted-foreground"> — {r.dosage}</span> : null}
                </div>
                <div className="ms-4 text-xs text-muted-foreground">
                  {[
                    r.frequency ? FREQ_LABEL[r.frequency] ?? r.frequency : null,
                    r.durationDays ? `for ${r.durationDays} day${r.durationDays === 1 ? '' : 's'}` : null,
                    r.instructions || null,
                    r.frequency === 'other' ? r.frequencyNote : null,
                  ].filter(Boolean).join('  ·  ')}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {visit.followUpDate && (
        <p className="mt-5 text-[13px]"><span className="font-semibold">Follow-up:</span> {formatDate(visit.followUpDate, tenant)}</p>
      )}

      <footer className="mt-10 border-t border-border pt-3 text-center text-[10px] text-faint">
        Generated by Matab · {formatDateTime(visit.visitDate, tenant)}
      </footer>
    </main>
  )
}

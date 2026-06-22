'use client'

// 14-day revenue chart — payments-based, one bar per day. Same hand-rolled flex
// bars as the activity BarChart, but values are money and formatted in the
// clinic's currency (no chart lib, deterministic render, hover tooltips).

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('en')}`
  }
}

export function RevenueChart({
  data,
  currency,
}: {
  data: { label: string; amount: number }[]
  currency: string
}) {
  const max = Math.max(1, ...data.map((d) => d.amount))
  const total = data.reduce((s, d) => s + d.amount, 0)

  return (
    <div>
      <div className="relative h-64">
        {/* quarter gridlines */}
        {[0, 25, 50, 75].map((p) => (
          <div
            key={p}
            className="absolute inset-x-0 border-t border-dashed border-border/70"
            style={{ bottom: `${p}%` }}
          >
            {p > 0 && (
              <span className="tabular absolute -top-2 end-0 text-[10px] text-faint">
                {fmt(Math.round((max * p) / 100), currency)}
              </span>
            )}
          </div>
        ))}

        <div className="absolute inset-0 flex items-end gap-[6px] sm:gap-2">
          {data.map((d, i) => {
            const isLast = i === data.length - 1
            const h = d.amount === 0 ? 0 : Math.max(4, (d.amount / max) * 100)
            return (
              <div key={`${d.label}-${i}`} className="group relative flex h-full flex-1 items-end">
                {/* hover tooltip */}
                <div className="pointer-events-none invisible absolute -top-1 start-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-card px-2.5 py-1.5 text-center opacity-0 shadow-[var(--shadow-overlay)] transition-opacity duration-100 group-hover:visible group-hover:opacity-100">
                  <div className="tabular text-sm font-semibold leading-none">
                    {fmt(d.amount, currency)}
                  </div>
                  <div className="mt-1 text-[10px] whitespace-nowrap text-muted-foreground">
                    {d.label}
                  </div>
                </div>
                {/* hover hit-area wash */}
                <div className="absolute inset-y-0 -inset-x-[3px] rounded-md transition-colors group-hover:bg-secondary/50" />
                <div
                  className={`relative w-full rounded-t-[5px] transition-colors duration-150 ${
                    isLast
                      ? 'bg-primary'
                      : d.amount === 0
                        ? 'bg-transparent'
                        : 'bg-primary/30 group-hover:bg-primary/55'
                  }`}
                  style={{ height: `${h}%` }}
                />
                {/* zero-day baseline tick */}
                {d.amount === 0 && (
                  <div className="absolute inset-x-[20%] bottom-0 h-[3px] rounded-full bg-border" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* x-axis labels */}
      <div className="mt-2 flex gap-[6px] border-t border-border pt-2 sm:gap-2">
        {data.map((d, i) => (
          <span
            key={`${d.label}-${i}`}
            className={`tabular flex-1 text-center text-[10px] ${
              i === data.length - 1 ? 'font-semibold text-primary' : 'text-faint'
            }`}
          >
            {d.label.split(' ')[0]}
          </span>
        ))}
      </div>

      <p className="mt-3 text-xs text-faint">{fmt(total, currency)} collected in the last 14 days</p>
    </div>
  )
}

import Link from 'next/link'
import Image from 'next/image'
import { btnPrimary, btnGhost } from '@/components/primitives'
import {
  IconCalendar,
  IconUsers,
  IconClock,
  IconArrowRight,
  IconCheck,
  IconStethoscope,
  IconBuilding,
  IconStaff,
  IconUserPlus,
  IconCalendarCheck,
} from '@/components/icons'

const STEPS = [
  {
    n: '01',
    icon: IconUserPlus,
    title: 'Register the patient',
    body: 'Name and phone is enough. An MRN is assigned automatically and their history starts building.',
  },
  {
    n: '02',
    icon: IconCalendar,
    title: 'Book a slot — or take a walk-in',
    body: 'Pick a doctor who is actually free at that time. Walk-ins get a queue token like T-03 instantly.',
  },
  {
    n: '03',
    icon: IconCalendarCheck,
    title: 'Run the day from one screen',
    body: 'Check in, complete, or mark no-shows with one tap. The whole clinic sees the same live list.',
  },
]

const FEATURES = [
  {
    icon: IconCalendar,
    title: 'Live day view per doctor',
    body: 'A simple queue list for the front desk, a timeline for the manager — same data, zero training.',
  },
  {
    icon: IconClock,
    title: 'Double-bookings, impossible',
    body: 'Overlaps are checked inside a database transaction. Two calls, one slot, one winner.',
  },
  {
    icon: IconUsers,
    title: 'Patient history that stays',
    body: 'Every patient gets a profile, an MRN, allergies front-and-centre, and a full visit log.',
  },
  {
    icon: IconStethoscope,
    title: 'Real doctor schedules',
    body: 'Daily windows, specific weekdays, on-call, or by-appointment — booking respects all of them.',
  },
  {
    icon: IconStaff,
    title: 'Roles that match a clinic',
    body: 'Owner, receptionist, doctor — each sees exactly what their job needs, nothing more.',
  },
  {
    icon: IconBuilding,
    title: 'Many clinics, one platform',
    body: 'Each clinic is fully isolated with its own currency, timezone and working hours.',
  },
]

const DEMO_LOGINS = [
  {
    label: 'Receptionist',
    clinic: 'City Care Clinic',
    email: 'reception@city.app',
    blurb: 'Book, check in, take walk-ins',
    icon: IconUsers,
  },
  {
    label: 'Owner',
    clinic: 'City Care Clinic',
    email: 'owner@city.app',
    blurb: 'Dashboard, staff & settings',
    icon: IconBuilding,
  },
  {
    label: 'Super Admin',
    clinic: 'Platform',
    email: 'super@clinic.app',
    blurb: "All clinics, bird's-eye view",
    icon: IconStethoscope,
  },
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-canvas">
      {/* ---------------- Nav ---------------- */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="size-3.5" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
              </svg>
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-primary">matab</span>
          </span>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#how" className="hidden px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-ink md:block">
              How it works
            </a>
            <a href="#features" className="hidden px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-ink md:block">
              Features
            </a>
            <a href="#demo" className="hidden px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-ink sm:block">
              Demo
            </a>
            <Link href="/login" className={btnGhost}>
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 60% 55% at 75% 0%, rgb(13 110 96 / 0.09), transparent), radial-gradient(rgb(24 35 32 / 0.05) 1px, transparent 1px)',
            backgroundSize: 'auto, 28px 28px',
          }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pt-14 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:pt-20">
          {/* Copy */}
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-secondary px-3 py-1 text-xs font-medium text-primary">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
              </span>
              Built for small clinics — starting with Pakistan
            </span>
            <h1 className="mt-6 max-w-xl font-display text-[2.6rem] leading-[1.06] font-semibold sm:text-[3.6rem]">
              Run your clinic&rsquo;s day,
              <br />
              <span className="relative inline-block text-primary">
                not its paperwork.
                <svg
                  viewBox="0 0 220 10"
                  className="absolute -bottom-2 start-0 w-full text-primary/30"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <path d="M2 8c40-5 140-7 216-3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                </svg>
              </span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
              Appointments, walk-in tokens, patient records and staff — one calm screen your
              front desk understands on day one.
            </p>
            <p className="mt-2 text-sm italic text-faint">Aapka clinic, organized.</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#demo" className={btnPrimary}>
                Try the live demo
                <IconArrowRight size={15} />
              </a>
              <Link href="/login" className={btnGhost}>
                Sign in
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
              {['No double-bookings', 'Walk-in queue tokens', 'Multi-clinic & multi-currency'].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <IconCheck size={13} strokeWidth={2.5} className="text-primary" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Photo + floating product cards */}
          <div className="relative animate-fade-up [animation-delay:80ms]">
            <div className="relative mx-auto aspect-[4/4.4] max-w-[440px] overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-[0_30px_70px_-30px_rgb(13_110_96/0.45)]">
              <Image
                src="/images/hero-doctor2.jpg"
                alt="Doctor at a small clinic"
                fill
                priority
                sizes="(min-width: 1024px) 440px, 90vw"
                className="object-cover object-[60%_20%]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-sidebar/45 via-transparent to-transparent" />
            </div>

            {/* floating: doctor schedule chip */}
            <div className="absolute -start-2 top-8 w-[200px] rounded-xl border border-border bg-card/95 p-3 shadow-[0_14px_36px_-14px_rgb(24_35_32/0.35)] backdrop-blur sm:-start-6">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-primary">
                  HS
                </span>
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-[12px] font-semibold">Dr. Hira Saleem</div>
                  <div className="tabular mt-0.5 text-[10px] text-muted-foreground">
                    11 am – 1 pm · 4 booked
                  </div>
                </div>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-2/3 rounded-full bg-primary" />
              </div>
            </div>

            {/* floating: live appointment card */}
            <div className="absolute -end-2 bottom-10 w-[224px] rounded-xl border border-border bg-card/95 p-3 shadow-[0_14px_36px_-14px_rgb(24_35_32/0.35)] backdrop-blur sm:-end-5">
              <div className="flex items-center justify-between gap-2">
                <span className="tabular text-[12px] font-bold">11:20 am</span>
                <span className="rounded bg-blue-soft px-1.5 py-0.5 text-[10px] font-bold text-blue">T-03</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-blue-soft text-[10px] font-semibold text-blue">
                  BT
                </span>
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-[12px] font-semibold">Bilqis Tariq</div>
                  <div className="truncate text-[10px] text-muted-foreground">Fever · walk-in</div>
                </div>
              </div>
              <button className="mt-2.5 w-full cursor-default rounded-lg bg-primary py-1.5 text-[11px] font-semibold text-white">
                Check in
              </button>
            </div>

            {/* floating: guard chip */}
            <div className="absolute end-6 -top-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11px] font-semibold text-green-strong shadow-[0_10px_26px_-12px_rgb(24_35_32/0.3)] backdrop-blur">
              <IconCheck size={12} strokeWidth={3} />
              Slot conflict blocked
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Demo stats strip ---------------- */}
      <section className="border-y border-border/70 bg-card">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-border/70 px-6 sm:grid-cols-4">
          {[
            { v: '3', l: 'clinics in the demo' },
            { v: '7', l: 'doctors with real rotas' },
            { v: '60', l: 'registered patients' },
            { v: '200+', l: 'appointments seeded' },
          ].map((s) => (
            <div key={s.l} className="px-4 py-6 text-center sm:py-7">
              <div className="tabular font-display text-2xl font-semibold text-primary sm:text-3xl">{s.v}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
        <div className="mx-auto max-w-xl text-center">
          <span className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">How it works</span>
          <h2 className="mt-3 font-display text-3xl font-semibold">
            A patient visit, in three taps
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Designed for the busiest seat in the clinic — the front desk. If you can use a phone,
            you can run matab.
          </p>
        </div>
        <div className="relative mt-12 grid gap-5 md:grid-cols-3">
          {/* connecting line */}
          <div className="pointer-events-none absolute inset-x-16 top-[2.4rem] hidden border-t-2 border-dashed border-border md:block" />
          {STEPS.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.n} className="card-flat relative p-6 pt-7">
                <div className="flex items-center gap-3">
                  <span className="relative flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary ring-4 ring-canvas">
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  <span className="tabular font-display text-sm font-semibold text-faint">{s.n}</span>
                </div>
                <h3 className="mt-4 text-[16px] font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ---------------- Product shot ---------------- */}
      <section className="relative overflow-hidden bg-sidebar py-20">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 50% 40% at 50% 0%, rgb(58 214 187 / 0.10), transparent), linear-gradient(rgb(255 255 255 / 0.03) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.03) 1px, transparent 1px)',
            backgroundSize: 'auto, 44px 44px, 44px 44px',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-xl text-center">
            <span className="text-xs font-semibold tracking-[0.14em] text-sidebar-accent uppercase">
              The day view
            </span>
            <h2 className="mt-3 font-display text-3xl font-semibold text-sidebar-active-fg">
              Every doctor&rsquo;s day on one screen
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-sidebar-foreground">
              A queue list the receptionist reads top-to-bottom, and a timeline that shows gaps,
              walk-ins and conflicts at a glance.
            </p>
          </div>
          <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-sidebar-soft shadow-[0_40px_90px_-40px_rgb(0_0_0/0.7)]">
            {/* browser chrome */}
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="ms-3 hidden rounded-md bg-white/5 px-3 py-1 text-[11px] text-sidebar-foreground sm:block">
                matab.app/dashboard/appointments
              </span>
            </div>
            {/* product screenshot (captured from the real app) */}
            <Image
              src="/images/product-day-view.png"
              alt="matab appointments day view"
              width={1600}
              height={950}
              className="block w-full"
            />
          </div>
        </div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
        <div className="mx-auto max-w-xl text-center">
          <span className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Features</span>
          <h2 className="mt-3 font-display text-3xl font-semibold">
            Small clinic. Serious software.
          </h2>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <div
                key={f.title}
                className="group card-flat p-6 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-16px_rgb(24_35_32/0.22)]"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 text-[15px] font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ---------------- Demo accounts ---------------- */}
      <section id="demo" className="mx-auto max-w-6xl scroll-mt-20 px-6 pb-20">
        <div className="card-flat overflow-hidden">
          <div className="grid items-center gap-8 p-8 sm:p-10 lg:grid-cols-[1fr_1.3fr]">
            <div>
              <span className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Live demo</span>
              <h2 className="mt-3 font-display text-3xl font-semibold">Walk in as any role</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                Every account uses the password{' '}
                <code className="rounded-md border border-border bg-canvas px-1.5 py-0.5 text-[13px] font-semibold">
                  password123
                </code>
                . Sign in as two different clinics and notice each sees completely different data —
                that&rsquo;s the tenant wall.
              </p>
            </div>
            <div className="grid gap-3">
              {DEMO_LOGINS.map((d) => {
                const Icon = d.icon
                return (
                  <Link
                    key={d.email}
                    href={`/login?email=${encodeURIComponent(d.email)}`}
                    className="group flex items-center gap-4 rounded-xl border border-border bg-canvas/60 px-5 py-4 transition-all hover:border-primary/40 hover:bg-secondary/40"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                      <Icon size={17} strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold group-hover:text-primary">
                        {d.label}
                        <span className="ms-2 text-xs font-normal text-faint">{d.clinic}</span>
                      </span>
                      <span className="block text-xs text-muted-foreground">{d.blurb}</span>
                      <span className="tabular mt-0.5 block text-xs text-faint">{d.email}</span>
                    </span>
                    <IconArrowRight
                      size={16}
                      className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    />
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t border-border/70 bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-xs text-faint">
          <span className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded bg-primary text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
              </svg>
            </span>
            <span className="font-display text-sm font-semibold text-primary/80">matab</span>
          </span>
          <span>
            Portfolio project · Built with Payload CMS, Next.js &amp; MongoDB · Multi-tenant by
            design · Photos: Unsplash
          </span>
        </div>
      </footer>
    </main>
  )
}

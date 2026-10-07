import Link from "next/link";
import { ThemeToggle } from "@/components/ui";
import { ScrollSpyNav } from "@/components/scroll-spy-nav";
import { RoleTabs } from "@/components/role-tabs";
import {
  Users,
  BellRing,
  ArrowRight,
  Play,
  CalendarClock,
  FileCheck2,
  UploadCloud,
  PenLine,
  BarChart3,
  Lock,
  Zap,
  CheckCircle2,
  Clock3,
  Sparkles,
  ChevronRight,
} from "lucide-react";

const stats = [
  { v: "12,400+", l: "Filings tracked" },
  { v: "99.2%", l: "On-time rate" },
  { v: "3.1hrs", l: "Saved weekly / employee" },
  { v: "4.9/5", l: "Client satisfaction" },
];

const features = [
  {
    icon: <CalendarClock size={20} />,
    t: "Automated deadline engine",
    d: "VAT, Corp Tax and Payroll templates auto-generate next-period filings with owners and reminders. No spreadsheet babysitting.",
  },
  {
    icon: <UploadCloud size={20} />,
    t: "Client portal that clients actually use",
    d: "Magic upload links, document checklists and plain-language status. Clients see what's needed, what's done, what's next.",
  },
  {
    icon: <PenLine size={20} />,
    t: "E-sign & approvals built-in",
    d: "Request signatures on returns and engagement letters, track views and completions without a third-party tool.",
  },
  {
    icon: <Users size={20} />,
    t: "Team workload at a glance",
    d: "See who owns what, what's overdue and who's overloaded. Reassign in one click before deadlines slip.",
  },
  {
    icon: <FileCheck2 size={20} />,
    t: "Smart documents",
    d: "Versioned files per filing, OCR-ready uploads and one-click exports for audits and handovers.",
  },
  {
    icon: <BarChart3 size={20} />,
    t: "Reports your partners will love",
    d: "Firm-wide completion, overdue heatmaps and per-client histories — exportable for reviews in seconds.",
  },
];

const steps = [
  {
    n: "01",
    t: "Onboard clients in minutes",
    d: "Import your client list, assign owners and send portal invites. Clients upload past returns and ID docs from their phone.",
  },
  {
    n: "02",
    t: "Deadlines generate themselves",
    d: "Pick a jurisdiction template once. TaxDesk creates every VAT, payroll and corp-tax deadline for the year ahead.",
  },
  {
    n: "03",
    t: "Track, nudge & file on time",
    d: "Kanban tasks, auto-reminders and e-sign close the loop. Dashboards show exactly what's left before month-end.",
  },
];

const testimonials = [
  {
    q: "We went from 4 spreadsheets and a WhatsApp group to one dashboard. March year-end was the calmest we've ever had.",
    n: "Amira K.",
    r: "Managing Partner, 128 clients",
  },
  {
    q: "Clients upload 3x faster since the portal. The checklist tells them exactly what we need — no more email ping-pong.",
    n: "Daniel O.",
    r: "Senior Associate",
  },
  {
    q: "Auto VAT generation alone saves us ~12 hours a month. Overdues dropped to near zero in the first quarter.",
    n: "Priya S.",
    r: "Practice Manager",
  },
];

const faqs = [
  {
    q: "Do my clients need to install anything?",
    a: "No. Clients get a secure web portal link that works on phone or desktop. They can upload, message and e-sign without an install or training session.",
  },
  {
    q: "How does the deadline automation work?",
    a: "You choose a template (e.g. UK VAT Quarterly, US Corp Tax Annual). TaxDesk generates all future filings, assigns the client owner, sets due dates and schedules reminders. When one period is filed, the next is queued automatically.",
  },
  {
    q: "Can I control what employees and clients see?",
    a: "Yes. Admins see everything, employees only see assigned clients and tasks, and clients only see their own filings, documents and messages. Every approval is gated by role.",
  },
  {
    q: "Is my firm's data secure?",
    a: "Data is encrypted in transit and at rest, isolated by role-based access, and every approval, upload and status change is logged. You can export everything at any time.",
  },
  {
    q: "How long does onboarding take?",
    a: "Most firms import clients and send invites in under an hour. Templates for VAT, payroll and corp tax are pre-built — you just pick jurisdictions and go.",
  },
];

export default function LandingPage() {
  return (
    <div id="top" className="landing-page min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* Nav */}
      <div className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
        <header
          className="lp-nav mx-auto flex h-[68px] max-w-7xl select-none items-center gap-3 rounded-2xl border px-3 pl-4 shadow-xl backdrop-blur-xl sm:gap-4 sm:px-4"
          style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 82%, transparent)", boxShadow: "0 12px 40px rgba(15,23,42,.12)" }}
        >
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl text-base font-extrabold text-white" style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED 70%,#0EA5E9 130%)", boxShadow: "0 8px 22px rgba(37,99,235,.45)" }}>
              T
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 bg-emerald-400" style={{ borderColor: "var(--surface)" }} />
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-extrabold tracking-tight">TaxDesk</span>
              <span className="block text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--text-2)" }}>FilePilot OS</span>
            </span>
          </Link>
          <ScrollSpyNav />
          {/* Mobile links */}
          <ScrollSpyNav mobile />
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
            <ThemeToggle />
            <Link href="/login" className="hidden rounded-xl px-3.5 py-2.5 text-[13px] font-bold transition-colors hover:text-[#2563EB] sm:block">
              Log in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-xl sm:px-5"
              style={{ background: "linear-gradient(120deg,#2563EB,#6D28D9)", boxShadow: "0 8px 22px rgba(37,99,235,.4)" }}
            >
              Get Started <ArrowRight size={14} />
            </Link>
          </div>
        </header>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="lp-hero-orb-1 absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgba(37,99,235,.22), transparent)" }}
          />
          <div
            className="lp-hero-orb-2 absolute -left-24 top-40 h-72 w-72 rounded-full opacity-50 blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgba(16,185,129,.18), transparent)" }}
          />
          <div
            className="lp-hero-orb-3 absolute -right-24 top-24 h-72 w-72 rounded-full opacity-50 blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgba(168,85,247,.18), transparent)" }}
          />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 pb-16 pt-20 text-center md:pt-28">
          <Link
            href="#product"
            className="group inline-flex items-center rounded-full p-[1.5px] text-xs font-semibold transition-all hover:-translate-y-0.5"
            style={{ background: "linear-gradient(100deg,#2563EB,#7C3AED,#0EA5E9)", boxShadow: "0 6px 24px rgba(37,99,235,.25)" }}
          >
            <span
              className="inline-flex items-center gap-2 rounded-full px-4 py-2"
              style={{ background: "var(--surface)" }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <Sparkles size={13} className="text-[#7C3AED]" />
              <span style={{ color: "var(--text)" }}>Auto VAT generation + built-in e-sign is live</span>
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" style={{ color: "var(--text-2)" }} />
            </span>
          </Link>

          <h1 className="mx-auto mt-8 max-w-5xl text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl md:text-7xl lg:text-[80px]" style={{ textWrap: "balance" }}>
            Filings, deadlines, clients
            <br />
            <span
              className="lp-gradient-text"
              style={{
                backgroundImage: "linear-gradient(100deg,#2563EB 10%,#7C3AED 55%,#0EA5E9 90%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                WebkitTextFillColor: "transparent",
              }}
            >
              — one calm workspace.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed md:text-lg" style={{ color: "var(--text-2)" }}>
            TaxDesk gives admins firm-wide visibility, employees a focused task workspace, and clients a simple
            portal to upload, sign, and track — so tax season feels like any other week.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary inline-flex w-full items-center justify-center gap-2 px-9 py-4 text-base sm:w-auto">
              Start free today <ArrowRight size={18} />
            </Link>
            <Link href="#how" className="btn-ghost inline-flex w-full items-center justify-center gap-2 px-9 py-4 text-base sm:w-auto" style={{ background: "var(--surface)" }}>
              <Play size={17} /> See it in action
            </Link>
          </div>
          <p className="mt-5 text-sm" style={{ color: "var(--text-2)" }}>
            Free to start · No credit card · Onboard your first client in minutes
          </p>

          {/* Stats */}
          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.l} className="lp-stat rounded-2xl border px-6 py-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <p className="tnum text-2xl font-extrabold md:text-[28px]">{s.v}</p>
                <p className="mt-1.5 text-[13px]" style={{ color: "var(--text-2)" }}>{s.l}</p>
              </div>
            ))}
          </div>

          {/* Live activity ticker */}
          <div className="mx-auto mt-5 flex max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] font-semibold">
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live this week
            </span>
            {["214 filings auto-created", "38 documents e-signed", "0 deadlines missed"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
                <CheckCircle2 size={13} className="text-emerald-600" /> {t}
              </span>
            ))}
          </div>

          {/* Hero visual */}
          <div className="relative mx-auto mt-14 max-w-6xl">
            <div
              aria-hidden
              className="lp-mock-glow absolute -inset-6 rounded-[28px] opacity-70 blur-2xl"
              style={{ background: "linear-gradient(135deg, rgba(37,99,235,.18), rgba(124,58,237,.14), rgba(14,165,233,.16))" }}
            />
            <div className="lp-mock relative overflow-hidden rounded-2xl border text-left" style={{ borderColor: "var(--border)", background: "var(--surface)", boxShadow: "0 24px 80px rgba(15,23,42,.16)" }}>
              <div className="flex items-center gap-1.5 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
                <span className="h-2.5 w-2.5 rounded-full bg-[#F87171]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#FBBF24]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#38BDF8]" />
                <span className="ml-3 rounded-md px-3 py-1 font-mono text-xs" style={{ background: "var(--bg)", color: "var(--text-2)" }}>
                  app.taxdesk.io/admin/dashboard
                </span>
                <span className="ml-auto hidden items-center gap-1.5 text-xs font-semibold text-emerald-600 sm:inline-flex">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Live sync
                </span>
              </div>
              <div className="grid gap-5 p-6 md:grid-cols-[1.4fr_.9fr] md:p-8">
                <div>
                  <div className="relative overflow-hidden rounded-xl p-6 text-white md:p-7" style={{ background: "linear-gradient(135deg,#2563EB 0%,#1D4ED8 55%,#1E1B4B 130%)" }}>
                    <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
                    <p className="text-[15px] opacity-80">Good morning, Amira ☀️</p>
                    <p className="mt-1.5 text-2xl font-bold md:text-[26px]">Firm overview · 128 active clients</p>
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-white/80">
                      <span>34 due this month</span>
                      <span aria-hidden className="opacity-50">·</span>
                      <span>2 overdue</span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[
                      ["Active clients", "128"],
                      ["Due this month", "34"],
                      ["Pending VAT", "12"],
                      ["Done Q3", "96"],
                    ].map(([l, v]) => (
                      <div key={l} className="lp-kpi rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                        <p className="eyebrow">{l}</p>
                        <p className="tnum mt-1 text-2xl font-bold">{v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="lp-track mt-3 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                    <p className="eyebrow mb-1">Deadline tracker</p>
                    {[
                      ["Acme Ltd · VAT Q3", "Due in 3d"],
                      ["Bright Co · Corp Tax", "Due in 6d"],
                      ["North LLC · Payroll", "2d overdue"],
                    ].map(([a, b]) => (
                      <div key={a as string} className="flex items-center justify-between border-t py-2.5 text-sm first:border-0" style={{ borderColor: "var(--border)" }}>
                        <span className="font-medium">{a as string}</span>
                        <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>{b as string}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="lp-side rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                    <p className="flex items-center gap-2 text-xs font-semibold"><BellRing size={14} className="text-[#2563EB]" /> Auto-reminders sent</p>
                    <p className="mt-2 text-sm font-medium">“Hi Sarah, VAT Q3 docs due Friday — upload here →”</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>Opened · 2m ago · Replied with 3 files</p>
                    <div className="mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                      <CheckCircle2 size={14} className="text-emerald-600" /> 3 docs received
                    </div>
                  </div>
                  <div className="lp-side rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                    <p className="flex items-center gap-2 text-xs font-semibold"><PenLine size={14} className="text-[#7C3AED]" /> E-sign completed</p>
                    <p className="mt-2 text-sm font-medium">Corp Tax return · Bright Co</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                      <div className="h-full w-full rounded-full" style={{ background: "linear-gradient(90deg,#2563EB,#7C3AED)" }} />
                    </div>
                    <p className="mt-1.5 text-xs font-semibold text-emerald-600">Signed by both directors ✓</p>
                  </div>
                  <div className="rounded-xl p-4 text-white" style={{ background: "linear-gradient(135deg,#0F172A,#1E40AF)" }}>
                    <p className="flex items-center gap-2 text-xs font-semibold opacity-90"><Zap size={14} /> Next auto-filing</p>
                    <p className="mt-1.5 text-sm font-bold">VAT Q4 generates Oct 1</p>
                    <p className="text-xs opacity-70">12 clients · owners pre-assigned</p>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <p className="mt-10 text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-2)" }}>
            Trusted by independent tax firms & bookkeepers
          </p>
          <div className="mx-auto mt-5 flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-2 text-base font-bold opacity-60">
            {["Acme Tax Co.", "BrightBooks", "North & Lee", "Ledgerline", "Pivot Tax"].map((b) => (
              <span key={b} className="tracking-tight">◆ {b}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section id="product" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-20 md:py-24">
        <p className="eyebrow text-center">One platform · three workspaces</p>
        <h2 className="mx-auto mt-4 max-w-3xl text-center text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
          Built for every seat in your firm
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-[15px] leading-relaxed md:text-base" style={{ color: "var(--text-2)" }}>
          No more forwarding emails or chasing folders. Everyone sees exactly what they need — nothing they don&rsquo;t.
        </p>
        <RoleTabs />
      </section>

      {/* Features grid */}
      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="lp-panel rounded-[32px] border p-8 md:p-14" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="eyebrow">Everything to run tax season</p>
              <h2 className="mt-3 max-w-2xl text-2xl font-extrabold tracking-tight sm:text-3xl md:text-4xl">Stop stitching tools together. TaxDesk does it all.</h2>
            </div>
            <Link href="/signup" className="btn-primary inline-flex shrink-0 items-center gap-2 px-6 py-3 text-[15px]">Explore the workspace <ArrowRight size={16} /></Link>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.t} className="lp-feature group rounded-2xl border p-6 transition-all hover:-translate-y-1 hover:shadow-xl" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-110" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>{f.icon}</div>
                <h3 className="mt-4 text-base font-bold md:text-[17px]">{f.t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--text-2)" }}>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-20 md:py-24">
        <p className="eyebrow text-center">How it works</p>
        <h2 className="mx-auto mt-4 max-w-3xl text-center text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">From chaos to calm in three steps</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.n} className="lp-step relative overflow-hidden rounded-3xl border p-7 md:p-8" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <span className="tnum text-6xl font-extrabold opacity-10">{s.n}</span>
              <h3 className="mt-3 text-lg font-bold">{s.t}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed" style={{ color: "var(--text-2)" }}>{s.d}</p>
              {i < 2 && <ChevronRight size={18} className="absolute right-4 top-6 hidden opacity-30 md:block" />}
            </div>
          ))}
        </div>

        {/* Automation highlight */}
        <div className="card lp-panel mt-6 grid gap-10 overflow-hidden p-8 md:grid-cols-2 md:p-14">
          <div>
            <p className="eyebrow flex items-center gap-2"><Zap size={14} className="text-[#2563EB]" /> Automated deadline engine</p>
            <h2 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl md:text-4xl">Tax-rule templates that generate the next period for you.</h2>
            <p className="mt-4 text-[15px] leading-relaxed md:text-base" style={{ color: "var(--text-2)" }}>
              Define VAT, corporate tax and payroll recurrences once per jurisdiction. TaxDesk auto-creates
              next-period filings, assigns owners, and fires reminders — no spreadsheet babysitting.
            </p>
            <ul className="mt-6 space-y-2.5 text-[15px] font-medium">
              {["Pre-built UK, US & EU templates", "Auto owner assignment", "Smart reminders by email + portal"].map((x) => (
                <li key={x} className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" /> {x}</li>
              ))}
            </ul>
            <Link href="/signup" className="btn-primary mt-8 inline-flex px-6 py-3 text-[15px]">Try templates free</Link>
          </div>
          <div className="lp-side rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <p className="eyebrow mb-3 flex items-center gap-2"><Clock3 size={14} /> Upcoming auto-generated</p>
            <div className="space-y-2">
              {[
                ["VAT Q4 · auto", "Generates Oct 1", "12 clients"],
                ["Corp Tax 2026 · auto", "Generates Jan 15", "34 clients"],
                ["Payroll Sep · auto", "Generates Sep 30", "58 clients"],
              ].map(([a, b, c]) => (
                <div key={a} className="flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-sm" style={{ background: "var(--surface)" }}>
                  <span className="font-semibold">{a}</span>
                  <span className="text-right"><span className="block text-xs font-semibold" style={{ color: "var(--text-2)" }}>{b}</span><span className="mt-0.5 block text-[11px]" style={{ color: "var(--text-2)" }}>{c}</span></span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold" style={{ background: "color-mix(in srgb, #2563EB 10%, transparent)", color: "#1D4ED8" }}>
              <CheckCircle2 size={14} /> Last month: 214 filings auto-created · 0 missed
            </div>
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-8">
        <div className="lp-security relative overflow-hidden rounded-[32px] p-8 text-white md:p-14" style={{ background: "linear-gradient(135deg,#0F172A 0%,#1E3A8A 60%,#4C1D95 130%)" }}>
          <div aria-hidden className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="relative grid gap-10 md:grid-cols-2">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] opacity-70"><Lock size={14} /> Enterprise-grade trust</p>
              <h2 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl md:text-4xl">Your client data stays locked down — and auditable.</h2>
              <p className="mt-4 text-[15px] leading-relaxed opacity-75 md:text-base">Role-based access, approval gates and a full audit trail on every upload, signature and status change.</p>
              <Link href="/signup" className="mt-8 inline-flex items-center gap-2 rounded-[10px] bg-white px-6 py-3 text-[15px] font-bold text-slate-900 transition-all hover:-translate-y-0.5 hover:shadow-xl">
                Secure my firm <ArrowRight size={16} />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["Role isolation", "Admins, staff & clients see only what they should."],
                ["Approval gates", "Nothing goes live without the right sign-off."],
                ["Audit trail", "Who did what, when — exportable anytime."],
                ["Encrypted + backed up", "TLS in transit, encrypted at rest."],
              ].map(([t, d]) => (
                <div key={t} className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <p className="flex items-center gap-1.5 text-[15px] font-bold"><CheckCircle2 size={15} className="text-emerald-300" /> {t}</p>
                  <p className="mt-2 text-[13px] leading-relaxed opacity-75">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-7xl px-6 py-20 md:py-24">
        <p className="eyebrow text-center">Loved by busy firms</p>
        <h2 className="mx-auto mt-4 max-w-2xl text-center text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">Tax season, without the panic</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {testimonials.map((t) => (
            <figure key={t.n} className="lp-quote flex flex-col rounded-3xl border p-7 md:p-8" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="flex gap-0.5 text-amber-400">{"★★★★★"}</div>
              <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed md:text-base">“{t.q}”</blockquote>
              <figcaption className="mt-5 border-t pt-5" style={{ borderColor: "var(--border)" }}>
                <p className="text-[15px] font-bold">{t.n}</p>
                <p className="text-[13px]" style={{ color: "var(--text-2)" }}>{t.r}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-4xl scroll-mt-20 px-6 pb-20">
        <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">Questions, answered</h2>
        <div className="mt-10 space-y-4">
          {faqs.map((f) => (
            <details key={f.q} className="lp-faq group rounded-2xl border px-6 py-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <summary className="cursor-pointer list-none text-[15px] font-bold md:text-base">
                <span className="flex items-center justify-between gap-4">{f.q}<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xl font-normal transition-transform group-open:rotate-45" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>+</span></span>
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--text-2)" }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-20">
        <div className="lp-cta relative overflow-hidden rounded-[32px] px-6 py-14 text-center text-white md:p-20" style={{ background: "linear-gradient(120deg,#0B1533 0%,#1E3A8A 55%,#4C1D95 130%)" }}>
          <div aria-hidden className="absolute left-1/2 top-0 h-64 w-[560px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
          <div className="relative mx-auto max-w-3xl">
            <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/70">
              <Sparkles size={14} className="text-amber-300" /> Join 300+ modern firms
            </p>
            <h2 className="mt-5 text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-4xl md:text-5xl">
              Ready to run tax season on autopilot?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed opacity-75 md:text-lg">
              Import clients today, send portal invites tonight, wake up to organized deadlines tomorrow.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-white px-9 py-4 text-[15px] font-bold text-slate-900 transition-all hover:-translate-y-0.5 hover:shadow-2xl sm:w-auto">
                Get Started free <ArrowRight size={17} />
              </Link>
              <Link href="/login" className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-white/40 px-9 py-4 text-[15px] font-bold text-white transition-all hover:bg-white/10 sm:w-auto">
                Log in
              </Link>
            </div>
            <p className="mt-6 text-[13px] font-medium opacity-60">Free to start · No credit card · Onboard your first client in minutes</p>
          </div>
        </div>
      </section>

      <footer className="border-t" style={{ borderColor: "var(--border)" }}>
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 text-sm md:grid-cols-5">
          <div className="md:col-span-2">
            <p className="flex items-center gap-2 font-bold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-white" style={{ background: "#2563EB" }}>T</span>
              TaxDesk <span className="text-xs font-medium" style={{ color: "var(--text-2)" }}>FilePilot OS</span>
            </p>
            <p className="mt-3 max-w-xs leading-relaxed" style={{ color: "var(--text-2)" }}>Deadline OS for modern tax firms. Filings, clients and team — calmly in one place.</p>
            <div className="mt-4"><ThemeToggle /></div>
          </div>
          {[
            ["Product", ["Features", "How it works", "Security", "Changelog"]],
            ["Company", ["About", "Careers", "Blog"]],
            ["Resources", ["Help center", "Templates", "Guides"]],
            ["Legal", ["Privacy", "Terms", "DPA"]],
          ].map(([h, links]) => (
            <div key={h as string}>
              <p className="eyebrow">{h as string}</p>
              <ul className="mt-3 space-y-2" style={{ color: "var(--text-2)" }}>
                {(links as string[]).map((l) => (
                  <li key={l}><a href={l === "Help center" ? "/login" : "#product"} className="transition-colors hover:text-[#2563EB] hover:underline">{l}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t py-4 text-center text-xs" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
          © 2026 TaxDesk · FilePilot OS. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

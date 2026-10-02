import Link from "next/link";
import { ThemeToggle, Card, Badge } from "@/components/ui";
import { ShieldCheck, Users, UserCheck, BellRing, ArrowRight, Play } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* Nav */}
      <header className="glass-bar sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl font-bold text-white" style={{ background: "#2563EB" }}>T</span>
            <span className="font-bold">TaxDesk <span className="ml-1 text-xs font-medium" style={{ color: "var(--text-2)" }}>FilePilot OS</span></span>
          </Link>
          <nav className="ml-6 hidden items-center gap-6 text-sm font-medium md:flex" style={{ color: "var(--text-2)" }}>
            <a href="#product" className="hover:text-[#2563EB]">Product</a>
            <a href="#pricing" className="hover:text-[#2563EB]">Pricing</a>
            <a href="/login" className="hover:text-[#2563EB]">Help</a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login" className="text-sm font-semibold hover:text-[#2563EB] hover:underline">Log in</Link>
            <Link href="/signup" className="btn-primary px-4 py-2.5">Get Started</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-20 text-center">
        <Badge tone="accent">Deadline OS for modern tax firms</Badge>
        <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight" style={{ textWrap: "balance" }}>
          Filings, deadlines, clients — one workspace.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed" style={{ color: "var(--text-2)" }}>
          TaxDesk gives admins firm-wide visibility, employees a focused task workspace, and clients a simple portal to upload, sign, and track.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/signup" className="btn-primary inline-flex items-center gap-2 px-6 py-3">Start Free <ArrowRight size={16} /></Link>
          <Link href="#product" className="btn-ghost inline-flex items-center gap-2 px-6 py-3"><Play size={16} /> See it in action</Link>
        </div>
        {/* Hero visual: single admin dashboard mockup in browser chrome */}
        <div className="mx-auto mt-14 max-w-4xl overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center gap-1.5 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <span className="h-2.5 w-2.5 rounded-full bg-[#DC2626]/70" /><span className="h-2.5 w-2.5 rounded-full bg-[#D97706]/70" /><span className="h-2.5 w-2.5 rounded-full bg-[#16A34A]/70" />
            <span className="ml-3 rounded-md px-3 py-1 text-xs" style={{ background: "var(--bg)", color: "var(--text-2)" }}>app.taxdesk.io/admin/dashboard</span>
          </div>
          <div className="p-6 text-left">
            <div className="rounded-xl p-5 text-white" style={{ background: "linear-gradient(135deg,#2563EB,#1D4ED8)" }}>
              <p className="text-sm opacity-80">Good morning, Amira</p>
              <p className="text-xl font-bold">Firm overview · 128 active clients</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[["Active clients", "128"], ["Due this month", "34"], ["Pending VAT", "12"], ["Done Q3", "96"]].map(([l, v]) => (
                <div key={l} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <p className="eyebrow">{l}</p>
                  <p className="tnum text-2xl font-bold">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="eyebrow mb-2">Deadline tracker</p>
              {[["Acme Ltd · VAT Q3", "Due in 3d", "#D97706"], ["Bright Co · Corp Tax", "Due in 6d", "#2563EB"], ["North LLC · Payroll", "2d overdue", "#DC2626"]].map(([a, b]) => (
                <div key={a} className="flex items-center justify-between border-t py-2 text-sm first:border-0" style={{ borderColor: "var(--border)" }}>
                  <span className="font-medium">{a}</span><span className="text-xs" style={{ color: "var(--text-2)" }}>{b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-8 text-xs tracking-wide" style={{ color: "var(--text-2)" }}>Trusted by independent tax firms</p>
      </section>

      {/* 3-role features */}
      <section id="product" className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: <ShieldCheck size={20} />, t: "For Admins", d: "Firm-wide visibility, team workload and exportable reports in one command center." },
            { icon: <Users size={20} />, t: "For Employees", d: "Assigned clients, kanban task management and scoped deadlines — nothing else." },
            { icon: <UserCheck size={20} />, t: "For Clients", d: "Upload docs, e-sign and track filing status in plain language." },
          ].map((f) => (
            <Card key={f.t} hover>
              <div className="flex h-10 w-10 items-center justify-center rounded-[10px]" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>{f.icon}</div>
              <h3 className="mt-4 text-base font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{f.d}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Highlight: deadline tracker */}
      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="card grid gap-8 p-8 md:grid-cols-2 md:p-12">
          <div>
            <p className="eyebrow">Automated deadline engine</p>
            <h2 className="mt-3 text-2xl font-semibold">Tax-rule templates that generate the next period for you.</h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
              Define VAT, corporate tax and payroll recurrences once per jurisdiction. TaxDesk auto-creates next-period filings, assigns owners, and fires reminders — no spreadsheet babysitting.
            </p>
            <Link href="/signup" className="btn-primary mt-6 inline-flex px-5 py-2.5">Try templates</Link>
          </div>
          <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <p className="eyebrow mb-3 flex items-center gap-2"><BellRing size={14} /> Upcoming auto-generated</p>
            {[["VAT Q4 · auto", "Generates Oct 1"], ["Corp Tax 2026 · auto", "Generates Jan 15"], ["Payroll Sep · auto", "Generates Sep 30"]].map(([a, b]) => (
              <div key={a} className="flex items-center justify-between rounded-xl px-3 py-3 text-sm" style={{ background: "var(--surface)" }}>
                <span className="font-medium">{a}</span><Badge tone="accent">{b}</Badge>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-semibold">Simple pricing</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { n: "Starter", p: "$29/mo", f: ["Up to 50 clients", "Deadline tracker", "Client portal"], cta: "Start free" },
            { n: "Pro", p: "$79/mo", f: ["Unlimited filings", "Auto VAT generation", "Reports + exports", "Realtime + roles"], cta: "Start free", hot: true },
            { n: "Firm", p: "Custom", f: ["SSO & audit log", "Dedicated support", "Migration help"], cta: "Contact us" },
          ].map((t) => (
            <Card key={t.n} className={t.hot ? "relative" : ""} hover>
              {t.hot && <span className="absolute -top-3 left-5"><Badge tone="accent">PRO</Badge></span>}
              <h3 className="font-semibold">{t.n}</h3>
              <p className="tnum mt-1 text-3xl font-bold">{t.p}</p>
              <ul className="mt-4 space-y-2 text-sm" style={{ color: "var(--text-2)" }}>{t.f.map((f) => <li key={f}>✓ {f}</li>)}</ul>
              <Link href="/signup" className={`${t.hot ? "btn-primary" : "btn-ghost"} mt-6 flex justify-center px-4 py-2.5`}>{t.cta}</Link>
            </Card>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--accent) 6%, var(--bg))" }}>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-3xl font-bold">Ready to run tax season on autopilot?</h2>
          <Link href="/signup" className="btn-primary mt-6 inline-flex px-8 py-3">Get Started</Link>
        </div>
      </section>

      <footer className="border-t" style={{ borderColor: "var(--border)" }}>
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm md:grid-cols-5">
          <div className="md:col-span-2">
            <p className="font-bold">TaxDesk <span className="font-normal" style={{ color: "var(--text-2)" }}>FilePilot OS</span></p>
            <p className="mt-2 max-w-xs" style={{ color: "var(--text-2)" }}>Deadline OS for modern tax firms.</p>
            <div className="mt-4"><ThemeToggle /></div>
          </div>
          {[["Product", ["Features", "Pricing", "Changelog"]], ["Company", ["About", "Careers", "Blog"]], ["Legal", ["Privacy", "Terms", "DPA"]], ["Support", ["Help center", "Contact", "Status"]]].map(([h, links]) => (
            <div key={h as string}>
              <p className="eyebrow">{h as string}</p>
              <ul className="mt-3 space-y-2" style={{ color: "var(--text-2)" }}>
                {(links as string[]).map((l) => <li key={l}><a href="/login" className="hover:text-[#2563EB] hover:underline">{l}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t py-4 text-center text-xs" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>© 2026 TaxDesk · FilePilot OS. All rights reserved.</div>
      </footer>
    </div>
  );
}

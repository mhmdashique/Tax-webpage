"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, RadialBarChart, RadialBar,
} from "recharts";
import {
  ArrowUpRight, BadgeCheck, Bell, CalendarDays, CheckCircle2, Clock3, FileText,
  FolderOpen, IndianRupee, MessagesSquare, ShieldCheck, Sparkles, Upload,
  Wallet, CircleAlert, ArrowRight, Phone, LifeBuoy, Download, Receipt,
} from "lucide-react";
import { Badge, Button, EmptyState } from "./ui";
import { useFilings, useTasks, useDocuments, usePayments, useCurrentUser, useMyClient } from "@/lib/hooks";
import { dueLabel, formatMoney, greeting, downloadFile } from "@/lib/data";
import { CLIENT_STEPPER, clientStepperIndex, stageLabel, clientActionFor, isComplete, isOverdue, displayStatus } from "@/lib/lifecycle";
import { FilingsView, PaymentsView, MessagesView, DocumentsView, SimplePage } from "./entities";
import { ClientTaskCenter, AccountView, HistoryView } from "./portals";

/* ------------------------------------------------------------------ */
/*  Premium design tokens                                              */
/* ------------------------------------------------------------------ */

const GREEN = "var(--accent)";
const GREEN_SOFT = "var(--accent-tint)";
const BRASS = "#0284C7";
const BRASS_SOFT = "#E0F2FE";
const TEAL = "#0EA5E9";
const SLATE = "var(--text-2)";
const RED = "#DC2626";
const AMBER = "#D97706";

const CHART = ["var(--accent)", "#38BDF8", "#F59E0B", "var(--accent-hover)", "#93C5FD", "#F87171"];

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/*  Shared premium primitives                                          */
/* ------------------------------------------------------------------ */

export function PremiumHead({
  eyebrow, title, sub, actions,
}: { eyebrow: string; title: string; sub: string; actions?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-5 md:p-6" style={{ border: "1px solid var(--hero-border)", background: "var(--hero-bg)" }}>
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full" style={{ background: "radial-gradient(closest-side,color-mix(in srgb, var(--accent) 14%, transparent),transparent)" }} />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-12 h-56 w-56 rounded-full" style={{ background: "radial-gradient(closest-side,rgba(56,189,248,.12),transparent)" }} />
      <div className="relative flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ background: "var(--hero-chip-bg)", color: "var(--hero-chip-tx)" }}>{eyebrow}</p>
          <h1 className="client-page-title mt-2" style={{ color: "var(--hero-text)" }}>{title}</h1>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--hero-sub)" }}>{sub}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function PremiumStat({
  label, value, hint, icon, tone = "green", spark,
}: {
  label: string; value: string; hint: string; icon: React.ReactNode;
  tone?: "green" | "brass" | "red" | "teal";
  spark?: number[];
}) {
  const tones: Record<string, { bg: string; fg: string }> = {
    green: { bg: "var(--accent-tint)", fg: "var(--accent)" },
    brass: { bg: "var(--accent-tint)", fg: "var(--accent)" },
    red: { bg: "var(--danger-bg)", fg: "var(--danger-tx)" },
    teal: { bg: "var(--accent-tint)", fg: "var(--accent)" },
  };
  const t = tones[tone];
  const max = Math.max(...(spark ?? [1]), 1);
  return (
    <div className="card group p-5 transition-all duration-200 hover:-translate-y-0.5" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          <p className="tnum mt-2 truncate text-[26px] font-bold leading-none tracking-tight">{value}</p>
          <p className="mt-2 text-xs" style={{ color: "var(--text-2)" }}>{hint}</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105" style={{ background: t.bg, color: t.fg }}>
          {icon}
        </span>
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3 flex items-end gap-1" aria-hidden>
          {spark.map((v, i) => (
            <span key={i} className="w-full rounded-full" style={{
              height: `${6 + (v / max) * 26}px`, background: i === spark.length - 1 ? GREEN : "color-mix(in srgb, var(--accent) 13%, transparent)",
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ScoreRing({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[132px] w-[132px] shrink-0">
        <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
          <circle cx="66" cy="66" r={r} fill="none" strokeWidth="12" style={{ stroke: "var(--hero-track)" }} />
          <circle cx="66" cy="66" r={r} fill="none" stroke="var(--accent)" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} style={{ transition: "stroke-dashoffset .8s ease" }} />
        </svg>
        <div className="absolute inset-0 flex rotate-0 flex-col items-center justify-center" style={{ color: "var(--text)" }}>
          <span className="tnum text-3xl font-bold">{v}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-60">/ 100</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{label}</p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
          {v >= 85 ? "Excellent — everything is filed, paid and up to date." : v >= 60 ? "Good — finish the open items to reach fully compliant." : "Needs attention — a few filings or payments are overdue."}
        </p>
        <Link href="/client/tax-filings" className="mt-2 inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: "var(--accent)" }}>
          Review filings <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}

function ChartCard({ title, sub, action, children, className = "" }: {
  title: string; sub: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cx("card flex min-w-0 flex-col p-5", className)}>
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="client-section-title">{title}</h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>{sub}</p>
        </div>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--surface-elev)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10,
  fontSize: 12, fontWeight: 600, padding: "8px 12px", boxShadow: "0 8px 24px rgba(15,23,42,.08)",
} as const;

/* ------------------------------------------------------------------ */
/*  Data helpers                                                       */
/* ------------------------------------------------------------------ */

function daysUntil(due?: string | null): number | null {
  if (!due) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  if (Number.isNaN(+d)) return null;
  return Math.round((d.getTime() - t.getTime()) / 864e5);
}

function useClientFacts() {
  const { data: filings = [], isLoading: filingsLoading } = useFilings();
  const { data: tasks = [], isLoading: tasksLoading } = useTasks();
  const { data: docs = [] } = useDocuments();
  const { data: payments = [] } = usePayments();
  const { data: me } = useCurrentUser();
  const { data: myClient } = useMyClient();

  return useMemo(() => {
    const mine = tasks.filter((t) => t.task_for === "client" && (!me?.id || !t.assigned_to || t.assigned_to === me.id));
    const open = mine.filter((t) => !["done", "cancelled"].includes(String(t.status)));
    const overdueTasks = open.filter((t) => (daysUntil(t.due_date) ?? 0) < 0);
    const dueSoon = open.filter((t) => { const n = daysUntil(t.due_date); return n !== null && n >= 0 && n <= 3; });

    const openFilings = filings.filter((f) => !isComplete(String(f.status)));
    const overdueFilings = filings.filter((f) => isOverdue(String(f.status), f.due_date));
    const doneFilings = filings.filter((f) => isComplete(String(f.status)));

    const owed = filings.reduce((s, f) => s + Number((f as { amount_owed?: number }).amount_owed ?? 0), 0);
    const refund = filings.reduce((s, f) => s + Number((f as { amount_refund?: number }).amount_refund ?? 0), 0);
    const outstanding = payments.filter((p) => p.status !== "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
    const paid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount || 0), 0);

    const totalUnits = filings.length + mine.length + payments.length;
    const doneUnits = doneFilings.length + mine.filter((t) => String(t.status) === "done").length + payments.filter((p) => p.status === "paid").length;
    const score = totalUnits === 0 ? 100 : Math.round((doneUnits / totalUnits) * 100);

    const liability = [...filings]
      .sort((a, b) => (a.period ?? "").localeCompare(b.period ?? ""))
      .slice(-8)
      .map((f) => ({
        name: (f.period ?? f.tax_type ?? "?").slice(0, 10),
        payable: Number((f as { amount_owed?: number }).amount_owed ?? 0),
        refund: Number((f as { amount_refund?: number }).amount_refund ?? 0),
      }));

    const statusMap = new Map<string, number>();
    for (const f of filings) {
      const k = stageLabel(String(f.status), true);
      statusMap.set(k, (statusMap.get(k) ?? 0) + 1);
    }
    const statusDonut = [...statusMap.entries()].map(([name, value]) => ({ name, value }));

    const payByStatus = new Map<string, number>();
    for (const p of payments) payByStatus.set(p.status, (payByStatus.get(p.status) ?? 0) + Number(p.amount || 0));
    const payBars = [...payByStatus.entries()].map(([name, value]) => ({ name: name.replace(/_/g, " "), value }))
      .sort((a, b) => b.value - a.value).slice(0, 6);

    const docTrend = [...filings].slice(0, 6).map((f, i) => ({
      name: (f.period ?? `F${i + 1}`).slice(0, 8),
      docs: (docs as unknown[]).length ? Math.max(1, Math.round((docs as unknown[]).length / Math.max(filings.length, 1))) : (i % 3) + 1,
      tasks: mine.filter((t) => t.related_filing_id === f.id).length,
    }));

    const deadlines = [...filings].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")).slice(0, 5);

    return {
      filings, openFilings, overdueFilings, doneFilings, mine, open, overdueTasks, dueSoon,
      docs: docs as { id: string; file_name: string; created_at: string }[],
      payments, owed, refund, outstanding, paid, score, liability, statusDonut, payBars, docTrend,
      deadlines, filingsLoading, tasksLoading, me, myClient,
    };
  }, [filings, tasks, docs, payments, me, myClient]);
}

/* ------------------------------------------------------------------ */
/*  PREMIUM CLIENT DASHBOARD                                           */
/* ------------------------------------------------------------------ */

export function ClientDashboardPremium() {
  const f = useClientFacts();
  const name = f.me?.name ?? "there";
  const biz = (f.myClient as { business_name?: string | null } | null)?.business_name;
  const [range, setRange] = useState<"all" | "open">("all");

  const filing = f.filings[0] as unknown as { status?: string; tax_type?: string; period?: string; due_date?: string } | undefined;
  const stageIdx = filing ? clientStepperIndex(String(filing.status)) : -1;
  const action = filing ? clientActionFor(String(filing.status)) : null;
  const actionHref = action?.includes("upload") ? "/client/documents" : action?.includes("sign") ? "/client/account" : "/client/payments";

  const sparkOwed = f.liability.map((d) => d.payable);
  const sparkDocs = [2, 3, 2, 4, 3, Math.max(4, f.docs.length)];

  return (
    <div className="client-enter space-y-5">
      {/* HERO — light */}
      <section className="relative overflow-hidden rounded-2xl p-6 md:p-8" style={{ background: "var(--hero-bg)", border: "1px solid var(--hero-border)", color: "var(--hero-text)" }}>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full" style={{ background: "radial-gradient(closest-side,color-mix(in srgb, var(--accent) 10%, transparent),transparent)" }} />
        <div className="relative grid items-center gap-6 lg:grid-cols-[1.4fr_.9fr]">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ background: "var(--hero-chip-bg)", color: "var(--hero-chip-tx)" }}>
              <Sparkles size={12} /> {biz ?? "Client workspace"} · FY 2026
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-[34px]" style={{ fontFamily: "var(--font-fraunces),Georgia,serif" }}>
              {greeting()}, {name}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
              {f.openFilings.length === 0
                ? "Everything is filed and settled. New deadlines, invoices and document requests will land here."
                : `${f.openFilings.length} open filing${f.openFilings.length === 1 ? "" : "s"} · ${f.overdueFilings.length} overdue · ${f.open.length} open task${f.open.length === 1 ? "" : "s"}. Your next step is highlighted below.`}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/client/documents" className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5" style={{ background: GREEN }}>
                <Upload size={15} /> Upload documents
              </Link>
              <Link href="/client/payments" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors hover:bg-[var(--surface-muted)]" style={{ borderColor: "var(--border)", color: GREEN }}>
                <Wallet size={15} /> Pay invoice
              </Link>
              <Link href="/client/messages" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors hover:bg-[var(--surface-muted)]" style={{ borderColor: "var(--border)", color: GREEN }}>
                <MessagesSquare size={15} /> Message accountant
              </Link>
            </div>
            {filing && (
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full px-3 py-1.5 font-semibold" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>Now: {stageLabel(String(filing.status), true)} · {filing.tax_type} {filing.period}</span>
                {action && <Link href={actionHref} className="rounded-full px-3 py-1.5 font-bold text-white" style={{ background: GREEN }}>{action} →</Link>}
              </div>
            )}
          </div>
          <div className="rounded-2xl p-5" style={{ background: "var(--hero-card-bg)", border: "1px solid var(--hero-border)" }}>
            <ScoreRing value={f.score} label="Compliance health" />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { v: String(f.doneFilings.length), l: "Filed" },
                { v: String(f.overdueTasks.length + f.overdueFilings.length), l: "Overdue" },
                { v: String(f.dueSoon.length), l: "Due soon" },
              ].map((s) => (
                <div key={s.l} className="rounded-xl px-2 py-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                  <p className="tnum text-xl font-bold" style={{ color: "var(--text)" }}>{s.v}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* KPI STRIP */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PremiumStat label="Tax payable" value={formatMoney(f.owed)} hint={`${f.openFilings.length} open filings`} icon={<IndianRupee size={19} />} tone="green" spark={sparkOwed.length ? sparkOwed : [1, 2, 3]} />
        <PremiumStat label="Expected refunds" value={formatMoney(f.refund)} hint="Settled to your bank" icon={<Receipt size={19} />} tone="teal" />
        <PremiumStat label="Outstanding invoices" value={formatMoney(f.outstanding)} hint={`${f.payments.filter((p) => p.status !== "paid").length} unpaid`} icon={<Wallet size={19} />} tone={f.outstanding > 0 ? "brass" : "green"} />
        <PremiumStat label="Documents" value={String(f.docs.length)} hint="Uploaded & shared" icon={<FolderOpen size={19} />} tone="brass" spark={sparkDocs} />
      </section>

      {/* STEPPER */}
      <section className="card p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <h2 className="client-section-title">Where your filing stands</h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>Created → Docs requested → Docs received → In preparation → Review &amp; sign → Filed → Completed</p>
          </div>
          <Link href="/client/tax-filings" className="ml-auto inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: GREEN }}>
            All filings <ArrowUpRight size={13} />
          </Link>
        </div>
        {!filing ? (
          <div className="mt-4"><EmptyState icon={<FileText size={22} />} title="No filing yet — your accountant will create one, then live status appears here" /></div>
        ) : (
          <div className="mt-5">
            <div className="flex items-center gap-0 overflow-x-auto pb-1">
              {CLIENT_STEPPER.map((s, i) => {
                const done = i < Math.max(stageIdx, 0);
                const cur = i === Math.max(stageIdx, 0);
                return (
                  <div key={s} className="flex min-w-0 flex-1 items-start">
                    <div className="flex min-w-[74px] flex-col items-center gap-1.5 text-center">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                        style={done || cur ? { background: GREEN, color: "#fff", boxShadow: cur ? "0 0 0 5px #6D28D922" : undefined } : { background: "var(--surface-muted, #F0EDE6)", color: SLATE }}>
                        {done ? "✓" : i + 1}
                      </span>
                      <span className="text-[10px] font-semibold leading-tight" style={{ color: cur ? GREEN : "var(--text-2)" }}>{s}</span>
                    </div>
                    {i < CLIENT_STEPPER.length - 1 && <span className="mx-1 mt-4 h-0.5 min-w-4 flex-1 rounded" style={{ background: done ? GREEN : "var(--border)" }} />}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--surface-muted,#F0EDE6)" }}>
              <BadgeCheck size={16} style={{ color: GREEN }} />
              <span><strong>{stageLabel(String(filing.status), true)}</strong> · {filing.tax_type} {filing.period} · {dueLabel(String(filing.due_date ?? ""))}</span>
              {action && <Link href={actionHref} className="ml-auto rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: GREEN }}>{action}</Link>}
            </div>
          </div>
        )}
      </section>

      {/* CHARTS ROW 1 */}
      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <ChartCard
          title="Tax position across periods"
          sub="Payable vs refund per filing period"
          action={
            <div className="flex gap-1.5">
              {(["all", "open"] as const).map((r) => (
                <button key={r} onClick={() => setRange(r)} className="rounded-full px-3 py-1 text-[11px] font-bold capitalize"
                  style={range === r ? { background: GREEN, color: "#fff" } : { border: "1px solid var(--border)" }}>{r}</button>
              ))}
            </div>
          }
        >
          {f.liability.length === 0 ? (
            <EmptyState icon={<FileText size={22} />} title="Liability chart appears once filings exist" />
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={range === "open" ? f.liability.filter((_, i) => i >= Math.max(0, f.liability.length - 5)) : f.liability} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="payG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GREEN} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={GREEN} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="refG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRASS} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={BRASS} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => formatMoney(Number(v))} />
                  <Area type="monotone" dataKey="payable" name="Payable" stroke={GREEN} strokeWidth={2.5} fill="url(#payG)" />
                  <Area type="monotone" dataKey="refund" name="Refund" stroke={BRASS} strokeWidth={2.5} fill="url(#refG)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 flex gap-4 text-xs font-semibold" style={{ color: "var(--text-2)" }}>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: GREEN }} /> Payable</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: BRASS }} /> Refund</span>
          </div>
        </ChartCard>

        <ChartCard title="Filing mix" sub="Share by live status" action={<Link href="/client/history" className="text-xs font-bold hover:underline" style={{ color: GREEN }}>History →</Link>}>
          {f.statusDonut.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={22} />} title="No filings yet" />
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={f.statusDonut} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3} strokeWidth={0}>
                    {f.statusDonut.map((_, i) => <Cell key={i} fill={CHART[i % CHART.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-1 space-y-1.5">
            {f.statusDonut.slice(0, 4).map((d, i) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART[i % CHART.length] }} />
                <span className="font-semibold">{d.name}</span>
                <span className="tnum ml-auto" style={{ color: "var(--text-2)" }}>{d.value}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </section>

      {/* CHARTS ROW 2 */}
      <section className="grid gap-4 xl:grid-cols-[1fr_1.5fr]">
        <ChartCard title="Payments by status" sub="Where your money stands" action={<Link href="/client/payments" className="text-xs font-bold hover:underline" style={{ color: GREEN }}>Invoices →</Link>}>
          {f.payBars.length === 0 ? (
            <EmptyState icon={<Wallet size={22} />} title="No invoices yet" />
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={f.payBars} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => formatMoney(Number(v))} />
                  <Bar dataKey="value" radius={[6, 6, 6, 6]} barSize={18}>
                    {f.payBars.map((_, i) => <Cell key={i} fill={i === 0 ? GREEN : i === 1 ? BRASS : "#38BDF8"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border p-3" style={{ background: "var(--accent-tint)", borderColor: "var(--border)" }}>
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--accent)" }}>Paid</p>
              <p className="tnum mt-1 text-lg font-bold" style={{ color: "var(--text)" }}>{formatMoney(f.paid)}</p>
            </div>
            <div className="rounded-xl border p-3" style={{ background: "var(--warn-bg)", borderColor: "var(--border)" }}>
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--warn-tx)" }}>Outstanding</p>
              <p className="tnum mt-1 text-lg font-bold" style={{ color: "var(--text)" }}>{formatMoney(f.outstanding)}</p>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Upcoming deadlines" sub="Sorted by due date — act on the red ones first" action={<Link href="/client/tax-filings" className="text-xs font-bold hover:underline" style={{ color: GREEN }}>View all →</Link>}>
          {f.deadlines.length === 0 ? (
            <EmptyState icon={<CalendarDays size={22} />} title="No deadlines scheduled" />
          ) : (
            <div className="space-y-2.5">
              {f.deadlines.map((d) => {
                const n = daysUntil(d.due_date);
                const pct = n === null ? 0 : n < 0 ? 100 : n === 0 ? 92 : Math.max(8, 100 - n * 9);
                const hot = (n ?? 99) <= 3;
                return (
                  <div key={d.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:bg-black/[0.02]" style={{ borderColor: "var(--border)" }}>
                    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-xs font-bold" style={{ background: hot ? "#F7E3E0" : GREEN_SOFT, color: hot ? RED : GREEN }}>
                      {new Date(d.due_date).getDate()}
                      <span className="text-[10px]">{new Date(d.due_date).toLocaleString("en", { month: "short" })}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{d.tax_type} · {d.period}</p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-muted,#F0EDE6)" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: hot ? RED : GREEN }} />
                      </div>
                    </div>
                    <Badge tone={hot ? "danger" : "warning"}>{dueLabel(d.due_date)}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </section>

      {/* WORKLOAD + DOCS */}
      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Workload pulse" sub="Documents vs tasks per filing" action={<Link href="/client/tasks" className="text-xs font-bold hover:underline" style={{ color: GREEN }}>My tasks →</Link>}>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={f.docTrend.length ? f.docTrend : [{ name: "—", docs: 0, tasks: 0 }]} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="docs" name="Documents" stroke={GREEN} strokeWidth={2.5} dot={{ r: 3, fill: GREEN }} />
                <Line type="monotone" dataKey="tasks" name="Tasks" stroke={BRASS} strokeWidth={2.5} dot={{ r: 3, fill: BRASS }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            {[
              { v: String(f.open.length), l: "Open tasks", hot: f.overdueTasks.length > 0 },
              { v: String(f.dueSoon.length), l: "Due ≤ 3 days", hot: false },
              { v: String(f.mine.filter((t) => String(t.status) === "done").length), l: "Completed", hot: false },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border px-2 py-2.5" style={{ borderColor: "var(--border)" }}>
                <p className="tnum text-lg font-bold" style={s.hot ? { color: RED } : undefined}>{s.v}</p>
                <p className="text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>{s.l}</p>
              </div>
            ))}
          </div>
        </ChartCard>

        <div className="card flex min-w-0 flex-col overflow-hidden p-0">
          <div className="p-5 pb-3">
            <h3 className="client-section-title">Needs your action</h3>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>Highest priority first — one tap to resolve</p>
          </div>
          <div className="flex-1 space-y-2 px-5 pb-4">
            {f.overdueTasks.length === 0 && f.overdueFilings.length === 0 && f.open.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: GREEN_SOFT }}>
                <CheckCircle2 size={20} style={{ color: GREEN }} />
                <p className="text-sm font-semibold" style={{ color: GREEN }}>All caught up — nothing needs your action.</p>
              </div>
            ) : (
              <>
                {f.overdueTasks.slice(0, 3).map((t) => (
                  <ActionRow key={t.id} icon={<CircleAlert size={16} />} tone="red" title={t.title} meta={t.due_date ? dueLabel(String(t.due_date)) : "No due date"} href="/client/tasks" cta="Open task" />
                ))}
                {f.open.slice(0, 3 - Math.min(3, f.overdueTasks.length)).map((t) => (
                  <ActionRow key={t.id} icon={<Clock3 size={16} />} tone="brass" title={t.title} meta={t.due_date ? dueLabel(String(t.due_date)) : "No due date"} href="/client/tasks" cta="Do it now" />
                ))}
                {f.overdueFilings.slice(0, 2).map((d) => (
                  <ActionRow key={d.id} icon={<FileText size={16} />} tone="red" title={`${d.tax_type} ${d.period} is overdue`} meta={dueLabel(d.due_date)} href="/client/tax-filings" cta="Review" />
                ))}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 border-t px-5 py-3.5" style={{ borderColor: "var(--border)", background: "var(--surface-muted,#F0EDE6)" }}>
            <Bell size={14} style={{ color: SLATE }} />
            <p className="text-xs" style={{ color: "var(--text-2)" }}>{biz ?? "Your workspace"} · only your own filings, documents and invoices are visible to you.</p>
            <Link href="/client/contact" className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-bold hover:underline" style={{ color: GREEN }}>
              <Phone size={12} /> Contact accountant
            </Link>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="grid gap-4 md:grid-cols-3">
        {[
          { t: "Upload centre", d: "Drop receipts, invoices & statements", h: "/client/documents", i: <Upload size={18} /> },
          { t: "Filing history", d: "Receipts & past returns, exportable", h: "/client/history", i: <Download size={18} /> },
          { t: "Help & guides", d: "Plain-language upload & signing help", h: "/client/help", i: <LifeBuoy size={18} /> },
        ].map((c) => (
          <Link key={c.t} href={c.h} className="card group flex items-center gap-3 p-5 transition-all hover:-translate-y-0.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-105" style={{ background: GREEN_SOFT, color: GREEN }}>{c.i}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{c.t}</span>
              <span className="block truncate text-xs" style={{ color: "var(--text-2)" }}>{c.d}</span>
            </span>
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" style={{ color: SLATE }} />
          </Link>
        ))}
      </section>
    </div>
  );
}

function ActionRow({ icon, tone, title, meta, href, cta }: {
  icon: React.ReactNode; tone: "red" | "brass"; title: string; meta: string; href: string; cta: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--row-bg, var(--surface))" }}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={tone === "red" ? { background: "#FEF2F2", color: RED } : { background: "#E0F2FE", color: "#0369A1" }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold" style={{ color: "var(--text)" }}>{title}</p>
        <p className="text-xs" style={{ color: "var(--text-2)" }}>{meta}</p>
      </div>
      <Link href={href} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: GREEN }}>{cta}</Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  INSIDE PAGES — premium wrappers                                   */
/* ------------------------------------------------------------------ */

function PageShell({ eyebrow, title, sub, actions, kpis, children }: {
  eyebrow: string; title: string; sub: string; actions?: React.ReactNode;
  kpis?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="client-enter space-y-5">
      <PremiumHead eyebrow={eyebrow} title={title} sub={sub} actions={actions} />
      {kpis && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kpis}</div>}
      <div className="rounded-2xl p-4 md:p-5" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
        <div className="premium-embed">{children}</div>
      </div>
    </div>
  );
}

export function ClientFilingsPremium() {
  const f = useClientFacts();
  const pct = f.filings.length ? Math.round((f.doneFilings.length / f.filings.length) * 100) : 0;
  return (
    <PageShell
      eyebrow="Compliance"
      title="Tax filings"
      sub="Every return, its live status and what happens next — in plain language."
      actions={<Link href="/client/documents" className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white" style={{ background: GREEN }}><Upload size={14} /> Upload docs</Link>}
      kpis={
        <>
          <PremiumStat label="Total filings" value={String(f.filings.length)} hint="In scope this year" icon={<FileText size={19} />} />
          <PremiumStat label="Completed" value={`${pct}%`} hint={`${f.doneFilings.length} filed & done`} icon={<BadgeCheck size={19} />} tone="teal" />
          <PremiumStat label="Overdue" value={String(f.overdueFilings.length)} hint="Act first on these" icon={<CircleAlert size={19} />} tone={f.overdueFilings.length ? "red" : "green"} />
          <PremiumStat label="Tax payable" value={formatMoney(f.owed)} hint="Across open filings" icon={<IndianRupee size={19} />} tone="brass" />
        </>
      }
    >
      <FilingsView role="client" />
    </PageShell>
  );
}

export function ClientTasksPremium() {
  const f = useClientFacts();
  const done = f.mine.filter((t) => String(t.status) === "done").length;
  const data = [{ name: "Done", value: done }, { name: "Open", value: f.open.length }];
  return (
    <PageShell
      eyebrow="Action centre"
      title="My tasks"
      sub="Everything your accountant needs from you — start a task, upload, ask, done."
      actions={<Link href="/client/messages" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "var(--border)" }}><MessagesSquare size={14} /> Ask a question</Link>}
      kpis={
        <>
          <PremiumStat label="Open" value={String(f.open.length)} hint="Needs you" icon={<Clock3 size={19} />} />
          <PremiumStat label="Due soon" value={String(f.dueSoon.length)} hint="Within 3 days" icon={<CalendarDays size={19} />} tone="brass" />
          <PremiumStat label="Overdue" value={String(f.overdueTasks.length)} hint={f.overdueTasks.length ? "Do these today" : "Nothing overdue"} icon={<CircleAlert size={19} />} tone={f.overdueTasks.length ? "red" : "green"} />
          <PremiumStat label="Completed" value={String(done)} hint="Well done" icon={<CheckCircle2 size={19} />} tone="teal" />
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[240px_1fr]">
        <div className="card flex items-center gap-4 p-5">
          <div className="h-[120px] w-[120px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ name: "x", value: f.mine.length ? Math.round((done / f.mine.length) * 100) : 0 }]} startAngle={90} endAngle={-270}>
                <RadialBar dataKey="value" cornerRadius={8} fill={GREEN} background={{ fill: "var(--surface-muted,#F0EDE6)" }} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="tnum text-2xl font-bold">{f.mine.length ? Math.round((done / f.mine.length) * 100) : 0}%</p>
            <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>tasks<br />complete</p>
          </div>
        </div>
        <div className="min-w-0"><ClientTaskCenter /></div>
      </div>
    </PageShell>
  );
}

export function ClientDocumentsPremium() {
  const f = useClientFacts();
  const recent = f.docs.slice(0, 5);
  void recent;
  return (
    <PageShell
      eyebrow="Vault"
      title="Documents"
      sub="Upload once — your checklist, version history and accountant review all stay linked."
      actions={
        <>
          <Link href="/client/tax-filings" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "var(--border)" }}>View filings</Link>
          <span className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white" style={{ background: GREEN }}><FolderOpen size={14} /> {f.docs.length} files</span>
        </>
      }
      kpis={
        <>
          <PremiumStat label="Files stored" value={String(f.docs.length)} hint="Across all filings" icon={<FolderOpen size={19} />} />
          <PremiumStat label="Open filings" value={String(f.openFilings.length)} hint="May need uploads" icon={<FileText size={19} />} tone="brass" />
          <PremiumStat label="Overdue items" value={String(f.overdueFilings.length + f.overdueTasks.length)} hint="Upload to clear" icon={<CircleAlert size={19} />} tone={f.overdueFilings.length + f.overdueTasks.length ? "red" : "green"} />
          <PremiumStat label="Compliance" value={`${f.score}`} hint="Health score / 100" icon={<ShieldCheck size={19} />} tone="teal" />
        </>
      }
    >
      <DocumentsView role="client" />
    </PageShell>
  );
}

export function ClientPaymentsPremium() {
  const f = useClientFacts();
  return (
    <PageShell
      eyebrow="Billing"
      title="Payments"
      sub="Invoices from your firm, GST challans and receipts — export anything in one tap."
      actions={
        <>
          <Button variant="ghost" onClick={() => downloadFile("invoices.csv", f.payments.map((p) => `${p.invoice_number},${p.amount},${p.status}`).join("\n"))}><Download size={14} /> Export</Button>
          <span className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white" style={{ background: GREEN }}><Wallet size={14} /> {formatMoney(f.outstanding)} due</span>
        </>
      }
      kpis={
        <>
          <PremiumStat label="Outstanding" value={formatMoney(f.outstanding)} hint="Across unpaid invoices" icon={<Wallet size={19} />} tone={f.outstanding ? "brass" : "green"} />
          <PremiumStat label="Paid to date" value={formatMoney(f.paid)} hint="Thank you" icon={<BadgeCheck size={19} />} tone="teal" />
          <PremiumStat label="Tax payable" value={formatMoney(f.owed)} hint="Filing liability" icon={<IndianRupee size={19} />} />
          <PremiumStat label="Refunds" value={formatMoney(f.refund)} hint="Expected back" icon={<Receipt size={19} />} tone="teal" />
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
        <ChartCard title="Cash snapshot" sub="Paid vs outstanding">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={[{ name: "Paid", value: Math.max(f.paid, 0.001) }, { name: "Outstanding", value: Math.max(f.outstanding, 0.001) }]} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={4} strokeWidth={0}>
                  <Cell fill={GREEN} /><Cell fill={BRASS} />
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => formatMoney(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 text-xs font-semibold" style={{ color: "var(--text-2)" }}>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: GREEN }} /> Paid</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: BRASS }} /> Outstanding</span>
          </div>
        </ChartCard>
        <div className="min-w-0"><PaymentsView role="client" /></div>
      </div>
    </PageShell>
  );
}

export function ClientHistoryPremium() {
  const f = useClientFacts();
  const past = f.filings.filter((x) => ["filed", "completed"].includes(displayStatus(String(x.status), x.due_date)) || isComplete(String(x.status)));
  return (
    <PageShell
      eyebrow="Archive"
      title="Filing history"
      sub="Every filed return with downloadable receipts — your permanent record."
      actions={<span className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold" style={{ background: GREEN_SOFT, color: GREEN }}><BadgeCheck size={14} /> {past.length} filed</span>}
      kpis={
        <>
          <PremiumStat label="Filed returns" value={String(past.length)} hint="All time" icon={<BadgeCheck size={19} />} tone="teal" />
          <PremiumStat label="Total filings" value={String(f.filings.length)} hint="In scope" icon={<FileText size={19} />} />
          <PremiumStat label="Refunds received" value={formatMoney(f.refund)} hint="Expected & settled" icon={<Receipt size={19} />} tone="teal" />
          <PremiumStat label="Tax paid" value={formatMoney(f.paid)} hint="Via invoices" icon={<IndianRupee size={19} />} tone="brass" />
        </>
      }
    >
      <HistoryView />
    </PageShell>
  );
}

export function ClientMessagesPremium() {
  return (
    <PageShell
      eyebrow="Inbox"
      title="Messages"
      sub="A direct line to your accountant — replies land here, not in email threads."
      actions={<Link href="/client/contact" className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white" style={{ background: GREEN }}><Phone size={14} /> Contact accountant</Link>}
    >
      <MessagesView embedded />
    </PageShell>
  );
}

export function ClientAccountPremium() {
  const f = useClientFacts();
  return (
    <PageShell
      eyebrow="Profile"
      title="Account & profile"
      sub="Your business details, security, notifications and e-signature live here."
      actions={<span className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold" style={{ background: GREEN_SOFT, color: GREEN }}><ShieldCheck size={14} /> Score {f.score}/100</span>}
    >
      <AccountView role="client" />
    </PageShell>
  );
}

const HELP_FAQS = [
  { q: "How do I upload a document?", a: "Open Documents → pick country, tax type & period → Upload. It links to your checklist automatically." },
  { q: "How do I e-sign?", a: "Open Account → Signature → type or draw → Save. Your accountant is notified instantly." },
  { q: "How do I pay?", a: "Open Payments → find the invoice → pay. The receipt downloads from History once settled." },
  { q: "Who sees my data?", a: "Only you, your assigned accountant and admins. Nothing is shared across clients." },
];

export function ClientHelpFaqs() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {HELP_FAQS.map((x) => (
        <div key={x.q} className="rounded-2xl p-5" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
          <p className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--text)" }}><LifeBuoy size={15} style={{ color: GREEN }} /> {x.q}</p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{x.a}</p>
        </div>
      ))}
    </div>
  );
}

export function ClientHelpPremium() {
  return (
    <PageShell
      eyebrow="Support"
      title="Help & support"
      sub="Plain-language guides for uploading, signing and paying — same clean layout as every client page."
      actions={<span className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}><LifeBuoy size={14} /> 4 guides</span>}
    >
      <ClientHelpFaqs />
    </PageShell>
  );
}

export function ClientContactPremium() {
  const f = useClientFacts();
  return (
    <PageShell
      eyebrow="Concierge"
      title="Contact accountant"
      sub="Skip the inbox maze — reach the person handling your file. Same header, cards and actions as every client page."
      actions={<span className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white" style={{ background: GREEN }}><Phone size={14} /> Online now</span>}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl p-6 md:col-span-2" style={{ border: "1px solid var(--hero-border)", background: "var(--hero-bg)" }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>Your firm</p>
          <h2 className="mt-1 text-2xl font-bold" style={{ fontFamily: "var(--font-fraunces),Georgia,serif", color: "var(--hero-text)" }}>{(f.myClient as { business_name?: string } | null)?.business_name ?? "Your accountant is online"}</h2>
          <p className="mt-2 max-w-lg text-sm" style={{ color: "var(--text-2)" }}>Open filings: {f.openFilings.length} · open tasks: {f.open.length} · outstanding: {formatMoney(f.outstanding)}. Include your filing period in the first line for the fastest reply.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/client/messages" className="rounded-lg px-4 py-2.5 text-sm font-bold text-white" style={{ background: GREEN }}><MessagesSquare size={14} className="mr-1 inline" /> Open messages</Link>
            <Link href="/client/tasks" className="rounded-lg border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "var(--border)", color: GREEN }}>View my tasks</Link>
          </div>
        </div>
        <div className="rounded-2xl p-5" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
          <p className="client-section-title" style={{ color: "var(--text)" }}>Response promise</p>
          <div className="mt-3 space-y-2 text-sm">
            {[["Urgent / overdue", "< 4 hrs"], ["Payments", "< 1 day"], ["General", "< 2 days"]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <span className="font-semibold" style={{ color: "var(--text)" }}>{k}</span><span className="tnum font-bold" style={{ color: GREEN }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4"><SimplePage title="Prefer to write now?" sub="Message your accountant directly." ctaHref="/client/messages" ctaLabel="Open messages" /></div>
    </PageShell>
  );
}
